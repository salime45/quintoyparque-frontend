import { buildProximityIndex, filterVisiblePairs } from "../lib/proximity.js";
import { buildPlaceSearchCatalog } from "../lib/place-search.js";

let snapshotPromise;
let proximity;
const searches = new Map();
export function loadSnapshot() {
  if (!snapshotPromise)
    snapshotPromise = fetch("/data/osm-places.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Datos todavía no publicados (HTTP " + response.status + ")",
          );
        if (!(response.headers.get("content-type") || "").includes("json"))
          throw new Error("Archivo de datos no disponible");
        const data = await response.json();
        if (!Array.isArray(data.elements) || !data.coverage)
          throw new Error("Formato de datos incorrecto");
        proximity = buildProximityIndex(data.elements, 150);
        return data;
      })
      .catch((error) => {
        snapshotPromise = undefined;
        throw error;
      });
  return snapshotPromise;
}
export async function loadVisiblePairs(bounds, radius) {
  const data = await loadSnapshot();
  return {
    data,
    pairs: filterVisiblePairs(
      data.elements,
      proximity,
      (item) => bounds.contains([item.lat, item.lon]),
      radius,
      data.parkMatches || [],
    ),
  };
}
export async function getSearchCatalog(radius) {
  const data = await loadSnapshot();
  if (!searches.has(radius))
    searches.set(
      radius,
      buildPlaceSearchCatalog(
        data.elements,
        proximity,
        data.parkMatches || [],
        radius,
      ),
    );
  return searches.get(radius);
}
