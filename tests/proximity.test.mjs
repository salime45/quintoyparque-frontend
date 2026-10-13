import test from "node:test";
import assert from "node:assert/strict";
import {buildProximityIndex} from "../public/js/proximity.js";

const park = (id, lat, lon=-0.38) => ({id,lat,lon,tags:{leisure:"playground"}});
const venue = (id, lat, lon=-0.38,amenity="cafe")=>({id,lat,lon,tags:{amenity}});

test("Oculta parques que no tienen establecimientos a 150 m",()=>{
  const result=buildProximityIndex([
    park("p1",39.47),park("p2",39.49),venue("v1",39.4705),
  ]);
  assert.deepEqual([...result.parkIds],["p1"]);
  assert.equal(result.venueDistances.get("v1")<150,true);
  assert.equal(result.parkVenueCounts.get("p1"),1);
  assert.equal(result.parkVenueCounts.has("p2"),false);
});
test("Cuenta bares, cafeterías y restaurantes, sin contar locales lejanos",()=>{
  const result=buildProximityIndex([
    park("p",39.47),
    venue("bar",39.4702,-0.38,"bar"),
    venue("cafe",39.4701,-0.38,"cafe"),
    venue("restaurant",39.4703,-0.38,"restaurant"),
    venue("far",39.485,-0.38,"bar"),
  ]);
  assert.equal(result.parkVenueCounts.get("p"),3);
  assert.equal(result.venueDistances.size,3);
  assert.equal(result.venueDistances.has("far"),false);
});
test("Respeta el límite de 150 metros",()=>{
  const p=park("p",39.47);
  const nearby=buildProximityIndex([p,venue("near",39.47+149/111195)]);
  assert.equal(nearby.parkIds.has("p"),true);
  const far=buildProximityIndex([p,venue("far",39.47+151/111195)]);
  assert.equal(far.parkIds.has("p"),false);
});
test("Empareja un bar fuera del área visible con un parque dentro",()=>{
  // El algoritmo utiliza el snapshot completo antes de filtrar por viewport.
  const result=buildProximityIndex([
    park("visible-park",39.47,-0.38),
    venue("venue-outside-visible-map",39.47,-0.381,"restaurant"),
  ]);
  assert.equal(result.parkIds.has("visible-park"),true);
  assert.equal(result.venueDistances.has("venue-outside-visible-map"),true);
});
test("No muestra parques aislados ni bares sin parque",()=>{
  const result=buildProximityIndex([park("p",39.47),venue("v",39.48)]);
  assert.equal(result.parkIds.size,0);
  assert.equal(result.venueDistances.size,0);
});
test("Ignora puntos con coordenadas inválidas",()=>{
  const result=buildProximityIndex([
    park("p",39.47),{id:"invalid",lat:null,lon:-0.38,tags:{amenity:"bar"}},
    venue("valid",39.4701)
  ]);
  assert.equal(result.parkIds.size,1);
  assert.equal(result.venueDistances.size,1);
});

import {filterVisiblePairs} from "../public/js/proximity.js";

test("No muestra un bar cuyo parque esté fuera del mapa",()=>{
  const items=[park("p",39.47,-0.381),venue("v",39.47,-0.38,"bar")];
  const result=filterVisiblePairs(items,buildProximityIndex(items),item=>item.lon>=-0.3805);
  assert.equal(result.parks.length,0);
  assert.equal(result.venues.length,0);
});
test("No muestra un parque cuyo bar esté fuera del mapa",()=>{
  const items=[park("p",39.47,-0.38),venue("v",39.47,-0.381,"cafe")];
  const result=filterVisiblePairs(items,buildProximityIndex(items),item=>item.lon>=-0.3805);
  assert.equal(result.parks.length,0);
  assert.equal(result.venues.length,0);
});
test("Solo deja parejas parque-bar presentes a la vez, con distancia real",()=>{
  const items=[
    park("p1",39.47),park("p2",39.48),
    venue("v1",39.4705),venue("v2",39.4803,-0.38,"bar"),
    venue("far",39.49)
  ];
  const result=filterVisiblePairs(items,buildProximityIndex(items),item=>item.lat<39.475);
  assert.deepEqual(result.parks.map(x=>x.id),["p1"]);
  assert.deepEqual(result.venues.map(x=>x.id),["v1"]);
  assert.equal(result.nearestParkByVenue.get("v1").id,"p1");
  assert.equal(result.parkVenueCounts.get("p1"),1);
  assert.ok(result.venueDistances.get("v1")<150);
});

test("Una cafetería dentro de un parque no se pierde por estar a 220 m de la zona infantil",()=>{
  const items=[
    park("juegos-marxalenes",39.4880823,-0.3827732),
    venue("cafe-marxalenes",39.4872154,-0.3804847),
  ];
  const links=[{venueId:"cafe-marxalenes",playgroundId:"juegos-marxalenes",parkName:"Parc de Marxalenes",displayName:"Cafetería del Parc de Marxalenes"}];
  const index=buildProximityIndex(items,150);
  assert.equal(index.venueDistances.size,0); // El filtro radial no la encuentra.
  const result=filterVisiblePairs(items,index,()=>true,60,links);
  assert.deepEqual(result.parks.map(x=>x.id),["juegos-marxalenes"]);
  assert.deepEqual(result.venues.map(x=>x.id),["cafe-marxalenes"]);
  assert.equal(result.venues[0].displayName,"Cafetería del Parc de Marxalenes");
  assert.ok(result.venueDistances.get("cafe-marxalenes")>150);
  assert.equal(result.sameParkVenueIds.has("cafe-marxalenes"),true);
  assert.equal(result.sameParkNames.get("cafe-marxalenes"),"Parc de Marxalenes");
  assert.equal(result.parkVenueCounts.get("juegos-marxalenes"),1);
});

test("Un local normal a más de 60 m continúa excluido aunque esté dentro de 150 m",()=>{
  const items=[park("juegos",39.47),venue("bar",39.4709)];
  const result=filterVisiblePairs(items,buildProximityIndex(items,150),()=>true,60);
  assert.equal(result.venues.length,0);
  assert.equal(result.parks.length,0);
});

test("Un local documentado dentro del mismo parque aparece al hacer zoom aunque la zona infantil quede fuera de vista",()=>{
  const items=[park("juegos",39.488),venue("cafe",39.487,-0.38)];
  const links=[{venueId:"cafe",playgroundId:"juegos",parkName:"Parc X"}];
  const result=filterVisiblePairs(items,buildProximityIndex(items,150),x=>x.id==="cafe",60,links);
  assert.deepEqual(result.venues.map(x=>x.id),["cafe"]);
  assert.equal(result.parks.length,0);
  assert.equal(result.nearestParkByVenue.get("cafe").id,"juegos");
});

test("La excepción no se aplica a asociaciones incompletas o a locales no enlazados",()=>{
  const items=[park("juegos",39.47),venue("unlinked",39.472)];
  const badLinks=[{venueId:"unlinked",playgroundId:"parque-inexistente"},{venueId:"fake",playgroundId:"juegos"}];
  const result=filterVisiblePairs(items,buildProximityIndex(items,150),()=>true,60,badLinks);
  assert.equal(result.venues.length,0);
  assert.equal(result.sameParkVenueIds.size,0);
});
