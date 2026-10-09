# Quinto y Parque — frontend

Primera versión web para localizar parques infantiles y bares/cafeterías cercanos en Valencia. Proyecto Firebase: `quintoyparque`.

## Funciones existentes
- Mapa con OpenStreetMap y Leaflet.
- Consulta a Overpass de parques infantiles y cafeterías/bares/restaurantes en el área visible; candidatos a menos de 150 m en línea recta.
- Filtros, geolocalización opcional y acceso a la ubicación.
- Sitios verificados almacenados en Firestore.
- Sugerencias de usuarios con Google Sign-In y estado pendiente de revisión.

## Arranque
1. Registrar una app web en Firebase Console, proyecto `quintoyparque`.
2. Copiar su configuración pública en `public/firebase-config.js`. No publicar secretos de servidor.
3. Activar Auth (Google) y Firestore; desplegar primero las reglas del repo backend.
4. En local: `npx serve public`.
5. Publicar: `firebase deploy --project quintoyparque --only hosting`.

## Limitaciones
Los locales son candidatos **no verificados**: la distancia no comprueba terraza, barreras, cruces o visibilidad. Las reseñas están modeladas en backend pero aún no tienen interfaz. La API pública Overpass puede limitar las consultas. Pendiente: moderación y datos locales más completos, pruebas y despliegue real.
