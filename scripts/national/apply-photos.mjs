import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRestStore } from "./rest-store.mjs";
import { importBundle } from "./importer.mjs";

// Reutiliza los límites, bloqueos y progreso del importador nacional.
const report = JSON.parse(await readFile(".catalog-data/photo-update/report.json", "utf8"));
const folder = resolve(".catalog-data/photo-update", report.revision);
const manifest = JSON.parse(await readFile(resolve(folder, "manifest.json"), "utf8"));
const option = process.argv.find((arg) => arg.startsWith("--max-writes="));
const maxWrites = Number(option?.slice(13) || 5000);
if (!Number.isInteger(maxWrites) || maxWrites < 6 || maxWrites > 5000)
  throw Error("El límite de esta actualización debe estar entre 6 y 5000 escrituras");
console.log(JSON.stringify({ ...report, samples: undefined, maxWrites }, null, 2));
if (!process.argv.includes("--write")) {
  console.log("Informe local: añade --write para actualizar Firestore.");
} else {
  if (process.env.CI) throw Error("La actualización de fotos es manual y local");
  const { applicationDefault } = await import("firebase-admin/app");
  const credential = applicationDefault();
  const store = createRestStore({ projectId: "quintoyparque",
    token: async () => (await credential.getAccessToken()).access_token });
  const active = await store.get("osmCatalogTest/espana");
  if (!active?.data.complete || ![report.originalRevision, report.revision].includes(active.data.revision))
    throw Error("El catálogo activo ha cambiado: vuelve a preparar las fotos desde su revisión");
  const result = await importBundle(store, manifest,
    async (id) => JSON.parse(await readFile(resolve(folder, `${id}.json`), "utf8")), { maxWrites });
  console.log(JSON.stringify(result, null, 2));
}
