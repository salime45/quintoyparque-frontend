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

El flujo habitual es hacer push a `main` y comprobar el workflow **Deploy Firebase Hosting and Firestore**. El workflow instala con `npm ci`, ejecuta las pruebas, compila con `npm run build` y publica `dist/`. La actualización semanal utiliza la misma acción: el catálogo actualizado se copia a `dist/data/` durante la compilación. Si se modifica la extracción geográfica, el workflow de actualización regenera los polígonos y publica el catálogo antes de activar esta versión.

Cada push a `develop` ejecuta el workflow **Deploy develop to qyp-test**: instala las dependencias, prueba el frontend y las reglas en el emulador, compila Vue y comprueba el explorador en escritorio y móvil antes de publicar `dist/` en **https://qyp-test.web.app/**. También se puede ejecutar manualmente seleccionando `develop` en GitHub Actions. Utiliza `firebase.test.json` y el target `test` de `.firebaserc`, asociado exclusivamente al sitio `qyp-test` del proyecto `quintoyparque`. El sitio debe existir en ese proyecto y la cuenta del secreto `FIREBASE_SERVICE_ACCOUNT_QUINTOYPARQUE` debe tener permisos de despliegue en Hosting. Este flujo publica solo Hosting; las reglas de Firestore siguen desplegándose desde `main`. Los dos sitios comparten los servicios Firebase del mismo proyecto.

Para un despliegue excepcional desde tu equipo, tras autenticarte con `firebase login`, ejecuta `bash deploy.sh` (o `.\\deploy.ps1` en Windows). Ambos publican primero las reglas y después Hosting.

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

## Piloto de consultas geográficas en qyp-test

La compilación de `develop` usa `VITE_CATALOG_SOURCE=firestore` y consulta
`osmCatalogTest/{zona}/places` (`valencia` y `madrid`) por rangos de `geohash` con el SDK modular de
Firebase y `geofire-common`. Producción continúa usando el JSON versionado.
No se usa GeoFireX ni RxJS. Los IDs de OSM y las rutas de reseñas se conservan.

Al abrir el mapa, pulsar «Buscar aquí» o «Mi ubicación», y al terminar de moverlo
(con una espera de 250 ms), se consulta el círculo que contiene la vista más un
margen de 150 m. No se admiten círculos mayores de 20 km: hay que acercar el mapa.
Se descartan falsos positivos por distancia exacta y se deduplican los resultados.
Los rangos consultados se guardan cinco minutos en memoria (máximo 64 rangos);
los errores no quedan cacheados. Una revisión nueva invalida la caché cuando se
renuevan los metadatos, también cada cinco minutos. Cambiar entre 60/100/150 m
reutiliza esos datos: estos radios siguen midiendo local–zona infantil.

Cada local importado incorpora las zonas infantiles a 150 m y la asociación al
mismo parque calculada por geometría. Esto permite relacionarlo con un parque
fuera de la vista o del círculo consultado. El buscador de texto del piloto busca
**en la zona consultada**, no en toda Valencia ni en toda España. La interfaz
explica ese alcance. Los distintivos OSM se consultan en grupos de hasta 30 IDs
para los locales visibles, en lugar de descargar todos los resúmenes de reseñas.
Las propuestas publicadas por la comunidad mantienen su carga existente desde
`places`; la migración geográfica de esa colección no forma parte del piloto.

### Importación y permisos

- `npm run catalog:plan`: lee Firestore y muestra altas/cambios/bajas sin escribir.
- `npm run catalog:sync:test`: sincroniza el JSON versionado **solo** con
  `osmCatalogTest/valencia` y `osmCatalogTest/madrid`. Nunca modifica cuentas, reseñas, sugerencias o `places`.
- `npm run build:geo`: compila el piloto. `npm run build` conserva el modo JSON.

El importador usa Firebase Admin con credenciales de aplicación predeterminadas
(ADC). En GitHub Actions reutiliza el secreto ya existente; además del permiso de
Hosting y reglas, esa cuenta necesita permisos de datos de Firestore
(por ejemplo `roles/datastore.user`). No hay que copiar claves al repositorio.
Las reglas permiten leer el catálogo de pruebas, pero ningún cliente —incluidos
los administradores de la web— puede escribirlo: las escrituras son del Admin SDK.
No se necesita un índice compuesto: se consulta únicamente el campo `geohash`.

La sincronización valida el catálogo completo antes de escribir, conserva los
lugares si la descarga OSM falla o pierde cobertura de forma sospechosa y solo
reescribe documentos cuyo contenido cambia. Publica las altas/cambios antes de
las bajas y actualiza los metadatos al terminar. Las escrituras se hacen en lotes:
una interrupción puede dejar una actualización parcial, recuperable repitiendo
la sincronización; no es una transacción global. Nunca elimina reseñas.
Una copia versionada más antigua no sustituye una importación más reciente.

El workflow de `develop` ejecuta pruebas y emulador, importa ambas zonas, publica
las reglas y después Hosting en `qyp-test`. Como ambos sitios comparten Firebase,
las reglas se publican en el proyecto compartido; el permiso añadido se limita
al nuevo catálogo de pruebas. La cuenta de despliegue necesita los permisos
anteriores antes del primer despliegue. La producción sigue compilándose sin
activar este piloto.

`Refresh geographic test catalogue` permite actualizar manualmente el piloto
seleccionando `develop` y tiene una programación semanal. GitHub solo activa las
programaciones cuando el archivo existe en la rama predeterminada; hasta que
llegue a `main`, se puede lanzar manualmente desde `develop`. Si falla Overpass,
ese workflow no inicia ninguna escritura en Firestore. Comparte el bloqueo de
concurrencia con el despliegue de pruebas.

### Verificación local sin acceso a producción

`npm run test:geo` arranca Firestore emulado con `demo-quintoyparque`, importa el
catálogo real versionado, verifica la segunda sincronización sin cambios y mide
los documentos devueltos por una consulta de 1 km y su repetición desde caché.
Después carga un catálogo pequeño controlado, compila contra el emulador y prueba
la navegación en escritorio y móvil. Las pruebas bloquean las conexiones HTTPS
externas y comprueban que no se descarga `osm-places.json`. Requiere Java 21 y
Chromium de Playwright. La compilación resultante usa el emulador: ejecutar
`npm run build:geo` después para generar la versión destinada a qyp-test.

El número de documentos recibidos en esas pruebas es una medida de transferencia,
no una estimación completa de facturación: Firestore también puede cobrar lecturas
mínimas por consultas vacías y entradas de índice según la consulta. El consumo
real debe observarse en Firebase durante el piloto.


### Madrid capital y área metropolitana

El piloto incluye Madrid, Alcobendas, San Sebastián de los Reyes, Tres Cantos,
Pozuelo, Majadahonda, Las Rozas, Boadilla, Alcorcón, Móstoles, Leganés, Getafe,
Fuenlabrada, Parla, Pinto, Rivas, Coslada, San Fernando, Torrejón y Alcalá de
Henares. Es una cobertura rectangular aproximada de latitud 40.16–40.72 y longitud
-4.03–-3.20; también recoge lugares de zonas intermedias. No representa límites
administrativos exactos ni garantiza que todos los lugares estén registrados en
OSM o tengan un local próximo a un parque infantil.

`src/lib/catalog-regions.js` centraliza centros del mapa, cobertura, nombres de
archivos y partición de las descargas. Madrid se descarga en 16 sectores para
reducir el tamaño de las consultas Overpass. `public/data/osm-madrid.json` conserva
el catálogo inicial real, con licencia ODbL, fecha y asociaciones geométricas.
Valencia mantiene `public/data/osm-places.json` y su ruta actual de Firestore.

El centro del mapa determina automáticamente qué catálogo consultar. Los
metadatos y la caché se mantienen por región; salir de ambas coberturas muestra
el aviso correspondiente sin consultar catálogos ajenos. No se amplía un único
rectángulo entre Valencia y Madrid. «Mi ubicación» funciona en ambas zonas.
`https://qyp-test.web.app/?zona=madrid` abre directamente Madrid; `?zona=valencia`
abre Valencia. Los parámetros desconocidos conservan el centro inicial de
Valencia. El buscador de texto mantiene el alcance local a la zona consultada.

Para actualizar o planificar una región concreta:

```bash
OSM_REQUIRE_REFRESH=true node scripts/refresh-osm.mjs --region=madrid
node scripts/sync-firestore-catalog.mjs --region=madrid
node scripts/sync-firestore-catalog.mjs --region=madrid --write
```

`--region=all` procesa ambas zonas. Los comandos npm `catalog:plan` y
`catalog:sync:test` ya incluyen ambas. La sincronización rechaza un catálogo cuyo
identificador o cobertura no corresponda a la región de destino; las bajas se
limitan a esa región. Una descarga fallida conserva la copia anterior. La
actualización semanal del piloto descarga ambas antes de iniciar la importación.
La actualización de producción sigue solicitando solo Valencia por defecto.

Las reglas permiten leer exclusivamente los dos catálogos configurados y
mantienen prohibidas las escrituras desde clientes. Las propuestas de Madrid y
su área metropolitana también se aceptan, siempre autenticadas y pendientes de
moderación, conservando la validación anterior de Valencia.

Las pruebas añaden cambios Valencia–Madrid–Valencia, apertura del enlace de
Madrid, geolocalización en Getafe, importación de los dos catálogos reales sin
borrar la otra región y rechazo de una importación al destino equivocado.
