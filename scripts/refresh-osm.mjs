/**
 * Actualiza una copia local de parques y bares/cafeterías de Valencia con Overpass.
 * Esta tarea se ejecuta en GitHub Actions (servidor), NO en los navegadores.
 * La web carga public/data/osm-places.json desde su propio origen Firebase.
 *
 * Datos: © OpenStreetMap contributors, licencia ODbL.
 * https://www.openstreetmap.org/copyright
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeParkArea, computeParkMatches } from "./osm-park-geometry.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, "public", "data", "osm-places.json");
const endpoints = [
  // Esta instancia respondió correctamente para Valencia en la primera prueba de CI.
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
// Valencia ciudad + área metropolitana próxima; el producto empieza aquí.
const coverage = { south: 39.28, west: -0.62, north: 39.67, east: -0.20 };
const midLat = (coverage.north + coverage.south) / 2;
const midLon = (coverage.east + coverage.west) / 2;
const tiles = [
  [coverage.south, coverage.west, midLat, midLon],
  [coverage.south, midLon, midLat, coverage.east],
  [midLat, coverage.west, coverage.north, midLon],
  [midLat, midLon, coverage.north, coverage.east],
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildQuery([south, west, north, east]) {
  const box = [south, west, north, east].join(",");
  return '[out:json][timeout:50];(nwr["leisure"="playground"](' + box +
    ');nwr["amenity"~"^(cafe|bar|restaurant|fast_food)$"](' + box + '););out center;';
}
// Límites OSM de parques y jardines, que se usan solo en el proceso de
// importación para calcular pertenencia espacial; el navegador no recibe
// las geometrías (más pesadas) ni ejecuta consultas Overpass.
function buildParkQuery([south, west, north, east]) {
  const box=[south,west,north,east].join(",");
  return '[out:json][timeout:50];(way["leisure"~"^(park|garden)$"]('+
    box+');relation["leisure"~"^(park|garden)$"]('+box+'););out geom;';
}
function normalize(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!["node", "way", "relation"].includes(el.type) ||
      !Number.isFinite(el.id) ||
      !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const tags = el.tags || {};
  const isPark = tags.leisure === "playground";
  const isVenue = ["cafe", "bar", "restaurant", "fast_food"].includes(tags.amenity);
  if (!isPark && !isVenue) return null;

  const cleanTags = {};
  for (const key of ["name", "leisure", "amenity", "outdoor_seating", "wheelchair", "addr:street", "addr:housenumber"]) {
    if (typeof tags[key] === "string") cleanTags[key] = tags[key].slice(0, 220);
  }
  return { id: el.type + "/" + el.id, lat, lon, tags: cleanTags };
}
async function fetchOneTile(tile, index, kind="places") {
  const q=kind==="parks"?buildParkQuery(tile):buildQuery(tile);
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      console.log("Consultando "+kind+" zona " + index + "/" + tiles.length + " en " + new URL(endpoint).host);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "QuintoYParque/0.1 (GitHub Actions OSM snapshot)"
        },
        body: new URLSearchParams({ data: q }),
        signal: AbortSignal.timeout(65000),
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data?.elements)) throw Error("Respuesta sin elementos OSM");
      if (typeof data.remark === "string" && /error|runtime/i.test(data.remark)) throw Error(data.remark.slice(0, 120));
      console.log(kind+" zona " + index + ": " + data.elements.length + " elementos");
      return data.elements;
    } catch (error) {
      const message = (error && error.message) || String(error);
      failures.push(new URL(endpoint).host + ": " + message);
      console.warn("Fallo de proveedor: " + failures.at(-1));
    }
  }
  throw Error("Sin proveedores OSM disponibles para "+kind+" zona " + index + ": " + failures.join(" | "));
}
function validateSnapshot(snapshot) {
  if (!snapshot || ![1,2].includes(snapshot.schemaVersion) ||
      !Array.isArray(snapshot.elements) || snapshot.elements.length < 200) {
    throw Error("Snapshot OSM incompleto o inválido");
  }
  const parks = snapshot.elements.filter((x) => x.tags?.leisure === "playground").length;
  const venues = snapshot.elements.filter((x) => ["cafe", "bar", "restaurant", "fast_food"].includes(x.tags?.amenity)).length;
  if (parks < 50 || venues < 50) throw Error("Dataset sospechosamente pequeño: " + parks + " parques / " + venues + " locales");
  if(snapshot.schemaVersion===2){
    if(!Number.isInteger(snapshot.parkAreaCount)||snapshot.parkAreaCount<50 ||
        !Array.isArray(snapshot.parkMatches)||snapshot.parkMatches.length<1) {
      throw Error("Dataset sin polígonos de parques o emparejamientos automáticos suficientes");
    }
    console.log("Parques con límites:",snapshot.parkAreaCount,
      "locales dentro del mismo parque:",snapshot.parkMatches.length);
  }
  console.log("Dataset listo: " + parks + " zonas infantiles / " + venues + " locales");
  return snapshot;
}
async function readCommittedSnapshot() {
  try {
    return validateSnapshot(JSON.parse(await readFile(outputPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Error("El snapshot versionado es inválido: " + error.message);
  }
}
async function existingSnapshot() {
  const url = "https://quintoyparque.web.app/data/osm-places.json";
  console.warn("Primera importación: recuperando el catálogo publicado en Firebase.");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error("No hay copia publicada (" + response.status + ")");
  return validateSnapshot(await response.json());
}
function compareElements(snapshot) {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    coverage: snapshot.coverage,
    elements: snapshot.elements,
    parkAreaCount: snapshot.parkAreaCount,
    parkMatches: snapshot.parkMatches,
  });
}
async function main() {
  const previous = await readCommittedSnapshot();
  let snapshot;
  try {
    const items = [];
    // Descarga independiente de puntos de interés y polígonos. Si falla
    // cualquiera de ambas fuentes, se conserva íntegro el catálogo anterior.
    const boundaries=[];
    for(let i=0;i<tiles.length;i++){
      items.push(...(await fetchOneTile(tiles[i],i+1,"places")));
      await sleep(950);
    }
    for(let i=0;i<tiles.length;i++){
      boundaries.push(...(await fetchOneTile(tiles[i],i+1,"parks")));
      await sleep(950);
    }
    const unique = new Map();
    for (const item of items) {
      const normalized = normalize(item);
      if (normalized) unique.set(normalized.id, normalized);
    }
    const areas=new Map();
    for(const item of boundaries){
      const area=normalizeParkArea(item);
      if(area)areas.set(area.id,area);
    }
    const elements=[...unique.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const parkMatches=computeParkMatches(elements,[...areas.values()]);
    snapshot = validateSnapshot({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      source: "OpenStreetMap contributors / Overpass API",
      license: "ODbL",
      coverage,
      elements,
      parkAreaCount:areas.size,
      parkMatches,
    });
    // Evitar publicar un snapshot incompleto cuando una instancia de Overpass
    // responde con datos parcialmente truncados.
    if (previous) {
      const count = (data, condition) => data.elements.filter(condition).length;
      const isPark = (item) => item.tags?.leisure === "playground";
      const isVenue = (item) => ["cafe","bar","restaurant","fast_food"].includes(item.tags?.amenity);
      if (count(snapshot, isPark) < count(previous, isPark) * 0.75 ||
          count(snapshot, isVenue) < count(previous, isVenue) * 0.75 ||
          (previous.schemaVersion===2 &&
            (snapshot.parkAreaCount < previous.parkAreaCount*0.75 ||
             snapshot.parkMatches.length < previous.parkMatches.length*0.65))) {
        throw Error("Caída sospechosa en la cobertura; se conserva el snapshot anterior");
      }
    }
  } catch (err) {
    console.warn("No se pudo actualizar Overpass: " + err.message);
    if (process.env.OSM_REQUIRE_REFRESH === "true") throw err;
    // Si falla Overpass conservamos los datos del repo.
    // Solo la primera importación usa la copia ya publicada en Firebase.
    snapshot = previous || await existingSnapshot();
  }
  snapshot.elements.sort((a, b) => a.id.localeCompare(b.id));
  if (previous && compareElements(snapshot) === compareElements(previous)) {
    console.log("Los datos no han cambiado. No se genera commit.");
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(snapshot));
  console.log("Escrito " + outputPath + " (" + snapshot.elements.length + " lugares, "+snapshot.parkAreaCount+" límites, "+snapshot.parkMatches.length+" relaciones geométricas)");
}
await main();
