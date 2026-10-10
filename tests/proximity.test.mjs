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
