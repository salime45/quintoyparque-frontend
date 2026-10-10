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


// Filtra pares completos de parque y local presentes en el viewport actual.
export function filterVisiblePairs(elements, index, isVisible, radiusMeters=150) {
  if(!Array.isArray(elements) || typeof isVisible!=="function" || !index?.parkIds || !index?.venueDistances) {
    throw new TypeError("Catálogo o índice incorrectos");
  }
  if(!Number.isFinite(radiusMeters)||radiusMeters<=0)throw new RangeError("Radio no válido");
  const parkCandidates=elements.filter(p=>valid(p)&&isPark(p)&&index.parkIds.has(p.id)&&isVisible(p));
  const venueCandidates=elements.filter(v=>valid(v)&&isVenue(v)&&index.venueDistances.has(v.id)&&isVisible(v));
  const selectedParks=new Set();
  const parkVenueCounts=new Map();
  const venueDistances=new Map();
  const nearestParkByVenue=new Map();
  const venues=[];
  for(const venue of venueCandidates){
    let closest=null, best=Infinity;
    for(const park of parkCandidates){
      const d=distanceMeters(venue,park);
      if(d>radiusMeters)continue;
      selectedParks.add(park.id);
      parkVenueCounts.set(park.id,(parkVenueCounts.get(park.id)||0)+1);
      if(d<best){closest=park;best=d;}
    }
    if(closest){
      venues.push(venue);
      nearestParkByVenue.set(venue.id,closest);
      venueDistances.set(venue.id,Math.round(best));
    }
  }
  return {
    parks:parkCandidates.filter(p=>selectedParks.has(p.id)),
    venues,venueDistances,nearestParkByVenue,parkVenueCounts
  };
}
