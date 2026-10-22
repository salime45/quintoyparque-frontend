import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { getCatalogRegion } from "../src/lib/catalog-regions.js";
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
  const madrid = {
    ...snapshot, coverage: getCatalogRegion("madrid").coverage,
    elements: [
      { id: "way/201", lat: 40.4169, lon: -3.7038, tags: { leisure: "playground", name: "Parque de Madrid" } },
      { id: "node/200", lat: 40.4168, lon: -3.7038, tags: { amenity: "cafe", name: "Café de Madrid" } },
      { id: "way/202", lat: 40.3081, lon: -3.7327, tags: { leisure: "playground", name: "Parque de Getafe" } },
      { id: "node/203", lat: 40.308, lon: -3.7327, tags: { amenity: "cafe", name: "Café de Getafe" } },
    ],
  };
  for (const [id, document] of buildCatalogDocuments(madrid)) {
    batch.set(db.doc(`osmCatalogTest/madrid/places/${id}`), document);
  }
  batch.set(db.doc("osmCatalogTest/madrid"), {
    schemaVersion: 1, revision: "e2e-v1", coverage: madrid.coverage, generatedAt: madrid.generatedAt,
  });
  const national = {
    ...snapshot,
    elements: [
      ...snapshot.elements, ...madrid.elements,
      { id: "node/300", lat: 41.3874, lon: 2.1686, tags: { amenity: "cafe", name: "Café de Barcelona" } },
      { id: "way/301", lat: 41.3875, lon: 2.1686, tags: { leisure: "playground", name: "Parque de Barcelona" } },
      { id: "node/400", lat: 28.1235, lon: -15.4363, tags: { amenity: "cafe", name: "Café de Canarias" } },
      { id: "way/401", lat: 28.1236, lon: -15.4363, tags: { leisure: "playground", name: "Parque de Canarias" } },
    ],
  };
  for (const [id, document] of buildCatalogDocuments(national)) {
    batch.set(db.doc(`osmCatalogTest/espana/places/${id}`), document);
  }
  batch.set(db.doc("osmCatalogTest/espana"), {
    schemaVersion: 1, complete: true, revision: "national-e2e-v1", generatedAt: national.generatedAt,
    coverage: { south: 27.5, west: -18.3, north: 43.9, east: 4.6 },
  });
  await batch.commit();
} finally {
  await env.cleanup();
  await deleteApp(app);
}
