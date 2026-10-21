import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, orderBy, startAt, endAt } from "firebase/firestore";
import { createGeoLoader } from "../src/lib/geo-catalog.js";
import { syncCatalog } from "../scripts/sync-firestore-catalog.mjs";

// Utiliza el catálogo real versionado, pero SOLO escribe en el emulador.
test("Importación real, consultas acotadas y sincronización idempotente", async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Se requiere el emulador");
  const env = await initializeTestEnvironment({ projectId: "demo-quintoyparque", firestore: { rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  const app = initializeApp({ projectId: "demo-quintoyparque" });
  try {
    const db = getFirestore(app);
    const snapshot = JSON.parse(await readFile("public/data/osm-places.json", "utf8"));
    const planned = await syncCatalog(db, snapshot);
    assert.equal((await db.doc("osmCatalogTest/valencia").get()).exists, false);
    assert.equal(planned.modified, snapshot.elements.length);
    const first = await syncCatalog(db, snapshot, { write: true });
    const second = await syncCatalog(db, snapshot, { write: true });
    assert.equal(first.modified, snapshot.elements.length);
    assert.equal(second.modified, 0);
    assert.equal(second.removed, 0);
    await assert.rejects(syncCatalog(db, { ...snapshot, elements: snapshot.elements.slice(0, 10) }, { write: true }));
    assert.equal((await db.collection("osmCatalogTest/valencia/places").count().get()).data().count, first.total);
    let ranges = 0, returned = 0;
    const client = env.unauthenticatedContext().firestore();
    const loader = createGeoLoader(async (start, end) => {
      ranges++;
      const result = await getDocs(query(collection(client, "osmCatalogTest/valencia/places"), orderBy("geohash"), startAt(start), endAt(end)));
      returned += result.size;
      return result.docs.map((document) => document.data());
    });
    const nearby = await loader([39.4699, -0.3763], 1000, "v1");
    assert.ok(nearby.length > 0);
    assert.ok(returned < first.total);
    const reads = returned, calls = ranges;
    await loader([39.4699, -0.3763], 1000, "v1");
    assert.equal(returned, reads);
    assert.equal(ranges, calls);
    console.log(JSON.stringify({ catalogue: first.total, geohashRanges: ranges, documentsReturned: returned, withinOneKm: nearby.length, repeatedQueryAdditionalReads: 0 }));
  } finally {
    await env.cleanup();
    await deleteApp(app);
  }
});
