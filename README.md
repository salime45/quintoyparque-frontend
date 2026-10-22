# Quinto y Parque · Frontend

Aplicación Vue 3 + Vite, con Leaflet y Firebase, para encontrar cafeterías, bares, restaurantes y locales de comida rápida cerca de parques infantiles en Valencia. Proyecto Firebase: `quintoyparque` · [Web](https://quintoyparque.web.app/).

## Estructura y desarrollo

- `index.html`: entrada de Vite y metadatos para buscadores y enlaces compartidos.
- `src/App.vue` y `src/components/`: cabecera, buscador, filtros, resultados, mapa, fichas y diálogos de propuestas y reseñas.
- `src/composables/`: estado reactivo del explorador, sesión y comportamiento accesible del menú móvil.
- `src/services/`: catálogo OSM, configuración pública de Firebase y operaciones de autenticación y Firestore. Las reseñas mantienen sus tres documentos relacionados mediante un lote atómico.
- `src/lib/`: proximidad, búsqueda, validación de reseñas y selección de resultados; reutiliza la lógica del frontend anterior.
- `public/`: catálogo, imágenes de marca y página 404, copiados por Vite al compilar.
- `tests/components/`: pruebas de componentes Vue con servicios simulados; `tests/e2e/`: pruebas de navegador en escritorio y móvil con catálogo controlado y conexiones externas bloqueadas.

`npm run dev` inicia el servidor local. `npm run build` genera `dist/` y `npm run preview` permite revisar esa compilación. El mapa necesita conexión a OpenStreetMap para las teselas; el buscador usa el catálogo local. Las operaciones de cuenta y reseñas requieren Firebase.

`npm test` ejecuta las pruebas de dominio y componentes. `npm run test:firestore` valida las reglas con un proyecto de emulador. Las pruebas de navegador (`npm run test:e2e`) requieren una compilación previa y Chromium instalado con `npx playwright install chromium`. No realizan escrituras en Firebase de producción.

## Datos geográficos (versionados en GitHub)

La aplicación **no hace consultas a Overpass desde el navegador** y **los despliegues ordinarios tampoco necesitan Overpass**.

- [`public/data/osm-places.json`](public/data/osm-places.json): archivo versionado con ubicaciones de OpenStreetMap (parques y locales). Incluye fecha, cobertura y licencia.
- [`src/services/catalog.js`](src/services/catalog.js): lee el JSON a través de Firebase Hosting (`/data/osm-places.json`); [`src/composables/useExplorer.js`](src/composables/useExplorer.js) coordina los establecimientos cercanos a los parques, con distancias configurables de 60, 100 o 150 metros en línea recta, además de incluir automáticamente locales situados dentro del mismo parque que una zona infantil.
- [`scripts/refresh-osm.mjs`](scripts/refresh-osm.mjs): descarga lugares y polígonos OSM de parques y jardines al actualizar el catálogo.
- [`scripts/osm-park-geometry.mjs`](scripts/osm-park-geometry.mjs): determina automáticamente qué cafeterías y zonas infantiles están dentro de la misma geometría, sin listas manuales. El navegador recibe solo los emparejamientos calculados.
- [`.github/workflows/refresh-osm.yml`](.github/workflows/refresh-osm.yml): actualiza semanalmente (lunes, 04:20 UTC) o al ejecutarlo manualmente, valida el JSON, crea un commit en `main` si cambian las ubicaciones y publica las reglas de Firestore seguidas de Hosting. Si falla Overpass, conserva el catálogo versionado.
- [`.github/workflows/firebase-hosting-merge.yml`](.github/workflows/firebase-hosting-merge.yml): prueba y despliega reglas de Firestore y luego Hosting en cada push a `main`, sin descargar datos externos.
- [`.github/workflows/firebase-hosting-pull-request.yml`](.github/workflows/firebase-hosting-pull-request.yml): utiliza el mismo catálogo versionado en las vistas previas de PR.

Los commits hechos por `GITHUB_TOKEN` no lanzan otros workflows de `push`, por eso la acción de actualización **también despliega Hosting** si el catálogo cambia.

### Actualización manual

[GitHub Actions → Update OpenStreetMap catalogue](https://github.com/salime45/quintoyparque-frontend/actions/workflows/refresh-osm.yml) → **Run workflow** (rama `main`). No hacen falta credenciales adicionales: se reutiliza el secreto de Firebase Hosting existente.

### Cobertura

El catálogo inicial contenía aproximadamente 1.450 zonas infantiles y 3.150 locales; la importación actual también recoge establecimientos OSM etiquetados como `amenity=fast_food` (por ejemplo, bocadillerías y cadenas de comida rápida) en Valencia y alrededores. No significa que todos los bares tengan terraza, ni que sea visible el parque desde ella. La cobertura se limita a un rectángulo aproximado de latitud 39.28–39.67 y longitud -0.62–-0.20. Estos números cambiarán en futuras actualizaciones.

**Créditos y licencia:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Los datos de ubicaciones redistribuidos conservan su atribución y licencia. Si se publica una base derivada, revisar los requisitos de la ODbL.

El importador incluye `amenity=cafe`, `amenity=bar`, `amenity=restaurant` y `amenity=fast_food`. Un sitio solo puede mostrarse si la ubicación está registrada en OSM (o está publicado por la comunidad en Firestore) y cumple el criterio geográfico; esta ampliación no inventa bares ausentes de la fuente de datos.

## Buscador de texto

La barra **¿Qué sitio buscas?** encuentra locales y parques infantiles
por nombre, calles registradas en OSM y nombres de parques urbanos
(por ejemplo, **Parc de Marxalenes**), incluso cuando están fuera de
la parte del mapa que se está visualizando. Devuelve sugerencias
mientras escribes; al elegir una opción, centra el mapa y abre la ficha
del local o de la zona infantil.

- Busca exclusivamente en el catálogo OSM versionado, sin llamadas a
  servicios externos de geocodificación. También muestra locales
  publicados y aprobados en Firestore.
- Solo ofrece locales que cumplen el radio seleccionado (60, 100 o
  150 m) o que están dentro del mismo parque que una zona infantil.
  No amplía los resultados a bares alejados o sin relación con parques.
- Permite buscar sin tildes, con varias palabras o usando «parque»
  en lugar de «parc». Las calles solo se encuentran cuando existe
  ese dato en OpenStreetMap.
- Las sugerencias se pueden recorrer con el teclado; Enter selecciona
  y Escape cierra. La selección coloca a la vista el local y su zona
  infantil relacionada cuando están identificados.

La búsqueda no sustituye a la navegación libre por el mapa ni valida
terrazas o visibilidad desde los locales.

## Detección automática de locales dentro del mismo parque

El radio predeterminado es de **60 m de una zona infantil**, ampliable a 100 y
150 m. Además, la actualización semanal de OpenStreetMap descarga los **límites
geográficos de parques y jardines** (`leisure=park` y `leisure=garden`).
Si un bar/cafetería y una zona infantil pertenecen al **mismo recinto poligonal**,
se vinculan automáticamente sin importar la distancia entre ambos.

El proceso admite polígonos complejos, agujeros y relaciones multipolígono,
sin mezclar componentes disjuntos del mismo parque. Los establecimientos
situados fuera de esos recintos siguen sujetos al radio elegido. La web
muestra la distancia real hasta la zona infantil y advierte que la
visibilidad desde la terraza no está verificada.

Los emparejamientos se generan en `public/data/osm-places.json` (`schemaVersion:
2`, `parkMatches`) a partir de datos OSM durante cada actualización. No existe
ningún archivo de excepciones manuales ni nombres de locales codificados.
Si en OSM falta el perímetro o la ubicación de un lugar, la detección depende
del radio de proximidad habitual. La actualización conserva el catálogo anterior
si Overpass devuelve datos incompletos.

## Funcionalidades

- Mapa Leaflet/OpenStreetMap, geolocalización opcional y filtros.
- Buscador global por texto para bares, cafeterías, parques y calles de toda la cobertura, con sugerencias y acceso directo al mapa.
- Se muestran parejas parque-establecimiento a menos de 60 metros por defecto (ampliable a 100 o 150 metros), y también locales dentro del mismo recinto OSM con zona infantil aunque esta quede fuera de la vista.
- Datos OSM versionados y disponibles incluso cuando los servidores Overpass fallan.
- Distinción entre locales candidatos no verificados y lugares publicados desde Firestore.
- Acceso Google para proponer sitios, pendientes de moderación.
- **Reseñas de bares del mapa**: 1–5 estrellas, visibilidad del parque desde la terraza, cruce de calle y comentario opcional. Se publican inmediatamente al enviarlas con sesión de Google.
- **Locales verificados por la comunidad**: cualquier bar con una o más reseñas publicadas muestra el distintivo de verificado y aparece en el filtro «Solo verificados». El distintivo indica que alguien lo ha reseñado, no una inspección independiente.
- **Mis reseñas**: listado personal, privado por usuario y editable (puntuación, visibilidad, cruce de calle y comentario).

## Reseñas, distintivo de verificado y edición

Los locales de OpenStreetMap se reconocen por su ID estable, por ejemplo `node/12258686901` → `node_12258686901`.

- `osmReviews/{venueKey}/reviews/{uid}`: la reseña publicada. Cada usuario autenticado puede crear una por local y editar después solo `rating`, `parkVisible`, `streetCrossing` y `comment`; `updatedAt` se actualiza automáticamente. No puede cambiar el autor, el local, el parque ni la fecha original.
- `osmReviews/{venueKey}`: ficha pública mínima con `reviewed: true`, nombre y fecha de revisión. El frontend carga todos estos documentos en una sola consulta para pintar la cerveza con distintivo y habilitar el filtro de verificados, sin consultas independientes a cada bar ni índices personalizados.
- `userReviews/{uid}/items/{venueKey}`: copia personal de la reseña, accesible exclusivamente por su propietario y por administradores. Permite construir «Mis reseñas» sin un índice global de reseñas. Las reglas comprueban que la copia coincida con la reseña pública.
- El cliente crea/edita la reseña y actualiza los registros relacionados mediante **un lote atómico de Firestore**. Las reglas validan que el documento de resumen esté respaldado por una reseña publicada.
- Las reseñas anteriores a estos índices auxiliares se incorporan cuando su **autor vuelve a abrir ese local con sesión iniciada**. El usuario verá esa reseña en «Mis reseñas» a partir de entonces; no hay migración global ni escaneo costoso del catálogo.
- El texto «Verificado» significa **reseñado por al menos una persona**, no verificación oficial de terraza, visibilidad, seguridad ni calidad del local. Si un administrador elimina la última reseña de un bar, también debe borrar su documento resumen `osmReviews/{venueKey}` para que desaparezca el distintivo.
- Un administrador puede intervenir desde Firebase Console ante opiniones inapropiadas. Los locales sugeridos por usuarios (`suggestions`) siguen necesitando aprobación antes de publicarse.

## Despliegue

### Vista previa al compartir en WhatsApp

`public/index.html` incluye metadatos Open Graph estáticos para que la tarjeta
pueda leerse sin ejecutar JavaScript. La portada es
`public/brand/whatsapp-cover-v1.png` (1200 × 630 px), con URL HTTPS absoluta.
El título, la descripción y la portada presentan Valencia y alrededores.

Después de desplegar Hosting, pegar `https://quintoyparque.web.app/` en un chat
de prueba y esperar a que aparezca la tarjeta antes de enviar. Comprobar imagen,
título y apertura del mapa en Android e iPhone. La prueba local de diseño no
confirma la tarjeta real ni los permisos de ubicación y acceso Google dentro
del navegador de WhatsApp. Si se cambia la imagen, utilizar un nuevo nombre
de archivo y actualizar sus metadatos para evitar reutilizar la imagen anterior.

El flujo habitual es hacer push a `main` y comprobar el workflow **Deploy Firebase Hosting and Firestore**. El workflow instala con `npm ci`, ejecuta las pruebas del frontend, las reglas y las búsquedas geográficas con el emulador, y publica `dist/` generado con `npm run build:geo`. La compilación final consulta Firestore para buscar cerca del mapa. La actualización semanal utiliza la misma acción de despliegue; actualizar el JSON histórico no importa datos a Firestore.

Cada push a `develop` ejecuta el workflow **Deploy develop to qyp-test**: instala las dependencias, prueba el frontend y las reglas en el emulador, compila Vue y comprueba el explorador en escritorio y móvil antes de publicar `dist/` en **https://qyp-test.web.app/**. También se puede ejecutar manualmente seleccionando `develop` en GitHub Actions. Utiliza `firebase.test.json` y el target `test` de `.firebaserc`, asociado exclusivamente al sitio `qyp-test` del proyecto `quintoyparque`. El sitio debe existir en ese proyecto y la cuenta del secreto `FIREBASE_SERVICE_ACCOUNT_QUINTOYPARQUE` debe tener permisos de despliegue en Hosting. Este flujo publica solo Hosting; las reglas de Firestore siguen desplegándose desde `main`. Los dos sitios comparten los servicios Firebase del mismo proyecto.

Para un despliegue excepcional desde tu equipo, tras autenticarte con `firebase login`, ejecuta `bash deploy.sh` (o `.\\deploy.ps1` en Windows). Ambos compilan con `npm run build:geo` y publican primero las reglas y después Hosting. El comando de compilación geográfica funciona también en PowerShell.

El archivo `public/data/osm-places.json` debe existir en tu clon del repo. No ejecutes `firebase init`: ya están configurados `firebase.json` y `.firebaserc`.

## Configuración única de Firebase (Hosting y Firestore)

El repositorio actual incluye **frontend, reglas y pruebas de Firestore**. El antiguo [quintoyparque-backend](https://github.com/salime45/quintoyparque-backend) se conserva únicamente como histórico; no es una fuente de despliegues.

- `firebase.json`: Hosting publica `dist/`; Firestore conserva las reglas del mismo proyecto `quintoyparque`.
- `firebase.test.json` y `.firebaserc`: configuración y destino de Hosting para el sitio de test `qyp-test`.
- `firestore.rules`: reglas de seguridad para lugares, sugerencias y reseñas.
- `tests/firestore.rules.test.cjs`: pruebas con el emulador de Firestore.
- `package.json`: herramientas de tests y Firebase CLI.
- `.github/actions/deploy-live/action.yml`: prueba frontend y Firestore, **despliega primero las reglas y después Hosting**.
- `.github/workflows/firebase-hosting-merge.yml`: despliegue a producción en cada push a `main`.
- `.github/workflows/firebase-hosting-develop.yml`: despliegue de Hosting a `qyp-test` en cada push a `develop`, después de las pruebas y la compilación.
- `.github/workflows/refresh-osm.yml`: cuando actualiza el catálogo OSM, también despliega reglas antes de Hosting.

Los pull requests no ejecutan GitHub Actions ni publican previews de Hosting. Las pruebas y los despliegues se ejecutan al subir cambios a `develop` (sitio de test) o `main` (producción). Las ejecuciones manuales de despliegue están restringidas a su rama correspondiente y la actualización programada del catálogo OSM se ejecuta únicamente en `main`.

Se reutiliza el secreto de GitHub existente `FIREBASE_SERVICE_ACCOUNT_QUINTOYPARQUE`, que debe tener permiso `roles/firebaserules.admin` (o equivalente) en Firebase. Si el paso de publicar reglas devuelve 403, hay que añadir permisos a la cuenta del secreto; no hay que enviar credenciales por chat.

### Pruebas en local

Requieren Node.js 22.12+ y Java 21+ para el emulador:

```bash
npm ci
npm run dev
# En otra terminal:
npm test
npm run test:firestore
npm run build
npx playwright install chromium
npm run test:e2e
```

Los despliegues manuales desde este único repositorio pueden hacerse con `bash deploy.sh` (reglas y Hosting), `bash deploy.sh hosting` o `bash deploy.sh rules`; en Windows, `deploy.ps1` soporta `-SoloHosting` y `-SoloReglas`.

## Limitaciones actuales

La cercanía es en línea recta, no tiempo de caminata. Los locales OSM pueden estar cerrados, no tener terraza o estar separados por una carretera. El estado de verificación y las opiniones comunitarias pertenecen a Firestore, no se mezclan con el catálogo externo. Las reseñas de bares del mapa aparecen inmediatamente; las sugerencias de nuevos lugares siguen requiriendo moderación.

## Cobertura nacional: preparación e importación local

Los despliegues de `develop` para qyp-test y de `main` para producción usan
`npm run build:geo` y consultan los lugares cerca del mapa mediante geohash.
El navegador consulta ubicaciones, no descarga el catálogo de España. Ambos
sitios leen el catálogo compartido de `osmCatalogTest` en el mismo proyecto
Firebase. `npm run build` conserva el modo JSON para las pruebas históricas.

Valencia y Madrid conservan sus catálogos ya publicados. La carga nacional se
prepara y ejecuta **en tu equipo**, por bloques reanudables. El catálogo nacional
se activa en la web únicamente cuando termina toda la importación; mientras tanto
se mantienen las dos zonas existentes. Las reseñas siguen asociadas a los IDs
estables de OSM. Los catálogos regionales anteriores no se borran ni se migran
mediante escrituras masivas.

### Preparar las fuentes y obtener el informe sin consumir Firestore

Requiere Node.js 22.12+, Python 3.11+ con pip y varios GB de disco. Los scripts
usan `python3` en Linux/macOS y `python` en Windows. La variable `PYTHON` permite
indicar otra ruta al ejecutable. Pyosmium se instala en `.catalog-python`, sin
modificar la instalación de Python del sistema.

```bash
npm ci
npm run catalog:es:setup
npm run catalog:es:download
npm run catalog:es:prepare
npm run catalog:es:report
```

Las cuatro fuentes públicas de Geofabrik son España (incluye Baleares), Canarias,
Ceuta y Melilla. Cada descarga se comprueba mediante su suma publicada. Los IDs
se deduplican entre extractos; no se suman dos veces los lugares de Ceuta y Melilla
presentes también en el extracto grande. Una actualización del archivo de origen
durante la descarga produce un fallo de suma: hay que repetir la descarga.

El extractor hace tres pasadas sobre los PBF: selecciona etiquetas, resuelve las
vías de las relaciones y obtiene solo las coordenadas necesarias. Omite y cuenta
las geometrías incompletas o relaciones anidadas que no puede resolver; no cierra
anillos artificialmente. La geometría conserva los huecos y los componentes
disjuntos de los parques. Los índices espaciales evitan comparar todos los
locales del país con todas sus zonas infantiles.

El paquete nacional contiene únicamente los locales que tienen zonas infantiles
relacionadas y los parques necesarios para mostrarlos. El informe distingue los
lugares de origen de los documentos útiles que se importarán. La cobertura usa
las extensiones aproximadas de los extractos OSM, no una certificación de límites
administrativos, terrazas o visibilidad. Incluye Península, Baleares, Canarias,
Ceuta y Melilla.

Los PBF, geometrías, manifiestos y bloques se guardan en `.catalog-data`, ignorado
por Git. No se publican los extractos pesados en Hosting ni en el repositorio.
Cada preparación genera una carpeta inmutable identificada por revisión y el
manifiesto `.catalog-data/national/manifest.json`. El informe se guarda en
`.catalog-data/national/report.json` e incluye recuentos, tamaño JSON de los
documentos, operaciones iniciales estimadas y ejecuciones mínimas según el límite.
El tamaño JSON no incluye los índices ni equivale al almacenamiento facturado.
Los comandos de preparación e informe **no consultan ni escriben Firestore**.

El [informe nacional de referencia](reports/catalogo-nacional.json), generado con
fuentes de octubre de 2026, recoge 163466 lugares únicos de origen y 65137
documentos útiles. Estima 73332 operaciones iniciales y un mínimo de 15
ejecuciones con límite de 5000. Los recuentos por tipo se solapan en un lugar
que OSM etiqueta simultáneamente como local y zona infantil. El informe incluye
las sumas de origen, geometrías incompletas, muestras de ciudades y una simulación
local de la importación completa; no es un registro de carga a Firebase real.

### Importar con presupuesto y reanudar

Autentícate con una cuenta que pueda leer y escribir datos de Firestore en
`quintoyparque` (`roles/datastore.user` o permisos equivalentes):

```bash
gcloud config set project quintoyparque
gcloud auth application-default login
npm run catalog:es:import -- --max-writes=5000
```

El límite predeterminado es 5000 operaciones por ejecución. Incluye documentos,
actualizaciones del índice de bloques, registros de progreso y control. Admite
valores entre 6 y 19000. **No representa la cuota diaria restante**: hay que
consultar el consumo del proyecto y contar también las ejecuciones anteriores y
la actividad de la aplicación. Ejecutarlo varias veces el mismo día puede agotar
la cuota gratuita. No activa facturación ni modifica el plan Spark/Blaze.

Cuando se alcanza el límite, el comando termina correctamente con `complete:
false` y conserva el progreso. Repite el mismo comando cuando tengas cuota.
Conserva el manifiesto y sus bloques hasta terminar la carga. No hace falta borrar
los documentos ni comenzar de cero. Para un manifiesto ya completado y vigente,
el importador termina sin escrituras.

Para continuar con una preparación anterior después de crear otra, puedes indicar
su manifiesto inmutable:

```bash
npm run catalog:es:import -- --manifest=.catalog-data/national/REVISION/manifest.json --max-writes=5000
```

No se permite iniciar otra revisión mientras quede una carga pendiente. El
importador bloquea ejecuciones simultáneas mediante una precondición de versión.
Si el proceso termina abruptamente, el bloqueo caduca en 15 minutos. Los errores
de cuota se devuelven sin reintentarlos durante diez minutos: cada solicitud REST
tiene un plazo de 30 segundos. Si se pierde una respuesta después de guardar un
lote, su progreso y los documentos ya se han escrito juntos y la siguiente
ejecución puede continuar. Al completar la carga, recarga la web para renovar sus metadatos.

### Comparación por bloques y consultas de la web

Los documentos nacionales están en `osmCatalogTest/espana/places`; la raíz
`osmCatalogTest/espana` se publica al finalizar. El catálogo se divide en 4096
bloques estables por hash del ID OSM, con resúmenes en `blocks` y progreso en
`imports`. Un índice privado de versiones permite saltar bloques idénticos sin leer sus
resúmenes. El importador lee solo los resúmenes de los bloques afectados, no todos
los documentos de lugares.
En cada lote actualiza de forma atómica los lugares, los hashes del bloque y el
cursor. Las bajas también consumen presupuesto y se limitan al catálogo nacional;
nunca se eliminan reseñas, cuentas, sugerencias ni los catálogos anteriores.
Las actualizaciones de un catálogo nacional ya activo se aplican por lotes; no
son una transacción única sobre todo el país.

La web comprueba la versión nacional y conserva en memoria los metadatos y rangos
consultados durante cinco minutos. La primera carga completa nacional tiene
prioridad sobre los catálogos regionales. Las reglas permiten leer sus lugares
solo cuando la raíz tiene `complete: true`; los hashes y el progreso son privados
y las escrituras de clientes siguen prohibidas. Las propuestas autenticadas de
las extensiones nacionales continúan pendientes de moderación.

Al mover el mapa se espera 250 ms antes de consultar. El radio de descarga cubre
la vista más 150 m y está limitado a 20 km; hay que acercar el mapa para explorar.
Los filtros de 60/100/150 m siguen midiendo la distancia entre local y zona
infantil. El buscador de texto busca en la zona consultada. Las propuestas
comunitarias ya publicadas mantienen su carga anterior desde `places`.

`?zona=madrid` y `?zona=valencia` siguen abriendo las vistas iniciales de esas
ciudades. El resto se explora moviendo el mapa o pulsando «Mi ubicación».

### Actions y comprobaciones

El despliegue de `develop` conserva las pruebas, la compilación geográfica, las
reglas y Hosting, **sin importar datos a Firestore**. Se ha retirado el workflow
`Refresh geographic test catalogue`. Los scripts de importación rechazan el modo
de escritura si detectan CI. La actualización histórica del JSON de Valencia
conserva su workflow; no importa documentos de Firestore.

```bash
npm test
npm run test:osm
npm run test:firestore
npm run build
npm run test:e2e
npm run test:geo
npm run build:geo
```

El emulador requiere Java 21 y los navegadores requieren Chromium de Playwright.
`test:geo` importa las dos fuentes regionales versionadas en un proyecto demo,
comprueba el transporte REST nacional, las pausas por presupuesto y la activación
final. Después usa datos controlados para probar Valencia, Madrid, Barcelona y
Canarias en escritorio y móvil, bloqueando conexiones HTTPS externas. Nunca
escribe datos en Firebase real. Como esa prueba compila contra el emulador,
`build:geo` vuelve a generar la compilación destinada a Hosting (qyp-test o
producción) sin la dirección del emulador usada por esa prueba.
