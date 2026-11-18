# Añadir locales con un agente

Los locales manuales se guardan en `places`, separados del catálogo OSM.
La web los carga al abrir o recargar la página y los muestra en mapa y buscador.
Esta primera versión permite cafeterías, bares, restaurantes y comida rápida;
no añade parques ni habilita reseñas OSM para estos locales.

## Preparación

Ejecuta `npm ci` desde la raíz del repositorio. `.mcp.json` configura el servidor
oficial de Firebase usando la versión fijada en el proyecto, con herramientas de
Firestore. Los clientes compatibles pueden cargar ese archivo; en Cursor copia
su contenido a `.cursor/mcp.json`. El proceso debe arrancar desde este repositorio
para resolver el ejecutable local y el proyecto de `.firebaserc`.

Autentícate en tu equipo, sin guardar credenciales en Git ni compartirlas por chat:

```bash
npx firebase login
gcloud auth application-default login
```

El MCP utiliza la sesión de Firebase; el comando de alta usa Application Default
Credentials con permisos de lectura y escritura de datos en `quintoyparque`
(por ejemplo, `roles/datastore.user`). Son autenticaciones independientes.
El MCP expone `firestore_query_collection` y descubre además herramientas remotas
de Firestore, incluidas escrituras. Las altas de este flujo pasan por el comando
validado de abajo. `--only firestore` selecciona el grupo, no limita permisos:
Firebase también expone herramientas de contexto del proyecto. Configurar `.mcp.json` no
conecta automáticamente un MCP a una conversación que ya esté abierta.

Referencia: [servidor MCP oficial de Firebase](https://firebase.google.com/docs/ai-assistance/mcp-server).

## Flujo de alta

Pide al agente que siga este documento. Ejemplo:

> Añade una cafetería siguiendo docs/altas-manuales.md. Se llama […], está en
> [dirección], sus coordenadas son […]. La información procede de […].
> Primero enséñame la ficha y los posibles duplicados.

1. Obtener nombre, dirección, coordenadas, categoría y procedencia. No inventar
   coordenadas, terraza, visibilidad ni una zona infantil. Pedir los datos que falten.
2. Guardar una ficha en un archivo JSON local, por ejemplo en
   `.catalog-data/manual/nuevo-local.json` (carpeta ignorada por Git):

   ```json
   {
     "name": "Nombre del local",
     "address": "Dirección completa",
     "lat": 39.47,
     "lng": -0.37,
     "category": "cafe",
     "source": "Visita personal",
     "sourceRef": "Observado por la persona que solicita el alta, fecha AAAA-MM-DD"
   }
   ```

   Es un ejemplo de formato, no un local real. `category` admite `cafe`, `bar`,
   `restaurant` y `fast_food`. `sourceRef` puede ser una URL o una referencia
   descriptiva; no se almacena información privada de la persona que lo solicita.
3. Consultar y validar sin escribir:

   ```bash
   npm run places:manual -- --project=quintoyparque --file=.catalog-data/manual/nuevo-local.json
   ```

   El comando consulta rangos geohash del catálogo nacional activo, o de Valencia
   y Madrid si aún no está completo, y las altas de `places` (incluidas las no
   publicadas). Requiere una zona infantil a un máximo de 150 m en línea recta.
   Avisa de coincidencias de nombre normalizado a 150 m o locales a 2 m aunque
   tengan otro nombre. Son posibles duplicados, no una identificación infalible.
4. Mostrar `path`, ficha, distancia, origen y `duplicates`. Si hay duplicados,
   revisar el registro existente: el comando no los sobrescribe ni permite
   forzar el alta. Si no hay autorización para publicar ese sitio, esperar a
   recibirla; si la petición ya autoriza su publicación, continuar.
5. Publicar con el mismo archivo:

   ```bash
   npm run places:manual -- --project=quintoyparque --file=.catalog-data/manual/nuevo-local.json --write
   ```

   Repite la validación y comprueba los duplicados manuales dentro de una
   transacción. Crea un único documento con ID estable, fecha del servidor,
   procedencia y parque relacionado. No actualiza ni borra documentos existentes.
   Los errores y duplicados terminan con código distinto de cero.
6. Recargar la web y buscar el nombre para comprobar el marcador y la ficha.

No usar una escritura genérica del MCP para saltarse estas validaciones.
Las credenciales administrativas no están limitadas por las reglas de clientes:
este comando restringe sus escrituras a `places`, pero no reduce los permisos de
la cuenta utilizada. El destino `qyp-test` y producción comparten proyecto y
colección `places`; escribir en el proyecto real puede verse en ambos sitios.
Los locales publicados usan la presentación comunitaria existente, independiente
de los filtros de distancia y reseñas del catálogo OSM. Su marcador manual no
lleva la marca de verificación de reseñas.

## Comprobaciones con datos ficticios

```bash
node --test tests/manual-places.test.mjs
npm run test:manual-places
```

La integración usa exclusivamente `demo-quintoyparque` en el emulador, requiere
Java 21 y Chromium de Playwright (`npx playwright install chromium`). Comprueba
vista previa sin escrituras, publicación legible por un visitante y rechazo de
duplicados concurrentes. Después compila contra el emulador y verifica el buscador,
el marcador y la ficha en escritorio y móvil. Tras esa prueba, ejecuta
`npm run build:geo` para regenerar la compilación sin la dirección del emulador.
Para ejecutar el CLI con el emulador, establece `FIRESTORE_EMULATOR_HOST` e indica
`--project=demo-quintoyparque`. El comando rechaza otros proyectos y las escrituras
en CI. No hay despliegues ni altas reales dentro de las pruebas.
