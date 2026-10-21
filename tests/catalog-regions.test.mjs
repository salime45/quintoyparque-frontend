import test from "node:test";
import assert from "node:assert/strict";
import { catalogRegions, catalogPath, getCatalogRegion, regionForPosition, regionTiles, regionsFromArgs } from "../src/lib/catalog-regions.js";
import { createRegionalCatalog } from "../src/lib/geo-catalog.js";

const boundsAt = (lat, lng) => ({
  getCenter: () => ({ lat, lng }),
  getSouth: () => lat - 0.005, getNorth: () => lat + 0.005,
  getWest: () => lng - 0.005, getEast: () => lng + 0.005,
});

test("La cobertura de Madrid incluye los municipios acordados", () => {
  const municipalities = {
    Madrid: [40.4168, -3.7038], Alcobendas: [40.5373, -3.6372],
    "San Sebastián de los Reyes": [40.5475, -3.6265], "Tres Cantos": [40.6007, -3.7081],
    Pozuelo: [40.4359, -3.8136], Majadahonda: [40.4735, -3.8724],
    "Las Rozas": [40.4929, -3.8737], Boadilla: [40.4075, -3.8766],
    Alcorcón: [40.3458, -3.8249], Móstoles: [40.3228, -3.865],
    Leganés: [40.3272, -3.7635], Getafe: [40.308, -3.7327],
    Fuenlabrada: [40.2839, -3.8], Parla: [40.237, -3.773], Pinto: [40.241, -3.699],
    Rivas: [40.35, -3.532], Coslada: [40.4238, -3.5613],
    "San Fernando": [40.425, -3.536], Torrejón: [40.4568, -3.4758], Alcalá: [40.4819, -3.3648],
  };
  for (const [name, [lat, lng]] of Object.entries(municipalities)) {
    assert.equal(regionForPosition({ lat, lng })?.id, "madrid", name);
  }
  assert.equal(regionForPosition({ lat: 39.47, lng: -0.38 })?.id, "valencia");
  assert.equal(regionForPosition({ lat: 39.9, lng: -2 }), undefined);
  assert.equal(regionForPosition({ lat: 41.3874, lng: 2.1686 }), undefined);
});

test("Las teselas cubren el rectángulo completo y las rutas solo aceptan regiones configuradas", () => {
  for (const region of catalogRegions) {
    const tiles = regionTiles(region);
    assert.equal(tiles.length, region.rows * region.columns);
    assert.equal(tiles[0][0], region.coverage.south);
    assert.equal(tiles[0][1], region.coverage.west);
    assert.equal(tiles.at(-1)[2], region.coverage.north);
    assert.equal(tiles.at(-1)[3], region.coverage.east);
    assert.equal(catalogPath(region.id), `osmCatalogTest/${region.id}`);
  }
  assert.equal(regionsFromArgs(["--region=all"]).length, 2);
  assert.equal(regionsFromArgs(["--region=madrid"])[0].id, "madrid");
  assert.throws(() => getCatalogRegion("../valencia"));
});

test("El mapa cambia de catálogo y conserva cachés independientes al volver a una región", async () => {
  const metadataCalls = [], rangeCalls = [];
  const load = createRegionalCatalog({
    async readMetadata(id) {
      metadataCalls.push(id);
      return { schemaVersion: 1, revision: "same-version", coverage: getCatalogRegion(id).coverage };
    },
    async readRange(id) {
      rangeCalls.push(id);
      const [lat, lon] = getCatalogRegion(id).center;
      return [{ id: id === "madrid" ? "node/2" : "node/1", lat, lon, tags: { amenity: "cafe" } }];
    },
  });
  const valencia = boundsAt(...getCatalogRegion("valencia").center);
  const madrid = boundsAt(...getCatalogRegion("madrid").center);
  assert.equal((await load(valencia)).elements[0].id, "node/1");
  assert.equal((await load(madrid)).elements[0].id, "node/2");
  const calls = rangeCalls.length;
  assert.equal((await load(valencia)).elements[0].id, "node/1");
  assert.equal(rangeCalls.length, calls);
  assert.deepEqual(metadataCalls, ["valencia", "madrid"]);
  const outside = await load(boundsAt(41.3874, 2.1686));
  assert.equal(outside.covered, false);
  assert.equal(rangeCalls.length, calls);
});

test("Una región sin importar permite reintentar sin impedir consultar la otra", async () => {
  let ready = false;
  const load = createRegionalCatalog({
    async readMetadata(id) {
      if (id === "madrid" && !ready) return undefined;
      return { schemaVersion: 1, revision: "v1", coverage: getCatalogRegion(id).coverage };
    },
    async readRange() { return []; },
  });
  await assert.rejects(load(boundsAt(40.4168, -3.7038)), /Madrid/);
  assert.equal((await load(boundsAt(39.4699, -0.3763))).covered, true);
  ready = true;
  assert.equal((await load(boundsAt(40.4168, -3.7038))).covered, true);
});
