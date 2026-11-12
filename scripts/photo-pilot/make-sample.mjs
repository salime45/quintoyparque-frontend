import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fingerprint } from "../catalog-documents.mjs";
import { validateManifest } from "../national/bundle.mjs";
import { validateSample } from "./model.mjs";

// Centros aproximados para repartir el piloto. Los radios no son municipios.
const cities = [
  ["Madrid",40.417,-3.704], ["Barcelona",41.387,2.17], ["Valencia",39.47,-.376],
  ["Sevilla",37.389,-5.984], ["Zaragoza",41.649,-.889], ["Málaga",36.722,-4.421],
  ["Murcia",37.984,-1.13], ["Palma",39.57,2.65], ["Bilbao",43.263,-2.935],
  ["Valladolid",41.652,-4.725], ["Vigo",42.24,-8.72], ["Córdoba",37.889,-4.779],
  ["A Coruña",43.362,-8.412], ["Santander",43.462,-3.81], ["Las Palmas",28.124,-15.436],
];
const towns = [
  ["Aínsa",42.415,.141], ["Cazorla",37.911,-3.003], ["Potes",43.154,-4.623],
  ["Hervás",40.27,-5.863], ["Albarracín",40.408,-1.443], ["Sigüenza",41.068,-2.644],
  ["Almagro",38.889,-3.713], ["Aracena",37.892,-6.562], ["Llanes",43.42,-4.755],
  ["Ribadavia",42.288,-8.143], ["Olite",42.479,-1.651], ["Morella",40.619,-.1],
  ["Santillana del Mar",43.389,-4.108], ["Valverde (El Hierro)",27.808,-17.916], ["Artà",39.695,3.349],
];
function km(place, [,lat,lon]) {
  const rad = Math.PI / 180;
  return 6371 * Math.hypot((place.lat-lat)*rad, (place.lon-lon)*rad*Math.cos(lat*rad));
}
const option = process.argv.find((arg) => arg.startsWith("--manifest="));
const file = resolve(option?.slice(11) || ".catalog-data/national/manifest.json");
const manifest = JSON.parse(await readFile(file, "utf8"));
validateManifest(manifest);
const folder = basename(dirname(file)) === manifest.revision ? dirname(file) : resolve(dirname(file), manifest.revision);
const venues = [];
for (const block of manifest.blocks) {
  if (!block.count) continue;
  const records = JSON.parse(await readFile(resolve(folder, `${block.id}.json`), "utf8"));
  if (fingerprint(records) !== block.hash) throw Error(`Bloque alterado: ${block.id}`);
  for (const [,place] of records)
    if (["bar","cafe","restaurant","fast_food"].includes(place.tags?.amenity)) venues.push(place);
}
const selected = [], used = new Set();
for (const [group, anchors, radiusKm] of [["ciudades",cities,10],["entornos_pueblos",towns,25]]) {
  const candidates = anchors.map((anchor) => ({ anchor,
    rows: venues.filter((row) => km(row,anchor) <= radiusKm)
      .sort((a,b) => fingerprint(`qyp-photo-pilot-v1:${a.id}`).localeCompare(fingerprint(`qyp-photo-pilot-v1:${b.id}`))) }));
  let count = 0;
  while (count < 150) {
    let added = 0;
    for (const {anchor,rows} of candidates) {
      if (count === 150) break;
      const place = rows.find((row) => !used.has(row.id));
      if (!place) continue;
      used.add(place.id);
      selected.push({ id:place.id, name:place.tags.name || "", amenity:place.tags.amenity,
        lat:place.lat, lon:place.lon, group, area:anchor[0], radiusKm,
        address:[place.tags["addr:street"],place.tags["addr:housenumber"]].filter(Boolean).join(" ") });
      count++; added++;
    }
    if (!added) throw Error(`No hay 150 locales distintos para ${group}`);
  }
}
const sample = { version:1, sourceRevision:manifest.revision, sourceGeneratedAt:manifest.generatedAt,
  source:"OpenStreetMap contributors / Geofabrik", license:"ODbL",
  method:"Selección determinista por hash, alternando 15 centros por grupo; radios de 10/25 km. Sin filtrar por nombre ni por disponibilidad de fotos.",
  revision:fingerprint(selected), venues:selected };
validateSample(sample);
await writeFile(new URL("./sample.json",import.meta.url), JSON.stringify(sample,null,2)+"\n");
console.log(JSON.stringify({sample:sample.revision,total:selected.length,
  unnamed:selected.filter((row)=>!row.name).length,
  areas:Object.fromEntries([...new Set(selected.map(row=>row.area))].map(area=>[area,selected.filter(row=>row.area===area).length]))},null,2));
