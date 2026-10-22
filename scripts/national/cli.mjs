import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { volumeReport, validateManifest } from "./bundle.mjs";
import { createRestStore } from "./rest-store.mjs";
import { importBundle } from "./importer.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const file = resolve(option("manifest", ".catalog-data/national/manifest.json"));
const manifest = JSON.parse(await readFile(file, "utf8").catch((error) => {
  if (error.code === "ENOENT") throw Error("Falta el manifiesto nacional. Ejecuta catalog:es:download y catalog:es:prepare antes de importar.");
  throw error;
}));
validateManifest(manifest);
const maxWrites = Number(option("max-writes", "5000"));
if (!Number.isInteger(maxWrites) || maxWrites < 6 || maxWrites > 19000) throw Error("max-writes debe estar entre 6 y 19000");
console.log(JSON.stringify(volumeReport(manifest, maxWrites), null, 2));
if (args.includes("--write")) {
  if (process.env.CI) throw Error("La importación nacional es manual y local; no se ejecuta en CI");
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = emulator ? "demo-quintoyparque" : "quintoyparque";
  let credential;
  if (!emulator) {
    const { applicationDefault } = await import("firebase-admin/app");
    credential = applicationDefault();
  }
  const store = createRestStore({ projectId, emulator, token: async () => credential ? (await credential.getAccessToken()).access_token : "owner" });
  const loadBlock = async (id) => {
    const block = manifest.blocks.find((item) => item.id === id);
    if (!block.count) return [];
    const folder = basename(dirname(file)) === manifest.revision ? dirname(file) : resolve(dirname(file), manifest.revision);
    return JSON.parse(await readFile(resolve(folder, `${id}.json`), "utf8"));
  };
  const result = await importBundle(store, manifest, loadBlock, { maxWrites });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.complete ? "Catálogo nacional completo y disponible en el piloto." : "Límite local alcanzado. Repite el mismo comando cuando tengas cuota; conserva el manifiesto.");
} else {
  console.log("Informe local: no se ha consultado ni escrito en Firestore. Añade --write para importar.");
}
