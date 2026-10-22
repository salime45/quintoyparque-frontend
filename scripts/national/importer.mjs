import { randomUUID } from "node:crypto";
import { NATIONAL_PATH as root, validateManifest, hashesOf } from "./bundle.mjs";
import { fingerprint } from "../catalog-documents.mjs";

export async function importBundle(store, manifest, loadBlock, { maxWrites = 5000, writesPerSecond = 100, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  validateManifest(manifest);
  if (!Number.isInteger(maxWrites) || maxWrites < 6 || maxWrites > 19000) throw Error("max-writes debe estar entre 6 y 19000");
  if (!Number.isFinite(writesPerSecond) || writesPerSecond <= 0 || writesPerSecond > 200) throw Error("El ritmo debe estar entre 1 y 200 operaciones/s");
  const active = (await store.get(root))?.data;
  if (active?.revision === manifest.revision && active.complete) return { complete: true, writes: 0, alreadyCurrent: true };
  if (active?.totals?.places && manifest.totals.places < active.totals.places * 0.75) throw Error("Caída sospechosa del catálogo nacional; revisa las fuentes antes de importar");
  if (active && Date.parse(active.generatedAt) > Date.parse(manifest.generatedAt)) throw Error("El catálogo activo es más reciente; no se sobrescribe");
  const controlPath = `${root}/imports/control`, runPath = `${root}/imports/${manifest.revision}`;
  const control = await store.get(controlPath);
  if (control && !control.data.complete && control.data.revision !== manifest.revision && !(active?.complete && active.revision === control.data.revision)) throw Error("Termina la importación pendiente antes de cambiar de manifiesto");
  if (control?.data.leaseUntil > Date.now()) throw Error(`Hay una importación en curso. Bloqueo hasta ${new Date(control.data.leaseUntil).toISOString()}`);
  const owner = randomUUID();
  let writes = 0, complete = false;
  const lease = { revision: manifest.revision, owner, leaseUntil: Date.now() + 15 * 60000, complete: false };
  async function commit(operations) {
    if (writes + operations.length > maxWrites) throw Error("El lote excedería el límite local de escrituras");
    await store.commit(operations);
    writes += operations.length;
    await sleep(operations.length * 1000 / writesPerSecond);
  }
  await commit([{ path: controlPath, data: lease, precondition: control ? { updateTime: control.updateTime } : { exists: false } }]);
  let cursor = 0, lastHeartbeat = Date.now();
  try {
    cursor = (await store.get(runPath))?.data.cursor || 0;
    const initialLoad = !active && (!control || control.data.revision === manifest.revision);
    const activeHashes = active ? (await store.get(`${root}/imports/active`))?.data.hashes : null;
    while (cursor < manifest.blocks.length) {
      if (Date.now() - lastHeartbeat > 60000) {
        if (maxWrites - writes < 3) return { complete: false, writes: writes + 1, cursor };
        lease.leaseUntil = Date.now() + 15 * 60000;
        await commit([{ path: controlPath, data: lease }, { path: runPath, data: { cursor, revision: manifest.revision } }]);
        lastHeartbeat = Date.now();
      }
      const block = manifest.blocks[cursor];
      if ((initialLoad && block.count === 0) || activeHashes?.[block.id] === block.hash) { cursor++; continue; }
      const blockPath = `${root}/blocks/${block.id}`;
      const remote = (await store.get(blockPath))?.data;
      if (remote?.hash === block.hash || (!remote && !block.count)) { cursor++; continue; }
      const records = await loadBlock(block.id);
      if (records.length !== block.count || fingerprint(records) !== block.hash) throw Error(`Bloque local alterado: ${block.id}`);
      for (const [id, data] of records) {
        const { contentHash, ...content } = data;
        if (!/^(node|way|relation)_[0-9]+$/.test(id) || data.id.replace("/", "_") !== id || fingerprint(content) !== contentHash) throw Error("Documento local inválido");
      }
      const desired = hashesOf(records), entries = { ...(remote?.entries || {}) };
      if (Object.keys(entries).some((id) => !/^(node|way|relation)_[0-9]+$/.test(id))) throw Error("Índice remoto de bloque inválido");
      const operations = [
        ...records.filter(([id, data]) => entries[id] !== data.contentHash).map(([id, data]) => ({ path: `${root}/places/${id}`, data, id })),
        ...Object.keys(entries).filter((id) => !(id in desired)).map((id) => ({ path: `${root}/places/${id}`, id })),
      ];
      // Reservar una operación para liberar el bloqueo; dos por lote para los
      // hashes del bloque y el cursor. Ambos se escriben con los documentos.
      while (operations.length) {
        const available = maxWrites - writes - 3;
        if (available <= 0) return { complete: false, writes: writes + 1, cursor, totalBlocks: manifest.blocks.length };
        const chunk = operations.splice(0, Math.min(200, available));
        for (const operation of chunk) {
          if (operation.data) entries[operation.id] = operation.data.contentHash;
          else delete entries[operation.id];
        }
        const finished = operations.length === 0;
        await commit([
          ...chunk.map(({ id, ...operation }) => operation),
          { path: blockPath, data: { entries, hash: finished ? block.hash : "partial" } },
          { path: runPath, data: { cursor: finished ? cursor + 1 : cursor, revision: manifest.revision } },
        ]);
      }
      cursor++;
    }
    if (maxWrites - writes < 4) return { complete: false, writes: writes + 1, cursor };
    await commit([
      { path: root, data: { schemaVersion: 1, region: "espana", complete: true, revision: manifest.revision,
        generatedAt: manifest.generatedAt, coverage: manifest.coverage, source: manifest.source,
        license: manifest.license, totals: manifest.totals } },
      { path: runPath, data: { cursor, revision: manifest.revision, complete: true } },
      { path: `${root}/imports/active`, data: { hashes: Object.fromEntries(manifest.blocks.map((block) => [block.id, block.hash])) } },
    ]);
    complete = true;
    return { complete, writes: writes + 1, cursor };
  } finally {
    try {
      await commit([{ path: controlPath, data: { ...lease, leaseUntil: 0, complete } }]);
    } catch (error) {
      console.warn("No se pudo liberar el bloqueo; caduca a los 15 minutos:", error.message);
    }
  }
}
