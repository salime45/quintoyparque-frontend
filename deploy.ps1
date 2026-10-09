# Despliega las reglas del backend y la web en Firebase quintoyparque.
# Clona quintoyparque-frontend y quintoyparque-backend en la misma carpeta.
# Autentica previamente con: firebase login (o firebase.cmd login en Windows).
[CmdletBinding()]
param([switch]$SoloHosting)

$ErrorActionPreference = 'Stop'
$projectId = 'quintoyparque'
$frontendDir = $PSScriptRoot
$backendDir = Join-Path (Split-Path -Parent $frontendDir) 'quintoyparque-backend'

# Evitar problemas de politicas de ejecucion de los shims npm *.ps1 en Windows.
$firebaseCmd = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) { 'firebase.cmd' } elseif (Get-Command firebase -ErrorAction SilentlyContinue) { 'firebase' } else { $null }
if (-not $firebaseCmd) {
    throw 'Firebase CLI no instalado. Ejecuta: npm install -g firebase-tools'
}
if (-not (Test-Path (Join-Path $frontendDir 'firebase.json'))) {
    throw 'No se encuentra firebase.json en el repositorio frontend.'
}
if (-not $SoloHosting -and -not (Test-Path (Join-Path $backendDir 'firestore.rules'))) {
    throw 'Clona quintoyparque-backend como carpeta hermana de quintoyparque-frontend.'
}

if (-not $SoloHosting) {
    Write-Host '1/2 - Desplegando reglas de seguridad de Cloud Firestore...'
    Push-Location $backendDir
    try {
        & $firebaseCmd deploy --only 'firestore:rules' --project $projectId
        if ($LASTEXITCODE -ne 0) { throw 'Fallo al desplegar reglas. No se desplegara Hosting.' }
    } finally { Pop-Location }
}

Write-Host '2/2 - Desplegando Firebase Hosting...'
Push-Location $frontendDir
try {
    & $firebaseCmd deploy --only hosting --project $projectId
    if ($LASTEXITCODE -ne 0) { throw 'Fallo al desplegar Hosting.' }
} finally { Pop-Location }
Write-Host 'Despliegue completado. Verifica: https://quintoyparque.web.app/'
