/** Importación exclusivamente al catálogo de PRUEBAS. ADC en CI; sin claves en el repo. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogDocuments, fingerprint, planCatalogSync } from "./catalog-documents.mjs";
import { CATALOG_PATH } from "../src/lib/geo-catalog.js";

export async function syncCatalog(db, snapshot, { write = false } = {}) {
  const documents = buildCatalogDocuments(snapshot);
  // Guardas equivalentes al importador OSM antes de cualquier escritura.
  const parks = snapshot.elements.filter((item) => item.tags?.leisure === "playground").length;
  if (parks < 50 || documents.size - parks < 50 || (!Number.isInteger(snapshot.parkAreaCount) || snapshot.parkAreaCount < 50) || !snapshot.parkMatches.length) {
    throw Error("Catálogo demasiado pequeño: se conserva la importación anterior");
  }
  const root = db.doc(CATALOG_PATH);
  const collection = root.collection("places");
  const [current, metadata] = await Promise.all([collection.get(), root.get()]);
  const existing = new Map(current.docs.map((document) => [document.id, document.data()]));
  const previous = metadata.data();
  if (previous && Date.parse(previous.generatedAt) > Date.parse(snapshot.generatedAt)) {
    console.log("Se conserva el catálogo de pruebas, más reciente que la copia versionada.");
    return { total: existing.size, modified: 0, removed: 0, write, skipped: true };
  }
  if (previous && (parks < previous.parkCount * 0.75 || documents.size - parks < previous.venueCount * 0.75)) {
    throw Error("Caída sospechosa del catálogo: no se realizará la sincronización");
  }
  const changes = planCatalogSync(documents, existing);
  const summary = { total: documents.size, modified: changes.upserts.length, removed: changes.removed.length, write };
  console.log("Sincronización de pruebas:", JSON.stringify(summary));
  if (!write) return summary;
  // Publicar altas/cambios antes de retirar lugares; nunca borrar reseñas.
  const operations = [
    ...changes.upserts.map(([id, data]) => ({ ref: collection.doc(id), data })),
    ...changes.removed.map((id) => ({ ref: collection.doc(id) })),
  ];
  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    for (const operation of operations.slice(index, index + 400)) {
      if (operation.data) batch.set(operation.ref, operation.data);
      else batch.delete(operation.ref);
    }
    await batch.commit();
  }
  const data = {
    schemaVersion: 1,
    revision: fingerprint([...documents].map(([id, item]) => [id, item.contentHash])),
    generatedAt: snapshot.generatedAt, coverage: snapshot.coverage,
    source: snapshot.source, license: snapshot.license,
    parkCount: parks, venueCount: documents.size - parks,
  };
  if (JSON.stringify(previous) !== JSON.stringify(data)) await root.set(data);
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const projectId = emulator ? "demo-quintoyparque" : "quintoyparque";
  const app = initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) });
  try {
    const snapshot = JSON.parse(await readFile(new URL("../public/data/osm-places.json", import.meta.url), "utf8"));
    await syncCatalog(getFirestore(app), snapshot, { write: process.argv.includes("--write") });
  } finally {
    const { deleteApp } = await import("firebase-admin/app");
    await deleteApp(app);
  }
}
