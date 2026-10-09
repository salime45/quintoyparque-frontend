# Quinto y Parque — frontend

Web para localizar parques infantiles y cafeterías, bares y restaurantes próximos en Valencia. Proyecto Firebase: `quintoyparque`.

## Funcionalidades iniciales
- Mapa OpenStreetMap/Leaflet, geolocalización opcional y filtros.
- Búsqueda de parques infantiles y establecimientos a menos de 150 metros en línea recta (datos de Overpass/OSM).
- Distinción entre locales candidatos no verificados y lugares publicados desde Firestore.
- Acceso con Google para proponer establecimientos que se guardan pendientes de moderación.

## Desplegar en Firebase Hosting

Requisitos: Node.js/npm, Firebase CLI, y cuenta Google con acceso al proyecto `quintoyparque`.

En Windows PowerShell, partiendo de una carpeta vacía:

```powershell
git clone https://github.com/salime45/quintoyparque-backend.git
git clone https://github.com/salime45/quintoyparque-frontend.git
npm install -g firebase-tools
firebase login
cd quintoyparque-frontend
.\deploy.ps1
```

El script despliega **primero** las reglas de Firestore del repositorio hermano y, solo si funcionan, publica Hosting. No es necesario ejecutar `firebase init`: ambos repositorios ya incluyen `firebase.json`.

También puede desplegarse cada servicio manualmente:

```powershell
cd ..\quintoyparque-backend
firebase deploy --project quintoyparque --only firestore:rules
cd ..\quintoyparque-frontend
firebase deploy --project quintoyparque --only hosting
```

URL prevista para el sitio predeterminado: https://quintoyparque.web.app/ (comprobar después de desplegar). Verifica que `quintoyparque.web.app` figure en los dominios autorizados de Firebase Authentication si falla Google Sign-In.

Para probar solo la parte estática localmente: `npx serve public`.

## Seguridad y límites del MVP
- Las claves de la configuración Web de Firebase son **públicas**; no alojar secretos de servidor, cuentas de servicio o tokens en este repositorio.
- Las reglas Firestore se gestionan en `quintoyparque-backend`, deben desplegarse antes de aceptar aportaciones.
- Cercanía no significa terraza visible ni cruce seguro: la base OSM no certifica estas propiedades. Confirmar antes de ir.
- Overpass es un servicio externo público y puede fallar; en esta versión no hay caché propia.
- Opiniones de usuarios: estructura Firestore disponible, aún sin interfaz de consulta o publicación; las propuestas requieren moderación.
- No hay despliegue automático configurado todavía: el primer despliegue se realiza con Firebase CLI autenticado en tu equipo.
