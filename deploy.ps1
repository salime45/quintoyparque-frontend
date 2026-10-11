# Despliegue manual desde quintoyparque-frontend (repositorio único).
[CmdletBinding()]
param([switch]$SoloHosting, [switch]$SoloReglas, [switch]$SoloIndices)
$ErrorActionPreference = 'Stop'
$projectId = 'quintoyparque'
$firebaseCmd = if (Get-Command firebase.cmd -ErrorAction SilentlyContinue) {
    'firebase.cmd'
} elseif (Get-Command firebase -ErrorAction SilentlyContinue) {
    'firebase'
} else { $null }
if (-not $firebaseCmd) { throw 'Instala Firebase CLI: npm install -g firebase-tools' }
if (@($SoloHosting, $SoloReglas, $SoloIndices).Where({ $_ }).Count -gt 1) {
    throw 'Usa solo una de las opciones de despliegue.'
}
Push-Location $PSScriptRoot
try {
    if ($SoloIndices) {
        Write-Warning 'Desplegar indices vacios puede eliminar indices creados en Firebase.'
        & $firebaseCmd deploy --project $projectId --only 'firestore:indexes'
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar indices.' }
    } elseif ($SoloReglas) {
        & $firebaseCmd deploy --project $projectId --only 'firestore:rules'
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar reglas.' }
    } else {
        & $firebaseCmd deploy --project $projectId --only 'firestore:rules'
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar reglas. Hosting NO se desplegara.' }
        & $firebaseCmd deploy --project $projectId --only hosting
        if ($LASTEXITCODE -ne 0) { throw 'Error al desplegar Hosting.' }
    }
} finally { Pop-Location }
Write-Host 'Despliegue terminado.'
