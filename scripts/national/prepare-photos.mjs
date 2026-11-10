import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, delimiter } from "node:path";
import { spawn } from "node:child_process";
import { enrichPhotos } from "./photo-bundle.mjs";

const option = process.argv.find((arg) => arg.startsWith("--manifest="));
const sourceManifest = resolve(option?.slice(11) || ".catalog-data/national/manifest.json");
const original = JSON.parse(await readFile(sourceManifest, "utf8"));
const sources = JSON.parse(await readFile(".catalog-data/sources/sources.json", "utf8"));
const output = resolve(".catalog-data/photo-update");
await mkdir(output, { recursive: true });
const references = {};
for (const source of sources.sources) {
  if (!original.sources.some((item) => item.id === source.id && item.md5 === source.md5))
    throw Error(`La fuente ${source.id} no corresponde al catálogo de origen`);
  const file = resolve(output, `${source.id}.json`);
  console.log(`Extrayendo fotos de ${source.id}…`);
  await new Promise((ok, fail) => {
    const child = spawn(process.env.PYTHON || "python3", ["scripts/national/extract-photos.py", source.file, file], {
      stdio: "inherit", env: { ...process.env,
        PYTHONPATH: [resolve(".catalog-python"), process.env.PYTHONPATH].filter(Boolean).join(delimiter) },
    });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? ok() : fail(Error(`Falló la extracción: ${source.id}`)));
  });
  Object.assign(references, JSON.parse(await readFile(file, "utf8")));
}
const folder = dirname(sourceManifest).endsWith(original.revision)
  ? dirname(sourceManifest) : resolve(dirname(sourceManifest), original.revision);
const blocks = new Map();
for (const block of original.blocks) {
  if (block.count) blocks.set(block.id, JSON.parse(await readFile(resolve(folder, `${block.id}.json`), "utf8")));
}
const result = enrichPhotos(original, blocks, references);
const target = resolve(output, result.manifest.revision);
await mkdir(target, { recursive: true });
for (const block of result.blocks) {
  if (block.count) await writeFile(resolve(target, `${block.id}.json`), JSON.stringify(block.records));
}
await writeFile(resolve(target, "manifest.json"), JSON.stringify(result.manifest, null, 2));
await writeFile(resolve(output, "report.json"), JSON.stringify(result.report, null, 2));
console.log(JSON.stringify(result.report, null, 2));
console.log(`Manifiesto preparado: ${resolve(target, "manifest.json")}`);
console.log("Solo preparación local: no se ha consultado ni escrito en Firestore.");
