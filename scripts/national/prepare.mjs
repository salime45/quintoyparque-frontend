import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access, rename } from "node:fs/promises";
import { resolve, delimiter } from "node:path";
import { normalizeParkArea, computeParkMatches } from "../osm-park-geometry.mjs";
import { nationalCoverage } from "../../src/lib/catalog-regions.js";
import { createBundle, volumeReport } from "./bundle.mjs";

const folder = resolve(".catalog-data/national");
await mkdir(folder, { recursive: true });
const sources = JSON.parse(await readFile(".catalog-data/sources/sources.json", "utf8"));
const expected = JSON.parse(await readFile(new URL("./sources.json", import.meta.url), "utf8"));
if (sources.sources.length !== expected.length || expected.some((item) => !sources.sources.some((source) => source.id === item.id && source.url === item.url))) throw Error("Faltan fuentes nacionales; ejecuta catalog:es:download");
const places = new Map(), parks = new Map(), territories = [], timestamps = [];
for (const source of sources.sources) {
  const rawFile = resolve(folder, `${source.id}-${source.md5}.json`);
  const cached = await access(rawFile).then(() => true, () => false);
  if (!cached) {
    console.log(`Extrayendo geometrías: ${source.id}`);
    await new Promise((ok, fail) => {
      const child = spawn(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["scripts/national/extract.py", source.file, rawFile], {
        stdio: "inherit", env: { ...process.env, PYTHONPATH: [resolve(".catalog-python"), process.env.PYTHONPATH].filter(Boolean).join(delimiter) },
      });
      child.on("error", fail);
      child.on("exit", (code) => code === 0 ? ok() : fail(Error(`Extracción fallida: ${source.id}`)));
    });
  }
  const raw = JSON.parse(await readFile(rawFile, "utf8"));
  if (!Array.isArray(raw.elements) || !raw.elements.length) throw Error(`Fuente sin lugares: ${source.id}`);
  if (raw.dataTimestamp) timestamps.push(raw.dataTimestamp);
  territories.push({ id: source.id, sourcePlaces: raw.elements.length, incompleteGeometries: raw.incompleteGeometries });
  for (const place of raw.elements) {
    const { type, id, ...data } = place;
    places.set(`${type}/${id}`, { id: `${type}/${id}`, ...data });
  }
  for (const boundary of raw.boundaries) {
    const area = normalizeParkArea(boundary);
    if (area) parks.set(area.id, area);
  }
}
console.log(`Calculando asociaciones en ${parks.size} recintos y ${places.size} lugares`);
const elements = [...places.values()].sort((a, b) => a.id.localeCompare(b.id));
const parkMatches = computeParkMatches(elements, [...parks.values()]);
const snapshot = { schemaVersion: 2, license: "ODbL", source: "OpenStreetMap contributors / Geofabrik extracts",
  generatedAt: timestamps.sort()[0] || sources.downloadedAt,
  coverage: nationalCoverage,
  sources: sources.sources.map(({ id, url, md5, bytes }) => ({ id, url, md5, bytes })),
  territories, elements, parkMatches, parkAreaCount: parks.size };
const { manifest, blocks } = createBundle(snapshot);
const target = resolve(folder, manifest.revision);
await mkdir(target, { recursive: true });
for (const { id, records } of blocks) {
  if (records.length) await writeFile(resolve(target, `${id}.json`), JSON.stringify(records));
}
await writeFile(resolve(target, "manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(resolve(folder, "manifest.json.part"), JSON.stringify(manifest, null, 2));
await rename(resolve(folder, "manifest.json.part"), resolve(folder, "manifest.json"));
const report = volumeReport(manifest);
await writeFile(resolve(folder, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
