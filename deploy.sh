#!/usr/bin/env bash
# Firebase project: quintoyparque.
# Ejecucion: bash deploy.sh
# Clonar quintoyparque-backend y quintoyparque-frontend en la misma carpeta.
set -euo pipefail

PROJECT_ID="quintoyparque"
FRONTEND_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$FRONTEND_DIR")/quintoyparque-backend"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI no disponible. Instala firebase-tools o usa Google Cloud Shell." >&2
  exit 1
fi
if [[ ! -f "$BACKEND_DIR/firestore.rules" ]]; then
  echo "Falta $BACKEND_DIR/firestore.rules. Clona el repositorio backend como carpeta hermana." >&2
  exit 1
fi

echo "1/2: Desplegando reglas de Firestore..."
(cd "$BACKEND_DIR" && firebase deploy --project "$PROJECT_ID" --only firestore:rules)

echo "2/2: Desplegando web en Firebase Hosting..."
(cd "$FRONTEND_DIR" && firebase deploy --project "$PROJECT_ID" --only hosting)

echo "Despliegue completado. Comprueba https://quintoyparque.web.app/"
