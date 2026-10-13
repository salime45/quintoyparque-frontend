/**
 * Búsqueda local sobre los lugares OSM que cumplen el radio seleccionado
 * o están dentro del mismo parque que una zona infantil.
 * Se construye para TODO el catálogo, no solo el viewport del mapa.
 */
import {filterVisiblePairs} from "./proximity.js";

const types={bar:"Bar",cafe:"Cafetería",restaurant:"Restaurante",fast_food:"Comida rápida"};
const isValid=o=>o && typeof o.id==="string" &&
  Number.isFinite(o.lat) && Number.isFinite(o.lon);

export function normalizeSearchText(value){
  return String(value??"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es")
    .replace(/\b(?:parc|parque|park)\b/g,"parque")
    .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
const text=o=>String(o??"").trim();
const streetOf=place=>[
  text(place.tags?.["addr:street"]),
  text(place.tags?.["addr:housenumber"])
].filter(Boolean).join(" ");
function distanceMeters(a,b){
  return 111195*Math.hypot(
    a.lat-b.lat,(a.lon-b.lon)*Math.cos((a.lat+b.lat)*Math.PI/360)
  );
}
const nearData=(item,companion)=>companion
  ?Math.round(distanceMeters(item,companion))+" m de la zona infantil":"";
function makeEntry(kind,place,label,subtitle,companion,searchFields=[]){
  return {
    id:kind+":"+place.id,
    kind,place,companion,label,subtitle,
    nameIndex:normalizeSearchText(label),
    addressIndex:normalizeSearchText(streetOf(place)),
    searchIndex:normalizeSearchText([label,subtitle,...searchFields].join(" "))
  };
}

/** Solo devuelve parques/locales que califican según el filtro actual. */
export function buildPlaceSearchCatalog(elements,proximity,parkMatches=[],radiusMeters=60){
  const matched=filterVisiblePairs(elements,proximity,()=>true,radiusMeters,parkMatches);
  const results=[];
  const seenParks=new Set();
  const venuesById=new Map(matched.venues.map(v=>[v.id,v]));
  const playgroundsById=new Map(elements.filter(p=>
    isValid(p)&&p.tags?.leisure==="playground").map(p=>[p.id,p]));
  const venues=matched.venues.filter(isValid);
  for(const venue of venues){
    const companion=matched.nearestParkByVenue.get(venue.id);
    const category=types[venue.tags?.amenity]||"Local";
    const name=text(venue.tags?.name)||category+" sin nombre";
    const parkName=matched.sameParkNames.get(venue.id)||"";
    const address=streetOf(venue);
    const detail=parkName
      ?"Dentro de "+parkName+" · "+nearData(venue,companion)
      :nearData(venue,companion);
    const subtitle=[category,address,detail].filter(Boolean).join(" · ");
    results.push(makeEntry("venue",venue,name,subtitle,companion,[parkName,address]));
  }
  for(const park of matched.parks){
    if(!isValid(park)||!text(park.tags?.name))continue;
    const named=text(park.tags.name);
    const companion=venues.find(v=>
      matched.nearestParkByVenue.get(v.id)?.id===park.id ||
      distanceMeters(v,park)<=radiusMeters);
    if(!companion)continue;
    results.push(makeEntry("park",park,named,"Zona infantil · "+nearData(park,companion),companion));
    seenParks.add(park.id);
  }
  // El nombre del recinto (p. ej. "Parc de Marxalenes") puede ser distinto
  // del nombre de la zona infantil, o la zona infantil puede carecer de nombre.
  const seenAreas=new Set();
  for(const match of parkMatches){
    if(!venuesById.has(match.venueId)||seenAreas.has(match.parkId))continue;
    const playground=playgroundsById.get(match.playgroundId);
    const name=text(match.parkName);
    if(!playground||!name||/^(parque|park|jardin|jard[ií]|parc)$/i.test(name))continue;
    const venue=venuesById.get(match.venueId);
    results.push(makeEntry("park",playground,name,
      "Parque con zona infantil · "+types[venue.tags?.amenity]+" dentro",
      venue));
    seenAreas.add(match.parkId);
  }
  return results;
}

/**
 * Ordena por relevancia, no por posición en el catálogo OSM.
 * Soporta tildes, variaciones «parc/parque» y varias palabras sin exigir
 * que se escriban en el mismo orden.
 */
export function findPlaces(catalog,query,limit=8){
  const q=normalizeSearchText(query);
  if(q.length<2)return [];
  const words=q.split(" ").filter(Boolean);
  const scored=[];
  for(const entry of catalog){
    if(!words.every(w=>entry.searchIndex.includes(w)))continue;
    const label=entry.nameIndex;
    let rank=6;
    if(label===q)rank=0;
    else if(label.startsWith(q))rank=1;
    else if(label.split(" ").some(w=>w.startsWith(q)))rank=2;
    else if(label.includes(q))rank=3;
    else if(entry.addressIndex.includes(q))rank=4;
    else rank=5;
    scored.push({entry,rank});
  }
  return scored.sort((a,b)=>
    a.rank-b.rank ||
    a.entry.label.localeCompare(b.entry.label,"es") ||
    a.entry.id.localeCompare(b.entry.id)
  ).slice(0,Math.max(1,Math.floor(limit))).map(x=>x.entry);
}

/** Firebase contiene también locales publicados que pueden no estar en OSM. */
export function publishedPlaceSearchEntry(id,data){
  if(typeof id!=="string"||!Number.isFinite(data?.lat)||!Number.isFinite(data?.lng)||
     !text(data.name))return null;
  const place={id:"firestore/"+id,lat:data.lat,lon:data.lng,
    tags:{name:text(data.name),"addr:street":text(data.address)}};
  return makeEntry("published",place,text(data.name),
    ["Local publicado",text(data.address)].filter(Boolean).join(" · "),null);
}
