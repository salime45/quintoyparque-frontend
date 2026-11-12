# Piloto local de fotos

El objetivo es medir si 300 locales alcanzan un 90 % de fotos reales del
establecimiento correcto. **Todavía no se ha medido cobertura real con Google.**
Este piloto no modifica la web desplegada ni escribe en Firestore. Funciona con
Node.js 22.12+ y no necesita instalar paquetes.

## Ejecutar

1. Habilita **Maps JavaScript API** y **Places UI Kit API** en el proyecto de
   Google Cloud con facturación activa.
2. Crea una clave de navegador restringida a esas dos APIs y a los referentes
   `http://127.0.0.1:4357/*` y `http://localhost:4357/*`.
3. Copia `scripts/photo-pilot/places.env.example` como `.env.places.local` en la
   raíz del repositorio y sustituye el valor por tu clave. Ese archivo está
   ignorado por Git. No se necesitan credenciales ADC.
4. Ejecuta desde la raíz:

```bash
node --env-file=.env.places.local scripts/photo-pilot.mjs
```

Abre <http://127.0.0.1:4357>. La clave se utiliza en el navegador como requiere
Maps JavaScript; sus restricciones en Google Cloud son necesarias. No se imprime
ni se guarda en el informe o el progreso.

## Revisión visual asistida

**Consultar fotos** muestra hasta tres candidatos mediante el componente oficial.
Selecciona el local correcto y confirma su identidad, dirección y foto real antes
de evaluar. Un icono, logotipo o foto de otro establecimiento no cuentan.
El script no puede certificar automáticamente que una foto corresponde al local.
Cargar el componente no se considera éxito.

Marca foto correcta, sin foto, local incorrecto, dudoso o error. Los dos primeros
resultados requieren seleccionar un candidato. Los pendientes y los casos
difíciles permanecen en el denominador.

El progreso se guarda en `.catalog-data/photo-pilot/REVISION/progress.json`.
Se conservan tus evaluaciones y el `place_id`, sin almacenar fotos ni nombres,
direcciones o respuestas completas de Google. Para reanudar, conserva esa carpeta
y repite el comando. No ejecutes dos servidores simultáneos sobre el mismo archivo.
Las pestañas de un mismo servidor comparten el límite.

Descarga el informe desde la página o consúltalo sin clave ni conexión:

```bash
node scripts/photo-pilot.mjs --report
```

## Muestra y criterio del 90 %

`sample.json` contiene los 300 locales: 150 en entornos de ciudades y 150 en
entornos de pueblos, repartidos por 30 centros. Se seleccionan alternando centros
y ordenando los candidatos por un hash de su ID, sin filtrar por fotos o nombre.
Incluye 23 locales sin nombre. Procede del catálogo nacional de 46.903 locales
asociados a zonas infantiles, con datos de octubre de 2026.

Los radios de selección son de 10 km para ciudades y 25 km para pueblos; **no son
límites municipales ni una clasificación oficial de población**. Es una muestra
exploratoria equilibrada, no una estimación nacional representativa.

El resultado se cierra al revisar los 300 locales; se alcanza el objetivo
observado con al menos 270 fotos confirmadas. Eso no garantiza por sí solo un
90 % nacional. El informe también presenta resultados por grupo.

Para reproducir la muestra con el manifiesto y los bloques originales locales:

```bash
node scripts/photo-pilot/make-sample.mjs
```

## Consultas y coste

Por defecto se permiten **330 consultas iniciadas**: 300 y margen para repetir
30 casos. No se consulta al arrancar, navegar o recargar. Cada reserva se guarda
antes de crear el componente y cuenta incluso si falla la red. No hay reintentos
de la aplicación ni paginación. `--max-queries=N` permite un límite inicial entre
1 y 600, que debe mantenerse al reanudar.

Tarifa global consultada el 12/11/2026: **Places UI Kit Query, 1 USD por 1.000
eventos**, con 10.000 eventos mensuales de franquicia por SKU. La cifra bruta de
330 consultas es 0,33 USD, sin descontar franquicias ni incluir impuestos. Los
componentes avanzados tienen otra tarifa y no se usan aquí.

El límite cuenta las consultas iniciadas por la aplicación, no la factura de
Google: puede haber reintentos internos del proveedor. Configura también las
cuotas adecuadas en Google Cloud. La proyección de 46.903 consultas del informe
es orientativa y no incluye futuras visitas ni consultas adicionales. No es una
propuesta de descarga masiva de fotos.

## Compatibilidad con Leaflet

Para nuevas integraciones sujetas a las condiciones del EEE, Google restringe el
contenido de Places API asociado a mapas. **Places UI Kit tiene una excepción
expresa y puede mostrarse con mapas de terceros.** Por eso el piloto utiliza el
componente básico de búsqueda con nombre, dirección, fotos y sus atribuciones.
Una integración posterior deberá usar esos componentes; no basta con copiar URLs
a `tags.image` en Firestore. El piloto no integra todavía fotos en `VenuePopup.vue`.

Fuentes oficiales consultadas el 12/11/2026:

- [EEE y Places UI Kit](https://developers.google.com/maps/comms/eea/places).
- [Place Search Element](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-search).
- [Tarifas globales](https://developers.google.com/maps/billing-and-pricing/pricing).
- [Eventos facturables](https://developers.google.com/maps/billing-and-pricing/sku-details/places).
- [Datos y atribuciones](https://developers.google.com/maps/documentation/places/web-service/policies).
