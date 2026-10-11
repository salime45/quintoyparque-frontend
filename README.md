# Quinto y Parque · Frontend

Web móvil para encontrar cafeterías, bares y restaurantes cerca de parques infantiles en Valencia. Proyecto Firebase: `quintoyparque` · [Web](https://quintoyparque.web.app/).

## Datos geográficos (versionados en GitHub)

La aplicación **no hace consultas a Overpass desde el navegador** y **los despliegues ordinarios tampoco necesitan Overpass**.

- [`public/data/osm-places.json`](public/data/osm-places.json): archivo versionado con ubicaciones de OpenStreetMap (parques y locales). Incluye fecha, cobertura y licencia.
- [`public/index.html`](public/index.html): lee el JSON a través de Firebase Hosting (`/data/osm-places.json`) y calcula los establecimientos cercanos a los parques, con distancias configurables de 60, 100 o 150 metros en línea recta.
- [`scripts/refresh-osm.mjs`](scripts/refresh-osm.mjs): obtiene datos de Overpass **solo** al actualizar el catálogo.
- [`.github/workflows/refresh-osm.yml`](.github/workflows/refresh-osm.yml): actualiza semanalmente (lunes, 04:20 UTC) o al ejecutarlo manualmente, valida el JSON, crea un commit en `main` si cambian las ubicaciones y publica las reglas de Firestore seguidas de Hosting. Si falla Overpass, conserva el catálogo versionado.
- [`.github/workflows/firebase-hosting-merge.yml`](.github/workflows/firebase-hosting-merge.yml): prueba y despliega reglas de Firestore y luego Hosting en cada push a `main`, sin descargar datos externos.
- [`.github/workflows/firebase-hosting-pull-request.yml`](.github/workflows/firebase-hosting-pull-request.yml): utiliza el mismo catálogo versionado en las vistas previas de PR.

Los commits hechos por `GITHUB_TOKEN` no lanzan otros workflows de `push`, por eso la acción de actualización **también despliega Hosting** si el catálogo cambia.

### Actualización manual

[GitHub Actions → Update OpenStreetMap catalogue](https://github.com/salime45/quintoyparque-frontend/actions/workflows/refresh-osm.yml) → **Run workflow** (rama `main`). No hacen falta credenciales adicionales: se reutiliza el secreto de Firebase Hosting existente.

### Cobertura

El catálogo inicial contiene 1.446 parques infantiles y 3.138 locales (4.584 ubicaciones) de Valencia y su entorno. No significa que todos los bares tengan terraza, ni que sea visible el parque desde ella. La cobertura se limita a un rectángulo aproximado de latitud 39.28–39.67 y longitud -0.62–-0.20. Estos números cambiarán en futuras actualizaciones.

**Créditos y licencia:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Los datos de ubicaciones redistribuidos conservan su atribución y licencia. Si se publica una base derivada, revisar los requisitos de la ODbL.

## Funcionalidades

- Mapa Leaflet/OpenStreetMap, geolocalización opcional y filtros.
- Solo se muestran parejas parque-establecimiento a menos de 60 metros por defecto (ampliable a 100 o 150 metros); ambos puntos deben estar visibles en el mapa.
- Datos OSM versionados y disponibles incluso cuando los servidores Overpass fallan.
- Distinción entre locales candidatos no verificados y lugares publicados desde Firestore.
- Acceso Google para proponer sitios, pendientes de moderación.

## Despliegue

El flujo habitual es hacer push a `main` y comprobar el workflow **Deploy to Firebase Hosting on merge**.

Para un despliegue excepcional desde tu equipo:

```bash
firebase login
firebase deploy --project quintoyparque --only hosting
```

El archivo `public/data/osm-places.json` debe existir en tu clon del repo. No ejecutes `firebase init`: ya están configurados `firebase.json` y `.firebaserc`.

## Configuración única de Firebase (Hosting y Firestore)

El repositorio actual incluye **frontend, reglas, índices y pruebas de Firestore**. El antiguo [quintoyparque-backend](https://github.com/salime45/quintoyparque-backend) se conserva únicamente como histórico; no es una fuente de despliegues.

- `firebase.json`: Hosting y Firestore en el mismo proyecto `quintoyparque`.
- `firestore.rules`: reglas de seguridad copiadas sin cambios del backend original.
- `firestore.indexes.json`: índices declarados (actualmente vacío).
- `tests/firestore.rules.test.cjs`: pruebas con el emulador de Firestore.
- `package.json`: herramientas de tests y Firebase CLI.
- `.github/actions/deploy-live/action.yml`: prueba frontend y Firestore, **despliega primero las reglas y después Hosting**.
- `.github/workflows/firebase-hosting-merge.yml`: despliegue a producción en cada push a `main`.
- `.github/workflows/refresh-osm.yml`: cuando actualiza el catálogo OSM, también despliega reglas antes de Hosting.

En los pull requests se ejecutan las pruebas y se publica solo una preview de Hosting: **no se modifican reglas de producción desde ramas de PR**.

Se reutiliza el secreto de GitHub existente `FIREBASE_SERVICE_ACCOUNT_QUINTOYPARQUE`, que debe tener permiso `roles/firebaserules.admin` (o equivalente) en Firebase. Si el paso de publicar reglas devuelve 403, hay que añadir permisos a la cuenta del secreto; no hay que enviar credenciales por chat.

**Índices:** por seguridad no se despliegan automáticamente: el archivo actual está vacío y aplicarlo podría eliminar índices existentes. Para gestionarlos más adelante: revisar `firestore.indexes.json` y ejecutar explícitamente `firebase deploy --only firestore:indexes --project quintoyparque`.

### Pruebas en local

Requieren Node.js 22+ y Java 21+ para el emulador:

```bash
npm install
npm test
npm run test:firestore
```

Los despliegues manuales desde este único repositorio pueden hacerse con `bash deploy.sh` (reglas y Hosting), `bash deploy.sh hosting` o `bash deploy.sh rules`; en Windows, `deploy.ps1` soporta `-SoloHosting` y `-SoloReglas`.

## Limitaciones actuales

La cercanía es en línea recta, no tiempo de caminata. Los locales OSM pueden estar cerrados, no tener terraza o estar separados por una carretera. El estado de verificación y las opiniones comunitarias pertenecen a Firestore, no se mezclan con el catálogo externo. Las reseñas todavía no tienen una interfaz completa y las sugerencias requieren moderación.
