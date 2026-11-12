import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buildReport, validateSample } from "../scripts/photo-pilot/model.mjs";
import { createPilotServer } from "../scripts/photo-pilot/server.mjs";

const sample = JSON.parse(await readFile(new URL("../scripts/photo-pilot/sample.json",import.meta.url),"utf8"));
const base = () => ({version:1,sampleRevision:sample.revision,maxQueries:330,attempts:[],reviews:[]});
function reviewed(correct, total=300) {
  const state=base();
  for(let index=0;index<total;index++) {
    const venueId=sample.venues[index].id;
    state.attempts.push({id:String(index),venueId});
    state.reviews.push({venueId,attemptId:String(index),verdict:index<correct?"foto_correcta":"dudoso",...(index<correct?{placeId:`place_${index}`}:{})});
  }
  return state;
}

test("La muestra mantiene 300 IDs únicos, 30 entornos y locales sin nombre",()=>{
  validateSample(sample);
  assert.equal(new Set(sample.venues.map(row=>row.area)).size,30);
  assert.equal(sample.venues.filter(row=>!row.name).length,23);
  assert.throws(()=>validateSample({...sample,venues:sample.venues.slice(1)}));
});
test("El 90 % requiere 270 fotos confirmadas y los pendientes no se dan por revisados",()=>{
  assert.equal(buildReport(sample,reviewed(269)).outcome,"objetivo_no_alcanzado");
  const result=buildReport(sample,reviewed(270));
  assert.equal(result.outcome,"objetivo_observado_en_muestra");
  assert.equal(result.total.verifiedPercentOfSample,90);
  assert.equal(result.cost.estimatedGrossUsd,.3);
  const pending=buildReport(sample,reviewed(270,270));
  assert.equal(pending.outcome,"pendiente_de_revision");
  assert.equal(pending.total.pending,30);
  assert.equal(buildReport(sample,base()).total.correctPhotos,0);
});
test("No se cuentan evaluaciones inventadas, repetidas o sin identificador del lugar",()=>{
  const state=reviewed(1,1);
  delete state.reviews[0].placeId;
  assert.throws(()=>buildReport(sample,state),/Evaluación inválida/);
  const duplicate=reviewed(1,1);
  duplicate.reviews.push(duplicate.reviews[0]);
  assert.throws(()=>buildReport(sample,duplicate),/Evaluación inválida/);
});

function call(server,path,body,headers={}) {
  return new Promise((resolve)=>{
    const req=Readable.from(body?[JSON.stringify(body)]:[]);
    Object.assign(req,{method:body?"POST":"GET",url:path,headers:{host:"127.0.0.1:4357",origin:"http://127.0.0.1:4357",...headers}});
    let status, responseHeaders={};
    const res={setHeader(key,value){responseHeaders[key]=value;},writeHead(code,values){status=code;Object.assign(responseHeaders,values);},end(value){resolve({status,headers:responseHeaders,data:JSON.parse(String(value))});}};
    server.emit("request",req,res);
  });
}
test("El presupuesto se reserva de forma atómica, persiste al reiniciar y nunca guarda la clave",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"qyp-photo-pilot-"));
  const stateFile=join(folder,"progress.json");
  try {
    const pilot=await createPilotServer({sample,apiKey:"test-secret",stateFile,maxQueries:2});
    pilot.server.address=()=>({port:4357});
    const config=(await call(pilot.server,"/api/config")).data;
    const headers={"x-pilot-token":config.sessionToken};
    const venueId=sample.venues[0].id;
    const rejected=await call(pilot.server,"/api/reserve",{venueId});
    assert.equal(rejected.status,403);
    const responses=await Promise.all(Array.from({length:3},()=>call(pilot.server,"/api/reserve",{venueId},headers)));
    assert.equal(responses.filter(row=>row.status===200).length,2);
    assert.equal(responses.filter(row=>row.status===400).length,1);
    const attempt=responses.find(row=>row.status===200).data;
    assert.equal((await call(pilot.server,"/api/review",{venueId,attemptId:attempt.id,verdict:"foto_correcta"},headers)).status,400);
    assert.equal((await call(pilot.server,"/api/review",{venueId,attemptId:attempt.id,verdict:"foto_correcta",placeId:"place_1",photoUrl:"discard-this"},headers)).status,200);
    const disk=await readFile(stateFile,"utf8");
    assert.equal(disk.includes("test-secret"),false);
    assert.equal(disk.includes("discard-this"),false);
    const resumed=await createPilotServer({sample,apiKey:"other-secret",stateFile,maxQueries:2});
    assert.equal(resumed.report().usage.remainingQueries,0);
    assert.equal(resumed.report().total.correctPhotos,1);
    const report=JSON.stringify(resumed.report());
    assert.equal(report.includes("secret"),false);
  } finally {await rm(folder,{recursive:true,force:true});}
});
