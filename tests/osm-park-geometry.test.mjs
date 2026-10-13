import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeParkArea, computeParkMatches, pointInRing } from "../scripts/osm-park-geometry.mjs";

const coord=(lat,lon)=>({lat,lon});
const polygon=(id,coords,leisure="park",name="Parque de prueba")=>({
  type:"way",id,tags:{leisure,name},geometry:coords.map(([lat,lon])=>coord(lat,lon))
});
const playground=(id,lat,lon)=>({id,lat,lon,tags:{leisure:"playground"}});
const venue=(id,lat,lon)=>({id,lat,lon,tags:{amenity:"cafe"}});

test("La misma parcela ajardinada une bar y zona infantil a más de 150 m",()=>{
  const area=normalizeParkArea(polygon(1,[
    [39.485,-0.386],[39.49,-0.386],[39.49,-0.377],
    [39.485,-0.377],[39.485,-0.386]
  ],"park","Parc de prueba"));
  assert.ok(area);
  const items=[
    playground("juegos",39.4880823,-0.3827732),
    venue("cafe-sin-nombre",39.4872154,-0.3804847),
    venue("bar-exterior",39.485,-0.370)
  ];
  const matches=computeParkMatches(items,[area]);
  assert.deepEqual(matches,[{
    venueId:"cafe-sin-nombre",playgroundId:"juegos",
    parkId:"way/1",parkName:"Parc de prueba"
  }]);
});
test("Un recinto con hueco excluye los locales en patios fuera del parque",()=>{
  const outer=[
    coord(39.47,-0.4),coord(39.48,-0.4),
    coord(39.48,-0.39),coord(39.47,-0.39),coord(39.47,-0.4)
  ];
  const hole=[
    coord(39.473,-0.397),coord(39.477,-0.397),
    coord(39.477,-0.393),coord(39.473,-0.393),coord(39.473,-0.397)
  ];
  const area=normalizeParkArea({type:"relation",id:2,tags:{leisure:"park",name:"Jardín con hueco"},
    members:[
      {type:"way",role:"outer",geometry:outer},
      {type:"way",role:"inner",geometry:hole}
    ]
  });
  const matches=computeParkMatches([
    playground("juegos",39.472,-0.396),
    venue("dentro",39.471,-0.396),
    venue("hueco",39.475,-0.395)
  ],[area]);
  assert.deepEqual(matches.map(x=>x.venueId),["dentro"]);
});
test("Segmentos OSM invertidos de un multipolígono se cosen y cierran",()=>{
  const a=coord(39.47,-0.4),b=coord(39.47,-0.39),
    c=coord(39.48,-0.39),d=coord(39.48,-0.4);
  const area=normalizeParkArea({type:"relation",id:3,tags:{leisure:"garden",name:"Jardín"},
    members:[
      {type:"way",role:"outer",geometry:[a,b,c]},
      {type:"way",role:"outer",geometry:[a,d,c]}
    ]
  });
  assert.equal(area.components.length,1);
  assert.deepEqual(computeParkMatches([
    playground("juegos",39.472,-0.398),
    venue("bar",39.478,-0.393)
  ],[area]).map(x=>x.venueId),["bar"]);
});
test("No conecta dos áreas separadas de la misma relación multipolígono",()=>{
  const box=(south,west,north,east)=>[
    coord(south,west),coord(south,east),coord(north,east),
    coord(north,west),coord(south,west)
  ];
  const area=normalizeParkArea({type:"relation",id:4,tags:{leisure:"park"},
    members:[
      {type:"way",role:"outer",geometry:box(39.47,-0.4,39.48,-0.39)},
      {type:"way",role:"outer",geometry:box(39.49,-0.4,39.5,-0.39)}
    ]
  });
  const found=computeParkMatches([
    playground("juegos",39.475,-0.395),
    venue("bar-en-otra-parcela",39.495,-0.395)
  ],[area]);
  assert.deepEqual(found,[]);
});
test("No confunde un rectángulo envolvente con la geometría de un parque cóncavo",()=>{
  const area=normalizeParkArea(polygon(5,[
    [39.47,-0.4],[39.47,-0.39],[39.474,-0.39],
    [39.474,-0.396],[39.48,-0.396],[39.48,-0.4],[39.47,-0.4]
  ]));
  const found=computeParkMatches([
    playground("juegos",39.472,-0.398),
    venue("dentro-bbox-fuera-parque",39.477,-0.393)
  ],[area]);
  assert.deepEqual(found,[]);
});
test("Rechaza geometrías abiertas o parques sin perímetro",()=>{
  assert.equal(normalizeParkArea(polygon(6,[
    [39.47,-0.4],[39.48,-0.4],[39.48,-0.39]
  ])),null);
  assert.equal(normalizeParkArea({
    type:"node",id:7,tags:{leisure:"park"},lat:39.47,lon:-0.4
  }),null);
});
test("La actualización de datos calcula relaciones geométricas sin lista manual",()=>{
  const refresh=readFileSync(new URL("../scripts/refresh-osm.mjs",import.meta.url),"utf8");
  const html=readFileSync(new URL("../src/services/catalog.js",import.meta.url),"utf8");
  assert.match(refresh,/buildParkQuery/);
  assert.match(refresh,/computeParkMatches/);
  assert.match(refresh,/schemaVersion: 2/);
  assert.ok(html.includes("data.parkMatches"));
  assert.ok(!html.includes("park-venue-links.json"));
});
