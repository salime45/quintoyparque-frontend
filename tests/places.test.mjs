import test from "node:test";
import assert from "node:assert/strict";
import { visiblePlaces } from "../src/lib/places.js";
import {
  buildProximityIndex,
  filterVisiblePairs,
} from "../src/lib/proximity.js";
const park = {
  id: "way/1",
  lat: 39.47,
  lon: -0.38,
  tags: { leisure: "playground" },
};
const near = {
  id: "node/2",
  lat: 39.4701,
  lon: -0.38,
  tags: { amenity: "bar" },
};
const inside = {
  id: "node/3",
  lat: 39.472,
  lon: -0.38,
  tags: { amenity: "cafe" },
};
const elements = [park, near, inside];
const pairs = filterVisiblePairs(
  elements,
  buildProximityIndex(elements),
  () => true,
  60,
  [{ venueId: inside.id, playgroundId: park.id, parkName: "Parque de prueba" }],
);
test("Ordena primero los locales del recinto y conserva los que exceden el radio", () => {
  const result = visiblePlaces(pairs, 60, false, new Set(["node_2"]));
  assert.deepEqual(
    result.venues.map((item) => item.id),
    ["node/3", "node/2"],
  );
  assert.ok(result.venues[0].dist > 60);
  assert.equal(result.venues[0].park.id, park.id);
  assert.equal(result.venues[1].reviewed, true);
});
test("Solo verificados mantiene parques relacionados y elimina locales sin reseñas", () => {
  const result = visiblePlaces(pairs, 60, true, new Set(["node_3"]));
  assert.deepEqual(
    result.venues.map((item) => item.id),
    ["node/3"],
  );
  assert.equal(result.parks[0].id, park.id);
  assert.equal(result.parks[0].count, 1);
  assert.deepEqual(visiblePlaces(pairs, 60, true, new Set()), {
    parks: [],
    venues: [],
  });
});
