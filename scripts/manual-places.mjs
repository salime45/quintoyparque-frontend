import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geohashQueryBounds } from "geofire-common";
import { distance } from "../src/lib/places.js";

const normalize = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const point = (item) => ({ lat: item.lat, lon: item.lon ?? item.lng });
const validPoint = (item) => Number.isFinite(item.lat) && Number.isFinite(item.lon) && Math.abs(item.lat) <= 90 && Math.abs(item.lon) <= 180;

export function validatePlace(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Se requiere una ficha JSON");
  const allowed = ["name", "address", "lat", "lng", "category", "source", "sourceRef"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw Error("La ficha contiene campos desconocidos");
  const result = {};
  for (const [key, max] of [["name", 120], ["address", 250], ["source", 120], ["sourceRef", 500]]) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].trim().length > max) throw Error(`Campo obligatorio o demasiado largo: ${key}`);
    result[key] = input[key].trim();
  }
  if (!normalize(result.name)) throw Error("Nombre inválido");
  if (!["cafe", "bar", "restaurant", "fast_food"].includes(input.category)) throw Error("Categoría inválida");
  if (!validPoint(point(input))) throw Error("Coordenadas inválidas: se requieren lat y lng numéricos");
  return { ...result, lat: input.lat, lng: input.lng, category: input.category };
}

export function planPlace(input, catalog, manual) {
  const place = validatePlace(input);
  const position = point(place);
  const nearby = catalog.filter((item) => validPoint(point(item)) && distance(position, point(item)) <= 150);
  const parks = nearby.filter((item) => item.tags?.leisure === "playground")
    .sort((a, b) => distance(position, point(a)) - distance(position, point(b)));
  if (!parks.length) throw Error("No hay una zona infantil del catálogo a 150 m o menos; no se publicará el local");
  const duplicates = [...nearby.filter((item) => item.tags?.amenity), ...manual]
    .filter((item) => validPoint(point(item)) && distance(position, point(item)) <= 150)
    .filter((item) => normalize(item.name || item.tags?.name || "") === normalize(place.name) || distance(position, point(item)) <= 2)
    .map((item) => item.id);
  const park = parks[0];
  const parkName = park.tags?.name || "Parque infantil";
  const distanceMeters = distance(position, point(park));
  const id = "manual_" + createHash("sha256").update(JSON.stringify([normalize(place.name), place.lat.toFixed(5), place.lng.toFixed(5)])).digest("hex").slice(0, 24);
  return {
    path: `places/${id}`, duplicates,
    data: { ...place, status: "published", origin: "manual", parkId: park.id, parkName, distanceMeters,
      description: `${place.address} · A ${distanceMeters} m de ${parkName}. Visibilidad y terraza sin verificar.` },
  };
}

async function loadCatalog(db, place) {
  const national = await db.doc("osmCatalogTest/espana").get();
  const regions = national.data()?.complete === true ? ["espana"] : ["valencia", "madrid"];
  const bounds = geohashQueryBounds([place.lat, place.lng], 151);
  const snapshots = await Promise.all(regions.flatMap((region) => bounds.map(([start, end]) =>
    db.collection(`osmCatalogTest/${region}/places`).orderBy("geohash").startAt(start).endAt(end).get())));
  const entries = new Map();
  for (const snapshot of snapshots) for (const document of snapshot.docs) {
    const item = document.data();
    entries.set(item.id, item);
    for (const park of item.nearbyPlaygrounds || []) entries.set(park.id, park);
  }
  return [...entries.values()];
}

export async function addManualPlace(db, input, { write = false } = {}) {
  const place = validatePlace(input);
  const catalog = await loadCatalog(db, place);
  const readPlan = (snapshot) => planPlace(place, catalog, snapshot.docs.map((document) => ({ ...document.data(), id: document.id })));
  if (!write) return { ...readPlan(await db.collection("places").get()), written: false };
  // Releer las altas manuales en la transacción impide duplicados concurrentes.
  return db.runTransaction(async (transaction) => {
    const plan = readPlan(await transaction.get(db.collection("places")));
    if (plan.duplicates.length) throw Error(`Posibles duplicados: ${plan.duplicates.join(", ")}. No se ha escrito nada`);
    const { FieldValue } = await import("firebase-admin/firestore");
    transaction.create(db.doc(plan.path), { ...plan.data, createdAt: FieldValue.serverTimestamp() });
    return { ...plan, written: true };
  });
}

export async function main(args) {
  const write = args.includes("--write");
  const project = args.find((arg) => arg.startsWith("--project="))?.slice(10);
  const file = args.find((arg) => arg.startsWith("--file="))?.slice(7);
  if (args.some((arg) => arg !== "--write" && !arg.startsWith("--project=") && !arg.startsWith("--file="))) throw Error("Argumento desconocido");
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (!file || project !== (emulator ? "demo-quintoyparque" : "quintoyparque")) throw Error("Indica --file=ruta.json y --project=quintoyparque (demo-quintoyparque con emulador)");
  if (write && process.env.CI) throw Error("Las altas reales no se ejecutan en CI");
  const input = validatePlace(JSON.parse(await readFile(file, "utf8")));
  const { initializeApp, applicationDefault, deleteApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ projectId: project, ...(emulator ? {} : { credential: applicationDefault() }) });
  try {
    console.log(JSON.stringify(await addManualPlace(getFirestore(app), input, { write }), null, 2));
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
