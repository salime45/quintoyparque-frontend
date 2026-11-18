import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, where } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import { addManualPlace } from "../scripts/manual-places.mjs";
import { publishedPlaceSearchEntry } from "../src/lib/place-search.js";

test("Vista previa, publicación legible por la web y rechazo de duplicados concurrentes", async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Solo se ejecuta contra el emulador");
  const env = await initializeTestEnvironment({ projectId: "demo-quintoyparque", firestore: { rules: await readFile("firestore.rules", "utf8") } });
  const app = initializeApp({ projectId: "demo-quintoyparque" });
  try {
    await env.clearFirestore();
    const db = getFirestore(app);
    const input = { name: "Café manual de prueba", address: "Calle de prueba, 1", lat: 39.47, lng: -0.37, category: "cafe", source: "Prueba", sourceRef: "Datos ficticios del emulador" };
    await db.doc("osmCatalogTest/espana").set({ complete: true, revision: "manual-e2e", schemaVersion: 1,
      generatedAt: "2026-11-18T00:00:00Z", coverage: { south: 27.5, west: -18.3, north: 43.9, east: 4.6 } });
    await db.doc("osmCatalogTest/espana/places/node_1").set({ id: "node/1", lat: 39.4703, lon: -0.37,
      geohash: geohashForLocation([39.4703, -0.37]), tags: { leisure: "playground" } });
    const preview = await addManualPlace(db, input);
    assert.equal(preview.written, false);
    assert.equal((await db.collection("places").get()).size, 0);
    const outcomes = await Promise.allSettled([addManualPlace(db, input, { write: true }), addManualPlace(db, { ...input, lat: input.lat + 0.00001 }, { write: true })]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(outcomes.find((result) => result.status === "rejected").reason.message, /duplicados/);
    const client = env.unauthenticatedContext().firestore();
    const published = await getDocs(query(collection(client, "places"), where("status", "==", "published")));
    assert.equal(published.size, 1);
    const record = published.docs[0];
    assert.ok(record.data().createdAt.toDate());
    assert.equal(publishedPlaceSearchEntry(record.id, record.data()).label, input.name);
    await assert.rejects(addManualPlace(db, input, { write: true }), /duplicados/);
    // Los locales ya existentes en OSM tampoco deben darse de alta manualmente.
    await db.doc("osmCatalogTest/espana/places/node_2").set({ id: "node/2", lat: 39.4701, lon: -0.37,
      geohash: geohashForLocation([39.4701, -0.37]), tags: { amenity: "cafe", name: "Otro café" } });
    await assert.rejects(addManualPlace(db, { ...input, name: "Otro café" }, { write: true }), /duplicados/);
    await assert.rejects(addManualPlace(db, { ...input, lat: 28 }, { write: true }), /zona infantil/);
    assert.equal((await db.collection("places").get()).size, 1);
  } finally {
    await env.cleanup();
    await deleteApp(app);
  }
});
