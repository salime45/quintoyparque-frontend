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
const isVenue = item => ["bar", "cafe", "restaurant", "fast_food"].includes(item?.tags?.amenity);
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


/**
 * Muestra pares visibles de zonas infantiles y locales. Además de la distancia
 * recta, admite pertenencia automática al MISMO recinto (leisure=park/garden)
 * calculada con los polígonos OSM al regenerar el snapshot.
 *
 * No se almacenan excepciones ni IDs escritos a mano. Las geometrías se
 * validan previamente en el servidor; aquí solo se consumen sus asociaciones.
 */
export function filterVisiblePairs(elements, index, isVisible, radiusMeters=150, parkMatches=[]) {
  if(!Array.isArray(elements)||typeof isVisible!=="function"||
     !index?.parkIds||!index?.venueDistances||!Array.isArray(parkMatches)){
    throw new TypeError("Catálogo, índice o límites de parque incorrectos");
  }
  if(!Number.isFinite(radiusMeters)||radiusMeters<=0)throw new RangeError("Radio no válido");
  const knownPlaygrounds=new Map(elements.filter(x=>valid(x)&&isPark(x)).map(x=>[x.id,x]));
  const knownVenues=new Map(elements.filter(x=>valid(x)&&isVenue(x)).map(x=>[x.id,x]));
  const membership=new Map();
  for(const match of parkMatches){
    if(typeof match?.venueId!=="string"||typeof match.playgroundId!=="string"||
       !knownVenues.has(match.venueId)||!knownPlaygrounds.has(match.playgroundId))continue;
    membership.set(match.venueId,match);
  }
  const linkedPlaygroundIds=new Set([...membership.values()].map(m=>m.playgroundId));
  const candidatesP=[...knownPlaygrounds.values()].filter(p=>
    isVisible(p)&&(index.parkIds.has(p.id)||linkedPlaygroundIds.has(p.id)));
  const candidatesV=[...knownVenues.values()].filter(v=>
    isVisible(v)&&(index.venueDistances.has(v.id)||membership.has(v.id)));
  const selectedParks=new Set();
  const parkVenueCounts=new Map();
  const venueDistances=new Map();
  const nearestParkByVenue=new Map();
  const sameParkVenueIds=new Set();
  const sameParkNames=new Map();
  const venues=[];
  const visibleParkIds=new Set(candidatesP.map(p=>p.id));
  for(const venue of candidatesV){
    let closest=null,best=Infinity;
    const counted=new Set();
    for(const park of candidatesP){
      const d=distanceMeters(venue,park);
      if(d>radiusMeters)continue;
      counted.add(park.id);
      if(d<best){closest=park;best=d;}
    }
    const membershipRecord=membership.get(venue.id);
    if(membershipRecord){
      // Mostrar la zona infantil asociada con el polígono, incluso cuando
      // existe otra más próxima al otro lado de una calle.
      closest=knownPlaygrounds.get(membershipRecord.playgroundId);
      best=distanceMeters(venue,closest);
      sameParkVenueIds.add(venue.id);
      sameParkNames.set(venue.id,membershipRecord.parkName||"Parque");
      if(visibleParkIds.has(closest.id))counted.add(closest.id);
    }
    if(!closest)continue;
    for(const parkId of counted){
      selectedParks.add(parkId);
      parkVenueCounts.set(parkId,(parkVenueCounts.get(parkId)||0)+1);
    }
    venues.push(venue);
    nearestParkByVenue.set(venue.id,closest);
    venueDistances.set(venue.id,Math.round(best));
  }
  return {
    parks:candidatesP.filter(p=>selectedParks.has(p.id)),
    venues,venueDistances,nearestParkByVenue,parkVenueCounts,
    sameParkVenueIds,sameParkNames
  };
}
