import { nationalCoverage } from "../src/lib/catalog-regions.js";
export function nationalFixture() {
  const elements = [];
  for (const [index, [lat, lon]] of [[41.3874, 2.1686], [28.1235, -15.4363], [35.8894, -5.3213], [35.2923, -2.9381]].entries()) {
    elements.push({ id: `node/${index * 2 + 1}`, lat, lon, tags: { leisure: "playground" } },
      { id: `node/${index * 2 + 2}`, lat: lat + 0.0001, lon, tags: { amenity: "cafe" } });
  }
  elements.push({ id: "node/999", lat: 40, lon: 0, tags: { amenity: "bar" } });
  return { schemaVersion: 2, generatedAt: "2026-10-22T00:00:00Z", license: "ODbL", source: "OSM test fixture", coverage: nationalCoverage, elements, parkMatches: [], parkAreaCount: 0 };
}
