import { fingerprint } from "../catalog-documents.mjs";
import { validateManifest } from "./bundle.mjs";
import { venuePhoto } from "../../src/lib/venue-photo.js";

// Mantener los índices del importador permite reanudar y omitir bloques intactos.
export function enrichPhotos(original, blocks, references) {
  validateManifest(original);
  let modified = 0, changedBlocks = 0, photos = 0, bytes = 0;
  const samples = [];
  const enriched = original.blocks.map((block) => {
    const records = blocks.get(block.id) || [];
    if (records.length !== block.count || fingerprint(records) !== block.hash)
      throw Error(`Bloque de origen alterado: ${block.id}`);
    const next = records.map(([id, document]) => {
      const { contentHash, ...content } = document;
      if (fingerprint(content) !== contentHash) throw Error(`Documento alterado: ${id}`);
      const reference = references[document.id];
      const supported = ["bar", "cafe", "restaurant", "fast_food"].includes(document.tags?.amenity);
      const tags = { ...document.tags };
      for (const key of ["image", "wikimedia_commons"]) {
        if (supported && typeof reference?.[key] === "string" && reference[key].length <= 2048)
          tags[key] = reference[key];
      }
      let updated = document;
      if (supported && venuePhoto({ tags })) {
        photos++;
        const data = { ...content, tags };
        const hash = fingerprint(data);
        if (hash !== contentHash) {
          modified++;
          updated = { ...data, contentHash: hash };
          if (samples.length < 30) samples.push({ id: document.id, name: tags.name,
            lat: document.lat, lon: document.lon, dist: document.nearbyPlaygrounds?.length,
            photo: venuePhoto({ tags }) });
        }
      }
      bytes += Buffer.byteLength(JSON.stringify(updated));
      return [id, updated];
    });
    const hash = fingerprint(next);
    if (hash !== block.hash) changedBlocks++;
    return { id: block.id, hash, count: next.length, records: next };
  });
  const manifest = { ...original, totals: { ...original.totals, documentJsonBytes: bytes },
    blocks: enriched.map(({ records, ...block }) => block) };
  manifest.revision = fingerprint(manifest.blocks);
  validateManifest(manifest);
  return { manifest, blocks: enriched, report: {
    originalRevision: original.revision, revision: manifest.revision,
    venuesWithPhotos: photos, modifiedVenues: modified, changedBlocks,
    estimatedWrites: modified ? modified + 2 * changedBlocks + 5 : 0,
    samples,
  } };
}
