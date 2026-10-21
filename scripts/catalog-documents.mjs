import { createHash } from "node:crypto";
import { geohashForLocation } from "geofire-common";
import { distance } from "../src/lib/places.js";

export const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isPark = (item) => item.tags?.leisure === "playground";
const isVenue = (item) => ["cafe", "bar", "restaurant", "fast_food"].includes(item.tags?.amenity);

export function buildCatalogDocuments(snapshot) {
  if (snapshot?.schemaVersion !== 2 || snapshot.license !== "ODbL" ||
      !Array.isArray(snapshot.elements) || !Array.isArray(snapshot.parkMatches) ||
      !snapshot.coverage || !Number.isFinite(Date.parse(snapshot.generatedAt))) {
    throw Error("Catálogo OSM inválido: no se escribirá en Firestore");
  }
  const area = snapshot.coverage;
  if (![area.south, area.north, area.west, area.east].every(Number.isFinite) ||
      area.south >= area.north || area.west >= area.east) throw Error("Cobertura inválida");
  const parks = snapshot.elements.filter(isPark);
  const byId = new Map();
  for (const element of snapshot.elements) {
    if (!/^(node|way|relation)\/[0-9]+$/.test(element.id) || byId.has(element.id) ||
        !Number.isFinite(element.lat) || !Number.isFinite(element.lon) ||
        Math.abs(element.lat) > 90 || Math.abs(element.lon) > 180 ||
        (!isPark(element) && !isVenue(element))) throw Error("Lugar OSM inválido o duplicado");
    byId.set(element.id, element);
  }
  const matches = new Map();
  for (const match of snapshot.parkMatches) {
    if (!isVenue(byId.get(match.venueId) || {}) || !isPark(byId.get(match.playgroundId) || {})) {
      throw Error("Asociación de parque incompleta");
    }
    matches.set(match.venueId, match);
  }
  const documents = new Map();
  for (const element of snapshot.elements) {
    const document = { ...element, geohash: geohashForLocation([element.lat, element.lon]) };
    if (isVenue(element)) {
      // Incluir los puntos relacionados hace que una consulta de locales no
      // dependa de que su zona infantil caiga en el círculo consultado.
      const nearby = parks.filter((park) => distance(element, park) <= 151);
      const match = matches.get(element.id);
      if (match) {
        const playground = byId.get(match.playgroundId);
        if (!nearby.some((park) => park.id === playground.id)) nearby.push(playground);
        document.parkMatch = match;
      }
      document.nearbyPlaygrounds = nearby.sort((a, b) => a.id.localeCompare(b.id));
    }
    document.contentHash = fingerprint(document);
    documents.set(element.id.replace("/", "_"), document);
  }
  return documents;
}

export function planCatalogSync(documents, existing) {
  return {
    upserts: [...documents].filter(([id, value]) => existing.get(id)?.contentHash !== value.contentHash),
    removed: [...existing.keys()].filter((id) => !documents.has(id)),
  };
}
