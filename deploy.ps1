# Despliegue manual desde quintoyparque-frontend (repositorio único).
[CmdletBinding()]
param([switch]$SoloHosting, [switch]$SoloReglas)
$ErrorActionPreference = 'Stop'
$projectId = 'quintoyparque'
$firebaseCmd = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) {
    'firebase.cmd'
} elseif (Get-Command firebase -ErrorAction SilentlyContinue) {
    'firebase'
} else { $null }
if (-not $firebaseCmd) { throw 'Instala Firebase CLI: npm install -g firebase-tools' }
if ($SoloHosting -and $SoloReglas) {
    throw 'Usa solo una de las opciones de despliegue.'
}
Push-Location $PSScriptRoot
try {
    if ($SoloReglas) {
        & $firebaseCmd deploy --project $projectId --only 'firestore:rules'
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar reglas.' }
    } else {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Error al instalar dependencias.' }
        & npm.cmd run build:geo
        if ($LASTEXITCODE -ne 0) { throw 'Error al compilar el frontend.' }
        & $firebaseCmd deploy --project $projectId --only 'firestore:rules'
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar reglas. Hosting NO se desplegará.' }
        & $firebaseCmd deploy --project $projectId --only hosting
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar Hosting.' }
    }
} finally { Pop-Location }
Write-Host 'Despliegue terminado.'
