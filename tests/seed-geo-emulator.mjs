import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { buildCatalogDocuments } from "../scripts/catalog-documents.mjs";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Esta semilla solo puede ejecutarse en el emulador");
const env = await initializeTestEnvironment({ projectId: "demo-quintoyparque", firestore: { rules: await readFile("firestore.rules", "utf8") } });
await env.clearFirestore();
const app = initializeApp({ projectId: "demo-quintoyparque" });
try {
  const db = getFirestore(app);
  const snapshot = {
    schemaVersion: 2, license: "ODbL", generatedAt: "2026-10-01T00:00:00Z",
    coverage: { south: 39.28, north: 39.67, west: -0.62, east: -0.2 },
    parkMatches: [],
    elements: [
      { id: "way/1", lat: 39.4699, lon: -0.3763, tags: { leisure: "playground", name: "Parque de prueba" } },
      { id: "node/2", lat: 39.4701, lon: -0.3763, tags: { amenity: "cafe", name: "Café de prueba" } },
      { id: "node/3", lat: 39.4707, lon: -0.3763, tags: { amenity: "bar", name: "Bar a noventa metros" } },
      { id: "node/4", lat: 39.55, lon: -0.3763, tags: { amenity: "cafe", name: "Café de otra zona" } },
      { id: "way/5", lat: 39.5501, lon: -0.3763, tags: { leisure: "playground", name: "Parque de otra zona" } },
    ],
  };
  const batch = db.batch();
  for (const [id, document] of buildCatalogDocuments(snapshot)) {
    batch.set(db.doc(`osmCatalogTest/valencia/places/${id}`), document);
  }
  batch.set(db.doc("osmCatalogTest/valencia"), {
    schemaVersion: 1, revision: "e2e-v1", coverage: snapshot.coverage, generatedAt: snapshot.generatedAt,
  });
  await batch.commit();
} finally {
  await env.cleanup();
  await deleteApp(app);
}
