import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildProximityIndex} from "../src/lib/proximity.js";
import {
  normalizeSearchText,buildPlaceSearchCatalog,findPlaces,publishedPlaceSearchEntry
} from "../src/lib/place-search.js";

const playground=(id,lat,lon=-0.38,name)=>({
  id,lat,lon,tags:{leisure:"playground",...(name?{name}:{})}
});
const venue=(id,lat,lon=-0.38,name,amenity="cafe",street="")=>({
  id,lat,lon,tags:{amenity,...(name?{name}:{}),...(street?{"addr:street":street}:{})}
});
const places=[
  playground("park-a",39.4702,-0.38,"Parc Infantil Central"),
  venue("v-cafe",39.47,-0.38,"Café Ñandú","cafe","Carrer d'Àngel Guimerà"),
  venue("v-bar",39.4701,-0.38,"Bar El Prado","bar"),
  playground("park-b",39.49,-0.40),
  venue("v-inside",39.492,-0.401,null,"cafe"),
  venue("v-far",39.6,-0.38,"Bar Desconectado","bar")
];
const memberships=[{
  venueId:"v-inside",playgroundId:"park-b",
  parkId:"way/12345",parkName:"Parc de Marxalenes"
}];
function makeCatalog(radius=60){
  return buildPlaceSearchCatalog(places,buildProximityIndex(places,150),memberships,radius);
}
test("Normaliza tildes, mayúsculas, espacios y parc/parque",()=>{
  assert.equal(normalizeSearchText(" CAFÉ  ÑANDÚ "),"cafe nandu");
  assert.equal(normalizeSearchText("Parc de Marxalenes"),"parque de marxalenes");
  assert.equal(normalizeSearchText("PARQUE Central"),"parque central");
  assert.equal(normalizeSearchText("Ángel Guimerà"),"angel guimera");
});
test("Busca locales por nombre con o sin tildes en todo el catálogo",()=>{
  const c=makeCatalog();
  assert.equal(findPlaces(c,"cafe nandu")[0].place.id,"v-cafe");
  assert.equal(findPlaces(c,"EL PRADO")[0].place.id,"v-bar");
  assert.equal(findPlaces(c,"zzzsincoincidencias").length,0);
});
test("Incluye locales etiquetados en OSM como fast_food cerca de zonas infantiles",()=>{
  const placesFast=[
    playground("p-fast",39.47,-0.38),
    venue("100m-gayano",39.4701,-0.38,"100 Montaditos","fast_food","Carrer de Gayano Lluch")
  ];
  const index=buildProximityIndex(placesFast,150);
  const catalog=buildPlaceSearchCatalog(placesFast,index,[],60);
  assert.equal(findPlaces(catalog,"100 Montaditos")[0].place.id,"100m-gayano");
  assert.equal(findPlaces(catalog,"Gayano Lluch")[0].place.id,"100m-gayano");
  assert.ok(findPlaces(catalog,"100")[0].subtitle.includes("Comida rápida"));
});
test("Busca por calle aunque aparezca en un barrio distinto al visible",()=>{
  const results=findPlaces(makeCatalog(),"Angel Guimera");
  assert.equal(results.length,1);
  assert.equal(results[0].place.id,"v-cafe");
  assert.equal(results[0].kind,"venue");
});
test("Busca tanto zonas infantiles con nombre como parques OSM completos",()=>{
  const c=makeCatalog();
  assert.ok(findPlaces(c,"infantil central").some(r=>r.kind==="park"&&r.place.id==="park-a"));
  const marx=findPlaces(c,"parque marxalenes");
  assert.ok(marx.some(r=>r.kind==="park"&&r.label==="Parc de Marxalenes"));
  assert.ok(marx.some(r=>r.kind==="venue"&&r.place.id==="v-inside"));
});
test("No ofrece establecimientos alejados sin parque, ni al aumentar el radio",()=>{
  for(const radius of [60,100,150]){
    assert.equal(findPlaces(makeCatalog(radius),"Desconectado").length,0);
  }
});
test("Respeta el radio de proximidad y conserva los pares dentro del mismo parque",()=>{
  const only=[playground("p",39.47),venue("v",39.47085,-0.38,"Café medio","cafe")];
  const index=buildProximityIndex(only,150);
  assert.equal(findPlaces(buildPlaceSearchCatalog(only,index,[],60),"medio").length,0);
  assert.equal(findPlaces(buildPlaceSearchCatalog(only,index,[],100),"medio").length,1);
  assert.equal(findPlaces(makeCatalog(60),"Marxalenes").length>=1,true);
});
test("Ordena coincidencias exactas antes de términos sueltos y limita los resultados",()=>{
  const c=makeCatalog();
  const exact=findPlaces(c,"Bar El Prado");
  assert.equal(exact[0].label,"Bar El Prado");
  assert.equal(findPlaces(c,"cafe",1).length,1);
  assert.deepEqual(findPlaces(c,"A"),[]);
});
test("Los locales publicados en Firestore se pueden encontrar sin falsear su origen",()=>{
  const hit=publishedPlaceSearchEntry("place001",{
    name:"La Terraza del Parque",lat:39.469, lng:-0.38,address:"Calle Norte 17"
  });
  assert.equal(hit.kind,"published");
  assert.equal(hit.place.id,"firestore/place001");
  assert.equal(findPlaces([hit],"terraza norte")[0].id,hit.id);
  assert.equal(publishedPlaceSearchEntry("invalid",{name:"Fuera"}),null);
});
test("La búsqueda de producción indexa Marxalenes automáticamente y no depende del viewport",()=>{
  const data=JSON.parse(readFileSync(new URL("../public/data/osm-places.json",import.meta.url)));
  const index=buildProximityIndex(data.elements,150);
  const matches=buildPlaceSearchCatalog(data.elements,index,data.parkMatches||[],60);
  assert.ok(matches.length>100,"El buscador debe contener lugares de toda Valencia");
  assert.ok(findPlaces(matches,"Marxalenes",10).some(r=>r.label==="Parc de Marxalenes"));
  assert.equal(findPlaces(matches,"zzzinexistenteunico").length,0);
});
