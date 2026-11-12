import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildReport, validateSample, validateState, VERDICTS } from "./model.mjs";

export async function createPilotServer({ sample, apiKey, stateFile, maxQueries = 330 }) {
  validateSample(sample);
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 600)
    throw Error("max-queries debe estar entre 1 y 600");
  let state;
  try { state = JSON.parse(await readFile(stateFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  state ||= { version:1, sampleRevision:sample.revision, maxQueries, attempts:[], reviews:[] };
  validateState(state,sample);
  if (state.maxQueries !== maxQueries) throw Error(`El progreso existente utiliza --max-queries=${state.maxQueries}; conserva ese límite al reanudar`);
  const sessionToken = randomUUID();
  let queue = Promise.resolve();
  async function mutate(change) {
    const job = queue.then(async () => {
      const next = structuredClone(state);
      const result = change(next);
      validateState(next,sample);
      await mkdir(dirname(stateFile),{recursive:true});
      const temp = `${stateFile}.${randomUUID()}.tmp`;
      await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});
      await rename(temp,stateFile);
      state = next;
      return result;
    });
    queue = job.catch(()=>{});
    return job;
  }
  const server = createServer(async (req,res) => {
    const reply = (status, data) => {
      res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
      res.end(JSON.stringify(data));
    };
    try {
      const port = server.address()?.port;
      const origin = `http://${req.headers.host}`;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return reply(403,{error:"Host no autorizado"});
      const url = new URL(req.url,origin);
      res.setHeader("X-Content-Type-Options","nosniff");
      res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
      if (req.method === "GET") {
        if (url.pathname === "/api/config") return reply(200,{apiKey,sessionToken});
        if (url.pathname === "/api/state") return reply(200,{sample,state,report:buildReport(sample,state)});
        if (url.pathname === "/api/report") {
          res.setHeader("Content-Disposition",'attachment; filename="informe-piloto-fotos.json"');
          return reply(200,buildReport(sample,state));
        }
        const assets = {"/":"index.html","/app.js":"app.js","/style.css":"style.css"};
        const file = assets[url.pathname];
        if (!file) return reply(404,{error:"No encontrado"});
        const body = await readFile(new URL(file,import.meta.url));
        res.writeHead(200,{"Content-Type":file.endsWith("html")?"text/html; charset=utf-8":file.endsWith("js")?"text/javascript; charset=utf-8":"text/css; charset=utf-8","Cache-Control":"no-store"});
        return res.end(body);
      }
      if (req.method !== "POST") return reply(405,{error:"Método no admitido"});
      if (req.headers.origin !== origin || req.headers["x-pilot-token"] !== sessionToken)
        return reply(403,{error:"Solicitud fuera del piloto local"});
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) return reply(413,{error:"Solicitud demasiado grande"});
      }
      const data = JSON.parse(body);
      const venue = sample.venues.find((row)=>row.id===data.venueId);
      if (!venue) return reply(400,{error:"Local ajeno a la muestra"});
      if (url.pathname === "/api/reserve") {
        const attempt = await mutate((next)=>{
          if (next.attempts.length >= next.maxQueries) throw Error("Límite de consultas del piloto alcanzado");
          const row = {id:randomUUID(),venueId:venue.id,createdAt:new Date().toISOString()};
          next.attempts.push(row);
          return row;
        });
        return reply(200,attempt);
      }
      if (url.pathname === "/api/review") {
        if (!VERDICTS.includes(data.verdict)) return reply(400,{error:"Resultado no válido"});
        await mutate((next)=>{
          const review = {venueId:venue.id,attemptId:data.attemptId,verdict:data.verdict,
            ...(data.placeId ? {placeId:data.placeId} : {}),reviewedAt:new Date().toISOString()};
          next.reviews = [...next.reviews.filter((row)=>row.venueId!==venue.id),review];
        });
        return reply(200,{saved:true});
      }
      return reply(404,{error:"No encontrado"});
    } catch (error) {
      // Evitar devolver credenciales o respuestas de proveedores en los errores.
      const known = /Límite de consultas|Evaluación inválida|Intento de consulta|Unexpected/.test(error.message);
      reply(known?400:500,{error:known ? error.message : "No se pudo guardar el progreso. Revisa los permisos de la carpeta local."});
    }
  });
  return {server,report:()=>buildReport(sample,state)};
}
