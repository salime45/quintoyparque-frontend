/**
 * Empareja cada parque infantil con establecimientos OSM a <= radiusMeters.
 * Se indexa TODO el catálogo, no solo los puntos visibles en pantalla.
 * Esto evita falsos negativos cuando el bar queda fuera del borde del mapa.
 * Distancia en línea recta; no verifica terrazas, calles ni visibilidad.
 */
const RADIANS = Math.PI / 180;
const METERS_PER_DEGREE_LAT = 111195;
const REFERENCE_LATITUDE = 39.47; // Valencia
const METERS_PER_DEGREE_LON = METERS_PER_DEGREE_LAT * Math.cos(REFERENCE_LATITUDE * RADIANS);
const isPark = item => item?.tags?.leisure === "playground";
const isVenue = item => ["bar", "cafe", "restaurant"].includes(item?.tags?.amenity);
const valid = item => item && item.id != null &&
  Number.isFinite(item.lat) && Number.isFinite(item.lon);
function distanceMeters(a,b) {
  const meanLatitude=(a.lat+b.lat)*0.5*RADIANS;
  return METERS_PER_DEGREE_LAT * Math.hypot(
    b.lat-a.lat,
    (b.lon-a.lon)*Math.cos(meanLatitude)
  );
}
export function buildProximityIndex(elements, radiusMeters=150) {
  if(!Array.isArray(elements)) throw new TypeError("El catálogo debe ser una lista");
  if(!Number.isFinite(radiusMeters)||radiusMeters<=0) throw new RangeError("Radio no válido");
  const parks=elements.filter(item=>valid(item)&&isPark(item));
  const venues=elements.filter(item=>valid(item)&&isVenue(item));
  const grid=new Map();
  const cellOf=item=>[
    Math.floor(item.lon*METERS_PER_DEGREE_LON/radiusMeters),
    Math.floor(item.lat*METERS_PER_DEGREE_LAT/radiusMeters)
  ];
  const key=(x,y)=>x+","+y;
  for(const park of parks){
    const [x,y]=cellOf(park);
    const cellKey=key(x,y);
    if(!grid.has(cellKey))grid.set(cellKey,[]);
    grid.get(cellKey).push(park);
  }
  const parkIds=new Set();
  const venueDistances=new Map();
  const parkVenueCounts=new Map();
  for(const venue of venues){
    const [x,y]=cellOf(venue);
    let nearest=Infinity;
    // El margen de 2 celdas compensa la pequeña variación de longitud
    // entre latitudes, además de los puntos justo junto al borde.
    for(let dx=-2;dx<=2;dx++){
      for(let dy=-2;dy<=2;dy++){
        for(const park of grid.get(key(x+dx,y+dy))||[]){
          const distance=distanceMeters(venue,park);
          if(distance>radiusMeters)continue;
          nearest=Math.min(nearest,distance);
          parkIds.add(park.id);
          parkVenueCounts.set(park.id,(parkVenueCounts.get(park.id)||0)+1);
        }
      }
    }
    if(nearest!==Infinity)venueDistances.set(venue.id,Math.round(nearest));
  }
  return { parkIds, venueDistances, parkVenueCounts };
}


// Un enlace auditado entre un local y una zona de juegos del MISMO parque
// puede incluirse incluso cuando se supera el radio de proximidad. Esto evita
// perder cafeterías dentro de grandes parques urbanos. Son vínculos puntuales
// documentados y no se extrapolan a otros locales ni a parques cercanos.
// Un local normal sigue exigiendo distancia <= radio y parque visible.
export function filterVisiblePairs(elements, index, isVisible, radiusMeters=150, sameParkLinks=[]) {
  if(!Array.isArray(elements) || typeof isVisible!=="function" ||
      !index?.parkIds || !index?.venueDistances || !Array.isArray(sameParkLinks)) {
    throw new TypeError("Catálogo o índice incorrectos");
  }
  if(!Number.isFinite(radiusMeters)||radiusMeters<=0)throw new RangeError("Radio no válido");
  const knownParks=new Map(elements.filter(x=>valid(x)&&isPark(x)).map(x=>[x.id,x]));
  const knownVenues=new Map(elements.filter(x=>valid(x)&&isVenue(x)).map(x=>[x.id,x]));
  const links=new Map();
  for(const link of sameParkLinks){
    if(!link || typeof link.venueId!=="string" || typeof link.playgroundId!=="string" ||
        !knownParks.has(link.playgroundId) || !knownVenues.has(link.venueId))continue;
    links.set(link.venueId,link);
  }
  const linkedParkIds=new Set([...links.values()].map(x=>x.playgroundId));
  const parkCandidates=[...knownParks.values()].filter(p=>
    isVisible(p)&&(index.parkIds.has(p.id)||linkedParkIds.has(p.id)));
  const venueCandidates=[...knownVenues.values()].filter(v=>
    isVisible(v)&&(index.venueDistances.has(v.id)||links.has(v.id)));
  const selectedParks=new Set();
  const parkVenueCounts=new Map();
  const venueDistances=new Map();
  const nearestParkByVenue=new Map();
  const sameParkVenueIds=new Set();
  const sameParkNames=new Map();
  const venues=[];
  for(const venue of venueCandidates){
    let closest=null,best=Infinity;
    for(const park of parkCandidates){
      const d=distanceMeters(venue,park);
      if(d>radiusMeters)continue;
      selectedParks.add(park.id);
      parkVenueCounts.set(park.id,(parkVenueCounts.get(park.id)||0)+1);
      if(d<best){closest=park;best=d;}
    }
    const link=links.get(venue.id);
    // Si el parque es grande, su zona infantil puede quedar fuera del viewport.
    // Solo se permite esto cuando la pertenencia al MISMO parque fue documentada.
    if(link){
      sameParkVenueIds.add(venue.id);
      sameParkNames.set(venue.id,link.parkName||"el mismo parque");
      if(!closest){
        closest=knownParks.get(link.playgroundId);
        best=distanceMeters(venue,closest);
        if(parkCandidates.some(p=>p.id===closest.id)){
          selectedParks.add(closest.id);
          parkVenueCounts.set(closest.id,(parkVenueCounts.get(closest.id)||0)+1);
        }
      }
    }
    if(closest){
      const displayName=link?.displayName;
      venues.push(displayName && !venue.tags?.name ? {...venue,displayName} : venue);
      nearestParkByVenue.set(venue.id,closest);
      venueDistances.set(venue.id,Math.round(best));
    }
  }
  return {
    parks:parkCandidates.filter(p=>selectedParks.has(p.id)),
    venues,venueDistances,nearestParkByVenue,parkVenueCounts,
    sameParkVenueIds,sameParkNames
  };
}
