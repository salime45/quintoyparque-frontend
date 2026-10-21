import test from "node:test";
import assert from "node:assert/strict";
import { createGeoLoader, unpackGeoDocuments } from "../src/lib/geo-catalog.js";
import { buildCatalogDocuments, planCatalogSync } from "../scripts/catalog-documents.mjs";
import { buildProximityIndex, filterVisiblePairs } from "../src/lib/proximity.js";

const park = { id: "way/1", lat: 39.47, lon: -0.38, tags: { leisure: "playground" } };
const venue = { id: "node/2", lat: 39.4702, lon: -0.38, tags: { amenity: "bar" } };
const snapshot = (elements = [park, venue], parkMatches = []) => ({
  schemaVersion: 2, license: "ODbL", generatedAt: "2026-10-01T00:00:00Z",
  coverage: { south: 39, north: 40, west: -1, east: 0 }, elements, parkMatches,
});

test("Las consultas geográficas deduplican, filtran falsos positivos y reutilizan rangos", async () => {
  let calls = 0;
  const loader = createGeoLoader(async () => { calls++; return [park, venue, { ...venue, id: "node/3", lat: 40 }]; });
  const result = await loader([39.47, -0.38], 1000, "v1");
  assert.deepEqual(result.map((item) => item.id), [park.id, venue.id]);
  const firstCalls = calls;
  await loader([39.47, -0.38], 1000, "v1");
  assert.equal(calls, firstCalls);
  await loader([39.47, -0.38], 1000, "v2");
  assert.ok(calls > firstCalls);
});

test("Una consulta fallida se puede reintentar y la caché caduca", async () => {
  let fail = true, calls = 0;
  const loader = createGeoLoader(async () => { calls++; if (fail) throw Error("Sin conexión"); return [park]; });
  await assert.rejects(loader([39.47, -0.38], 1000, "v1"));
  fail = false;
  assert.equal((await loader([39.47, -0.38], 1000, "v1")).length, 1);
  const uncached = createGeoLoader(async () => { calls++; return []; }, { ttl: 0 });
  await uncached([39.47, -0.38], 1000, "v1");
  const previous = calls;
  await uncached([39.47, -0.38], 1000, "v1");
  assert.ok(calls > previous);
});

test("El local conserva un parque fuera del área y los radios de 60/100/150 m", () => {
  const distant = { ...park, lat: venue.lat + 90 / 111195 };
  const documents = buildCatalogDocuments(snapshot([distant, venue]));
  const loaded = unpackGeoDocuments([documents.get("node_2")]);
  assert.ok(loaded.elements.some((item) => item.id === park.id));
  const index = buildProximityIndex(loaded.elements, 150);
  const visible = (item) => item.id === venue.id;
  assert.equal(filterVisiblePairs(loaded.elements, index, visible, 60, [], true).venues.length, 0);
  for (const radius of [100, 150]) {
    const result = filterVisiblePairs(loaded.elements, index, visible, radius, [], true);
    assert.equal(result.venues.length, 1);
    assert.equal(result.nearestParkByVenue.get(venue.id).id, park.id);
  }
});

test("La pertenencia al mismo parque sobrevive aunque la zona infantil esté muy lejos", () => {
  const far = { ...park, lat: 39.48 };
  const match = { venueId: venue.id, playgroundId: park.id, parkId: "way/99", parkName: "Parque urbano" };
  const documents = buildCatalogDocuments(snapshot([far, venue], [match]));
  const loaded = unpackGeoDocuments([documents.get("node_2")]);
  const result = filterVisiblePairs(loaded.elements, buildProximityIndex(loaded.elements), () => true, 60, loaded.parkMatches, true);
  assert.equal(result.venues.length, 1);
  assert.ok(result.venueDistances.get(venue.id) > 150);
});

test("La sincronización mantiene los IDs de reseñas y solo actualiza datos modificados", () => {
  const documents = buildCatalogDocuments(snapshot());
  assert.equal(documents.get("node_2").id, "node/2");
  assert.deepEqual(planCatalogSync(documents, documents), { upserts: [], removed: [] });
  const changed = buildCatalogDocuments(snapshot([park, { ...venue, tags: { amenity: "cafe" } }]));
  assert.deepEqual(planCatalogSync(changed, documents).upserts.map(([id]) => id), ["node_2"]);
  assert.deepEqual(planCatalogSync(new Map(), documents).removed.sort(), ["node_2", "way_1"]);
  assert.throws(() => buildCatalogDocuments(snapshot([park, { ...venue, lat: NaN }])));
  assert.throws(() => buildCatalogDocuments(snapshot([park, park])));
});
