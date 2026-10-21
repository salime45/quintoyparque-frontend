import { distanceBetween, geohashQueryBounds } from "geofire-common";

import { regionForPosition, containsPosition } from "./catalog-regions.js";
export const usesGeoCatalog = import.meta.env?.VITE_CATALOG_SOURCE === "firestore";

// Consultas puntuales, sin listeners. Los rangos se reutilizan durante cinco
// minutos y se acotan en memoria para no acumular ciudades al navegar.
export function createGeoLoader(readRange, { ttl = 300000, maxEntries = 64 } = {}) {
  const cache = new Map();
  let revision;
  return async function load(center, radiusMeters, version) {
    if (version !== revision) {
      cache.clear();
      revision = version;
    }
    const ranges = geohashQueryBounds(center, radiusMeters);
    const groups = await Promise.all(ranges.map(([start, end]) => {
      const key = `${start}:${end}`;
      let entry = cache.get(key);
      if (!entry || Date.now() - entry.at >= ttl) {
        entry = { at: Date.now() };
        entry.promise = Promise.resolve().then(() => readRange(start, end))
          .catch((error) => {
            if (cache.get(key) === entry) cache.delete(key);
            throw error;
          });
        cache.set(key, entry);
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      }
      return entry.promise;
    }));
    // Los geohashes cubren rectángulos, no círculos: deduplicar y descartar
    // falsos positivos ANTES de incorporar las relaciones del local.
    const documents = new Map();
    for (const document of groups.flat()) {
      if (Number.isFinite(document.lat) && Number.isFinite(document.lon) &&
          distanceBetween(center, [document.lat, document.lon]) * 1000 <= radiusMeters) {
        documents.set(document.id, document);
      }
    }
    return [...documents.values()];
  };
}

export function queryArea(bounds) {
  const center = bounds.getCenter();
  const origin = [center.lat, center.lng];
  const radius = Math.max(...[
    [bounds.getSouth(), bounds.getWest()],
    [bounds.getSouth(), bounds.getEast()],
    [bounds.getNorth(), bounds.getWest()],
    [bounds.getNorth(), bounds.getEast()],
  ].map((corner) => distanceBetween(origin, corner) * 1000)) + 150;
  if (radius > 20000) throw Error("Acerca el mapa para buscar en una zona de hasta 20 km.");
  return { center: origin, radius };
}

export function unpackGeoDocuments(documents) {
  const elements = new Map();
  const matches = new Map();
  for (const document of documents) {
    const { geohash, contentHash, nearbyPlaygrounds, parkMatch, ...place } = document;
    elements.set(place.id, place);
    for (const park of nearbyPlaygrounds || []) elements.set(park.id, park);
    if (parkMatch) matches.set(parkMatch.venueId, parkMatch);
  }
  return { elements: [...elements.values()], parkMatches: [...matches.values()] };
}

// Cada región mantiene sus metadatos y caché: dos revisiones con el mismo
// valor en ciudades distintas nunca comparten resultados.
export function createRegionalCatalog({ readMetadata, readRange }) {
  const regions = new Map();
  return async function loadSnapshot(bounds) {
    const position = bounds.getCenter();
    const region = regionForPosition(position);
    if (!region) return { geo: true, covered: false, elements: [], parkMatches: [] };
    let state = regions.get(region.id);
    if (!state) {
      state = { load: createGeoLoader((start, end) => readRange(region.id, start, end)) };
      regions.set(region.id, state);
    }
    if (!state.metadata || Date.now() - state.metadataAt >= 300000) {
      if (!state.pending) {
        state.pending = Promise.resolve().then(() => readMetadata(region.id)).then((data) => {
          if (data?.schemaVersion !== 1 || !data.coverage || !data.revision) {
            throw Error(`El catálogo de ${region.label} todavía no está preparado`);
          }
          state.metadata = data;
          state.metadataAt = Date.now();
          return data;
        }).finally(() => { state.pending = undefined; });
      }
      await state.pending;
    }
    const data = state.metadata;
    if (!containsPosition(data.coverage, position)) {
      return { geo: true, covered: false, elements: [], parkMatches: [] };
    }
    const area = queryArea(bounds);
    const documents = await state.load(area.center, area.radius, data.revision);
    return { ...data, ...unpackGeoDocuments(documents), geo: true, covered: true, region: region.id };
  };
}
