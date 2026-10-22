import { fingerprint, buildCatalogDocuments } from "../catalog-documents.mjs";

export const NATIONAL_PATH = "osmCatalogTest/espana";
export const BLOCK_COUNT = 4096;
export const blockIdFor = (id) => fingerprint(id).slice(0, 3);
export const hashesOf = (records) => Object.fromEntries(records.map(([id, item]) => [id, item.contentHash]));
export function createBundle(snapshot) {
  const allDocuments = buildCatalogDocuments(snapshot);
  const relatedParks = new Set(), usefulVenues = new Set();
  for (const [id, place] of allDocuments) {
    if (place.nearbyPlaygrounds?.length) {
      usefulVenues.add(id);
      place.nearbyPlaygrounds.forEach((park) => relatedParks.add(park.id));
    }
  }
  const documents = new Map([...allDocuments].filter(([id, place]) => usefulVenues.has(id) || relatedParks.has(place.id)));
  const groups = new Map(Array.from({ length: BLOCK_COUNT }, (_, index) => [index.toString(16).padStart(3, "0"), []]));
  for (const record of documents) groups.get(blockIdFor(record[0])).push(record);
  const blocks = [...groups].map(([id, records]) => {
    records.sort(([a], [b]) => a.localeCompare(b));
    if (records.length > 4000) throw Error("Bloque demasiado grande; ampliar particionado antes de importar");
    const hash = fingerprint(records);
    return { id, hash, count: records.length, records };
  });
  const manifest = {
    schemaVersion: 1, region: "espana", license: "ODbL", generatedAt: snapshot.generatedAt,
    source: snapshot.source, coverage: snapshot.coverage,
    sources: snapshot.sources || [], territories: snapshot.territories || [],
    totals: { documentJsonBytes: [...documents.values()].reduce((total, document) => total + Buffer.byteLength(JSON.stringify(document)), 0),
      sourcePlaces: allDocuments.size, places: documents.size, venues: usefulVenues.size, playgrounds: relatedParks.size,
      sourcePlaygrounds: snapshot.elements.filter((item) => item.tags?.leisure === "playground").length,
      parkMatches: snapshot.parkMatches.length, parkAreas: snapshot.parkAreaCount },
    blocks: blocks.map(({ records, ...block }) => block),
  };
  manifest.revision = fingerprint(manifest.blocks);
  return { manifest, blocks };
}
export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.region !== "espana" || manifest.license !== "ODbL" ||
      !manifest.coverage || !Number.isFinite(Date.parse(manifest.generatedAt)) ||
      !Array.isArray(manifest.blocks) || manifest.blocks.length !== BLOCK_COUNT ||
      manifest.revision !== fingerprint(manifest.blocks)) throw Error("Manifiesto nacional inválido");
  if (![manifest.coverage.south, manifest.coverage.west, manifest.coverage.north, manifest.coverage.east].every(Number.isFinite)) throw Error("Cobertura nacional inválida");
  for (let index = 0; index < BLOCK_COUNT; index++) {
    const block = manifest.blocks[index];
    if (block.id !== index.toString(16).padStart(3, "0") || !Number.isInteger(block.count) || block.count < 0 || block.count > 4000 || !/^[a-f0-9]{64}$/.test(block.hash)) {
      throw Error("Bloques de importación inválidos");
    }
  }
  if (manifest.blocks.reduce((total, block) => total + block.count, 0) !== manifest.totals.places) throw Error("Recuento nacional inconsistente");
}
export function volumeReport(manifest, maxWrites = 5000) {
  validateManifest(manifest);
  const nonEmpty = manifest.blocks.filter((block) => block.count).length;
  const extraBatches = manifest.blocks.reduce((total, block) => total + Math.max(0, Math.ceil(block.count / 200) - 1), 0);
  const estimatedInitialOperations = manifest.totals.places + 2 * (nonEmpty + extraBatches) + 3;
  return { ...manifest.totals, sources: manifest.territories, blocks: manifest.blocks.length,
    nonEmptyBlocks: nonEmpty, estimatedInitialOperations,
    minimumRunsAtConfiguredLimit: Math.ceil(estimatedInitialOperations / (maxWrites - 2)), maxWritesPerRun: maxWrites,
    note: "Estimación inicial; incluye progreso por lotes. No representa la cuota disponible del proyecto. Las reanudaciones pueden añadir pequeñas escrituras de control." };
}
