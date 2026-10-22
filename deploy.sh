#!/usr/bin/env bash
# Despliegue manual de Quinto y Parque desde este único repositorio.
# Uso: bash deploy.sh [all|hosting|rules]
set -euo pipefail
PROJECT_ID="quintoyparque"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-all}"
if ! command -v firebase >/dev/null 2>&1; then
  echo "Instala Firebase CLI: npm install -g firebase-tools" >&2
  exit 1
fi
cd "$ROOT"
case "$MODE" in
  all|hosting)
    npm ci --no-audit --no-fund
    npm run build:geo
    # Publicamos siempre reglas antes de Hosting, también en modo manual.
    firebase deploy --project "$PROJECT_ID" --only firestore:rules
    firebase deploy --project "$PROJECT_ID" --only hosting
    ;;
  rules)
    firebase deploy --project "$PROJECT_ID" --only firestore:rules
    ;;
  *)
    echo "Modo inválido: $MODE. Usa all, hosting o rules." >&2
    exit 1
    ;;
esac
echo "Completado. Proyecto $PROJECT_ID."
