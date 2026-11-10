import test from "node:test";
import assert from "node:assert/strict";
import { createBundle } from "../scripts/national/bundle.mjs";
import { enrichPhotos } from "../scripts/national/photo-bundle.mjs";
import { importBundle } from "../scripts/national/importer.mjs";
import { nationalFixture } from "./national-fixture.mjs";

test("El enriquecimiento solo cambia fotos de locales existentes y mantiene hashes coherentes", async () => {
  const original = createBundle(nationalFixture());
  const blocks = new Map(original.blocks.map((block) => [block.id, block.records]));
  const result = enrichPhotos(original.manifest, blocks, {
    "node/2": { image: "https://example.org/bar.jpg", name: "Nombre ajeno" },
    "node/1": { image: "https://example.org/parque.jpg" },
    "node/4": { wikimedia_commons: "Category:Locales" },
    "node/999": { image: "https://example.org/fuera.jpg" },
  });
  assert.equal(result.report.modifiedVenues, 1);
  assert.equal(result.report.estimatedWrites, 8);
  const previous = new Map(original.blocks.flatMap((block) => block.records));
  const updated = new Map(result.blocks.flatMap((block) => block.records));
  assert.equal(updated.size, previous.size);
  for (const [id, document] of updated) {
    if (id !== "node_2") assert.deepEqual(document, previous.get(id));
  }
  assert.deepEqual(updated.get("node_2").tags, { amenity: "cafe", image: "https://example.org/bar.jpg" });
  const remote = new Map();
  let writes = 0;
  const store = {
    async get(path) { return remote.has(path) ? { data: remote.get(path), updateTime: "version" } : null; },
    async commit(operations) {
      writes += operations.length;
      for (const { path, data } of operations) remote.set(path, data);
    },
  };
  await importBundle(store, original.manifest, async (id) => blocks.get(id), { maxWrites: 100, sleep: async () => {} });
  writes = 0;
  await importBundle(store, result.manifest,
    async (id) => result.blocks.find((block) => block.id === id).records,
    { maxWrites: 100, sleep: async () => {} });
  assert.equal(writes, result.report.estimatedWrites);
  assert.equal(remote.get("osmCatalogTest/espana/places/node_2").tags.image, "https://example.org/bar.jpg");
  const repeated = enrichPhotos(result.manifest,
    new Map(result.blocks.map((block) => [block.id, block.records])), { "node/2": { image: "https://example.org/bar.jpg" } });
  assert.equal(repeated.report.modifiedVenues, 0);
  assert.equal(repeated.manifest.revision, result.manifest.revision);
});
