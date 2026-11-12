import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPilotServer } from "./photo-pilot/server.mjs";

const args = process.argv.slice(2);
const allowed = /^(--report|--max-queries=\d+|--port=\d+)$/;
if (args.some((arg)=>!allowed.test(arg))) throw Error("Opciones: --report, --max-queries=330, --port=4357");
const option = (name,fallback)=>args.find(arg=>arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const sample = JSON.parse(await readFile(new URL("./photo-pilot/sample.json",import.meta.url),"utf8"));
const maxQueries = Number(option("max-queries",330));
const stateFile = resolve(".catalog-data/photo-pilot",sample.revision,"progress.json");
if (!args.includes("--report") && !process.env.GOOGLE_MAPS_API_KEY)
  throw Error("Falta GOOGLE_MAPS_API_KEY. Crea .env.places.local según scripts/photo-pilot/places.env.example y usa node --env-file=.env.places.local scripts/photo-pilot.mjs");
const pilot = await createPilotServer({sample,apiKey:process.env.GOOGLE_MAPS_API_KEY || "",stateFile,maxQueries});
if (args.includes("--report")) {
  console.log(JSON.stringify(pilot.report(),null,2));
} else {
  const port = Number(option("port",4357));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Puerto inválido");
  pilot.server.on("error",error=>{console.error(`No se pudo iniciar el piloto: ${error.code}`);process.exitCode=1;});
  pilot.server.listen(port,"127.0.0.1",()=>{
    console.log(`Piloto de fotos: http://127.0.0.1:${port}`);
    console.log(`300 locales, máximo ${maxQueries} consultas iniciadas; cada consulta requiere pulsar un botón.`);
    console.log(`Progreso local: ${stateFile}`);
    console.log("La clave se usa en el navegador: restríngela por referente HTTP y API en Google Cloud.");
    console.log("Ctrl+C para salir. Repite el comando para reanudar.");
  });
}
