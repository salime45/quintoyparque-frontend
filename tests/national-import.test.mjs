import test from "node:test";
import assert from "node:assert/strict";
import { createBundle, volumeReport } from "../scripts/national/bundle.mjs";
import { importBundle } from "../scripts/national/importer.mjs";
import { createRestStore } from "../scripts/national/rest-store.mjs";

import { nationalFixture } from "./national-fixture.mjs";
function memoryStore() {
  const records = new Map();
  let version = 0;
  return { records, writes: 0, commits: 0, reads: 0, placeWrites: 0,
    async get(path) { this.reads++; return records.has(path) ? structuredClone(records.get(path)) : null; },
    async commit(operations) {
      for (const { path, precondition } of operations) {
        if (precondition?.exists === false) assert.equal(records.has(path), false);
        if (precondition?.updateTime) assert.equal(records.get(path)?.updateTime, precondition.updateTime);
      }
      this.commits++;
      this.writes += operations.length;
      this.placeWrites += operations.filter((item) => item.path.includes("/places/")).length;
      for (const { path, data } of operations) {
        if (data === undefined) records.delete(path);
        else records.set(path, { data: structuredClone(data), updateTime: String(++version) });
      }
    },
  };
}
const options = { maxWrites: 6, sleep: async () => {} };
test("El informe es local y omite locales que no tienen zona infantil relacionada", () => {
  const { manifest } = createBundle(nationalFixture());
  const report = volumeReport(manifest);
  assert.equal(report.sourcePlaces, 9);
  assert.equal(report.places, 8);
  assert.equal(report.blocks, 4096);
});
test("La importación respeta el límite, reanuda sin duplicar y solo activa al terminar", async () => {
  const { manifest, blocks } = createBundle(nationalFixture());
  const store = memoryStore(), load = async (id) => blocks.find((item) => item.id === id).records;
  let result, runs = 0;
  do {
    const before = store.writes;
    result = await importBundle(store, manifest, load, options);
    assert.ok(store.writes - before <= options.maxWrites);
    if (!result.complete) assert.equal(store.records.has("osmCatalogTest/espana"), false);
    assert.ok(++runs < 20);
  } while (!result.complete);
  assert.equal([...store.records.keys()].filter((path) => path.includes("/places/")).length, 8);
  const before = store.writes;
  assert.equal((await importBundle(store, manifest, load, options)).alreadyCurrent, true);
  assert.equal(store.writes, before);
});
test("Un fallo después de un commit se recupera con su progreso atómico", async () => {
  const { manifest, blocks } = createBundle(nationalFixture());
  const store = memoryStore(), original = store.commit.bind(store);
  let fail = true;
  store.commit = async (operations) => {
    await original(operations);
    if (fail && operations.some((item) => item.path.includes("/places/"))) { fail = false; throw Error("Respuesta perdida"); }
  };
  await assert.rejects(importBundle(store, manifest, async (id) => blocks.find((item) => item.id === id).records, options));
  const result = await importBundle(store, manifest, async (id) => blocks.find((item) => item.id === id).records, { ...options, maxWrites: 100 });
  assert.equal(result.complete, true);
  assert.equal([...store.records.keys()].filter((path) => path.includes("/places/")).length, 8);
});
test("Los errores de cuota REST no se reintentan ni se convierten en éxito", async () => {
  let calls = 0;
  const store = createRestStore({ projectId: "demo-quintoyparque", fetcher: async () => {
    calls++; return { status: 429, ok: false, json: async () => ({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }) };
  } });
  await assert.rejects(store.commit([{ path: "osmCatalogTest/espana/imports/control", data: { test: true } }]), /RESOURCE_EXHAUSTED/);
  assert.equal(calls, 1);
});


test("Una actualización lee solo resúmenes de bloques cambiados y conserva las otras colecciones", async () => {
  const store = memoryStore(), fixture = nationalFixture();
  const first = createBundle(fixture);
  await importBundle(store, first.manifest, async (id) => first.blocks.find((block) => block.id === id).records, { ...options, maxWrites: 100 });
  const before = store.placeWrites;
  fixture.elements.find((item) => item.id === "node/2").tags.name = "Nombre actualizado";
  const second = createBundle(fixture);
  store.reads = 0;
  await importBundle(store, second.manifest, async (id) => second.blocks.find((block) => block.id === id).records, { ...options, maxWrites: 100 });
  assert.equal(store.placeWrites - before, 1);
  assert.ok(store.reads < 20, "No se escanea el catálogo ni todos los bloques");
  store.records.set("osmCatalogTest/valencia/places/node_1", { data: { preserved: true } });
  fixture.elements = fixture.elements.filter((item) => !["node/1", "node/2"].includes(item.id));
  const third = createBundle(fixture);
  await importBundle(store, third.manifest, async (id) => third.blocks.find((block) => block.id === id).records, { ...options, maxWrites: 100 });
  assert.equal(store.records.has("osmCatalogTest/espana/places/node_2"), false);
  assert.equal(store.records.has("osmCatalogTest/valencia/places/node_1"), true);
});


test("Una caída sospechosa del volumen se rechaza antes de escribir", async () => {
  const store = memoryStore();
  const { manifest, blocks } = createBundle(nationalFixture());
  store.records.set("osmCatalogTest/espana", { data: { complete: true, revision: "previous", totals: { places: 100 }, generatedAt: "2026-10-01T00:00:00Z" } });
  await assert.rejects(importBundle(store, manifest, async (id) => blocks.find((block) => block.id === id).records, options), /Caída sospechosa/);
  assert.equal(store.writes, 0);
});
