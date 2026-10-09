# Despliega las reglas del backend y la web en el proyecto Firebase quintoyparque.
# Requiere clonar quintoyparque-frontend y quintoyparque-backend en la misma carpeta.
# Autenticar antes con: firebase login
[CmdletBinding()]
param([switch]$SoloHosting)

$ErrorActionPreference = 'Stop'
$projectId = 'quintoyparque'
$frontendDir = $PSScriptRoot
$backendDir = Join-Path (Split-Path -Parent $frontendDir) 'quintoyparque-backend'

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
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
        & firebase deploy --only 'firestore:rules' --project $projectId
        if ($LASTEXITCODE -ne 0) { throw 'Error en despliegue de reglas. Hosting NO se desplegara.' }
    } finally { Pop-Location }
}

Write-Host '2/2 - Desplegando Firebase Hosting...'
Push-Location $frontendDir
try {
    & firebase deploy --only hosting --project $projectId
    if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar Hosting.' }
} finally { Pop-Location }
Write-Host 'Despliegue solicitado correctamente. Comprueba: https://quintoyparque.web.app/'
