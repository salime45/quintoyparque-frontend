import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

const folder = resolve(".catalog-data/sources");
await mkdir(folder, { recursive: true });
const sources = JSON.parse(await readFile(new URL("./sources.json", import.meta.url), "utf8"));
const manifest = [];
for (const source of sources) {
  const target = resolve(folder, `${source.id}.osm.pbf`);
  const checksumResponse = await fetch(source.url + ".md5");
  if (!checksumResponse.ok) throw Error(`No se pudo descargar la suma de ${source.id}`);
  const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{32}$/i.test(expected)) throw Error("Suma MD5 de origen inválida");
  async function digest(path) {
    const hash = createHash("md5");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
  }
  const existing = await stat(target).catch(() => null);
  if (!existing || await digest(target) !== expected) {
    console.log(`Descargando ${source.id}: ${source.url}`);
    const response = await fetch(source.url);
    if (!response.ok || !response.body) throw Error(`Descarga fallida: ${response.status}`);
    let received = 0, reported = 0;
    const total = Number(response.headers.get("content-length"));
    const progress = new Transform({ transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received - reported >= 64 * 1024 * 1024) {
        console.log(`${source.id}: ${Math.round(received / 1048576)} MiB${total ? ` / ${Math.round(total / 1048576)} MiB` : ""}`);
        reported = received;
      }
      callback(null, chunk);
    } });
    await pipeline(response.body, progress, createWriteStream(target + ".part"));
    if (await digest(target + ".part") !== expected) throw Error(`Descarga incompleta o fuente actualizada: ${source.id}; repite el comando`);
    await rename(target + ".part", target);
  }
  manifest.push({ ...source, file: target, md5: expected, bytes: (await stat(target)).size });
  console.log(`Fuente verificada: ${source.id}`);
}
await writeFile(resolve(folder, "sources.json"), JSON.stringify({ downloadedAt: new Date().toISOString(), sources: manifest }, null, 2));
console.log("Fuentes verificadas. Todavía no se ha escrito nada en Firestore.");
