#!/usr/bin/env bash
# Despliegue manual de Quinto y Parque desde este único repositorio.
# Uso: bash deploy.sh [all|hosting|rules|indexes]
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
  all)
    firebase deploy --project "$PROJECT_ID" --only firestore:rules
    firebase deploy --project "$PROJECT_ID" --only hosting
    ;;
  hosting)
    # Igual que en CI: no desplegar Hosting sin reglas.
    firebase deploy --project "$PROJECT_ID" --only firestore:rules
    firebase deploy --project "$PROJECT_ID" --only hosting
    ;;
  rules) firebase deploy --project "$PROJECT_ID" --only firestore:rules ;;
  indexes)
    echo "ATENCION: el archivo de indices vacio puede eliminar indices del proyecto."
    firebase deploy --project "$PROJECT_ID" --only firestore:indexes
    ;;
  *) echo "Modo invalido: $MODE. Usa all, hosting, rules o indexes." >&2; exit 1 ;;
esac
echo "Completado. Proyecto $PROJECT_ID."
