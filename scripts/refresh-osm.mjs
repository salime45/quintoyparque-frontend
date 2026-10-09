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
    ');nwr["amenity"~"^(cafe|bar|restaurant)$"](' + box + '););out center;';
}
function normalize(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!["node", "way", "relation"].includes(el.type) ||
      !Number.isFinite(el.id) ||
      !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const tags = el.tags || {};
  const isPark = tags.leisure === "playground";
  const isVenue = ["cafe", "bar", "restaurant"].includes(tags.amenity);
  if (!isPark && !isVenue) return null;

  const cleanTags = {};
  for (const key of ["name", "leisure", "amenity", "outdoor_seating", "wheelchair", "addr:street", "addr:housenumber"]) {
    if (typeof tags[key] === "string") cleanTags[key] = tags[key].slice(0, 220);
  }
  return { id: el.type + "/" + el.id, lat, lon, tags: cleanTags };
}
async function fetchOneTile(tile, index) {
  const q = buildQuery(tile);
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      console.log("Consultando zona " + index + "/" + tiles.length + " en " + new URL(endpoint).host);
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
      console.log("Zona " + index + ": " + data.elements.length + " elementos");
      return data.elements;
    } catch (error) {
      const message = (error && error.message) || String(error);
      failures.push(new URL(endpoint).host + ": " + message);
      console.warn("Fallo de proveedor: " + failures.at(-1));
    }
  }
  throw Error("Sin proveedores OSM disponibles para zona " + index + ": " + failures.join(" | "));
}
function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 ||
      !Array.isArray(snapshot.elements) || snapshot.elements.length < 200) {
    throw Error("Snapshot OSM incompleto o inválido");
  }
  const parks = snapshot.elements.filter((x) => x.tags?.leisure === "playground").length;
  const venues = snapshot.elements.filter((x) => ["cafe", "bar", "restaurant"].includes(x.tags?.amenity)).length;
  if (parks < 50 || venues < 50) throw Error("Dataset sospechosamente pequeño: " + parks + " parques / " + venues + " locales");
  console.log("Dataset listo: " + parks + " parques / " + venues + " cafeterías y restaurantes");
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
  });
}
async function main() {
  const previous = await readCommittedSnapshot();
  let snapshot;
  try {
    const items = [];
    // Cuatro peticiones pequeñas en vez de una consulta pesada a toda Valencia.
    for (let i = 0; i < tiles.length; i++) {
      items.push(...(await fetchOneTile(tiles[i], i + 1)));
      await sleep(850);
    }
    const unique = new Map();
    for (const item of items) {
      const normalized = normalize(item);
      if (normalized) unique.set(normalized.id, normalized);
    }
    snapshot = validateSnapshot({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: "OpenStreetMap contributors / Overpass API",
      license: "ODbL",
      coverage,
      elements: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)),
    });
    // Evitar publicar un snapshot incompleto cuando una instancia de Overpass
    // responde con datos parcialmente truncados.
    if (previous) {
      const count = (data, condition) => data.elements.filter(condition).length;
      const isPark = (item) => item.tags?.leisure === "playground";
      const isVenue = (item) => ["cafe","bar","restaurant"].includes(item.tags?.amenity);
      if (count(snapshot, isPark) < count(previous, isPark) * 0.75 ||
          count(snapshot, isVenue) < count(previous, isVenue) * 0.75) {
        throw Error("Caída sospechosa en la cobertura; se conserva el snapshot anterior");
      }
    }
  } catch (err) {
    console.warn("No se pudo actualizar Overpass: " + err.message);
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
  console.log("Escrito " + outputPath + " (" + snapshot.elements.length + " elementos)");
}
await main();
