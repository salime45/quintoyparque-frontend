const $ = (id) => document.getElementById(id);
let snapshot, config, ready = false, attempt, selectedPlace, activeSearch;
let loading = false;
let timer;
const labels = {foto_correcta:"foto correcta",sin_foto:"sin foto",local_incorrecto:"local incorrecto",dudoso:"dudoso",error:"error"};

async function request(path, body) {
  const response = await fetch(path,body ? {method:"POST",headers:{"Content-Type":"application/json","X-Pilot-Token":config.sessionToken},body:JSON.stringify(body)} : {});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "La solicitud ha fallado");
  return data;
}
function selectedVenue() { return snapshot.sample.venues.find((row)=>row.id===$("venue").value); }
function controls() {
  $("venue").disabled = loading;
  $("next").disabled = loading;
  $("search").disabled = !ready || loading || snapshot.report.usage.remainingQueries<=0;
  $("verdicts").disabled = !attempt || loading;
  $("correct").disabled = !selectedPlace;
  document.querySelector('[data-verdict="sin_foto"]').disabled = !selectedPlace;
}
async function refresh() {
  snapshot = await request("/api/state");
  const {total,usage,cost} = snapshot.report;
  $("summary").textContent = `${total.reviewed}/300 revisados · ${total.correctPhotos} con foto correcta · ${total.pending} pendientes · ${usage.initiatedQueries}/${usage.maxQueries} consultas iniciadas`;
  $("cost").textContent = `Estimación bruta: ${cost.estimatedGrossUsd.toFixed(3)} USD; ${cost.configuredGrossEstimateUsd.toFixed(3)} USD para el máximo de consultas configurado, sin descontar franquicias ni incluir impuestos. Tarifa consultada: ${cost.checkedAt}.`;
  const selection = $("venue").value;
  $("venue").replaceChildren(...snapshot.sample.venues.map((row,index)=>{
    const option = document.createElement("option");
    option.value=row.id;
    const review = snapshot.state.reviews.find((item)=>item.venueId===row.id);
    option.textContent=`${index+1}. ${row.name || "Local sin nombre"} · ${row.area}${review ? " · "+labels[review.verdict] : ""}`;
    return option;
  }));
  if (selection) $("venue").value=selection;
  controls();
}
function showVenue() {
  clearTimeout(timer);
  const venue = selectedVenue();
  attempt=null; selectedPlace=null; activeSearch=null;
  $("results").replaceChildren(); $("selected").textContent="";
  $("name").textContent=venue.name || `Local sin nombre (${venue.id})`;
  $("area").textContent=`${venue.group==="ciudades"?"Entorno de ciudad":"Entorno de pueblo"} · ${venue.area}`;
  $("address").textContent=`${venue.address || "Dirección no indicada en OSM"} · ${venue.lat}, ${venue.lon}`;
  $("osm").href=`https://www.openstreetmap.org/${venue.id}`;
  const previous=snapshot.state.reviews.find((row)=>row.venueId===venue.id);
  $("status").textContent=previous ? `Evaluación guardada: ${labels[previous.verdict]}. Consultar de nuevo consume otra consulta.`
    : venue.name ? "Consulta y revisa el nombre, la ubicación y la foto antes de evaluar."
      : "OSM no indica el nombre: la búsqueda será genérica. Si no puedes confirmar la identidad del local, marca dudoso.";
  controls();
}
$("venue").addEventListener("change",showVenue);
$("next").addEventListener("click",()=>{
  const rows=snapshot.sample.venues;
  const index=rows.findIndex(row=>row.id===$("venue").value);
  const next=[...rows.slice(index+1),...rows.slice(0,index+1)].find(row=>!snapshot.state.reviews.some(review=>review.venueId===row.id));
  if (next) {$("venue").value=next.id;showVenue();}
  else $("status").textContent="Los 300 locales están evaluados. Descarga el informe para ver el resultado.";
});
$("search").addEventListener("click",async()=>{
  const venue=selectedVenue();
  loading=true; attempt=null; selectedPlace=null;
  $("results").replaceChildren(); $("selected").textContent=""; controls();
  $("status").textContent="Consultando el local…";
  try {
    attempt=await request("/api/reserve",{venueId:venue.id});
    await refresh();
    const search=document.createElement("gmp-place-search");
    activeSearch=search;
    search.setAttribute("selectable","");
    const template=document.createElement("template");
    template.setAttribute("slot","details-item");
    template.innerHTML="<gmp-place-name></gmp-place-name><gmp-place-media></gmp-place-media><gmp-place-address></gmp-place-address>";
    const attribution=document.createElement("gmp-place-attribution");
    const query=document.createElement("gmp-place-text-search-request");
    query.setAttribute("max-result-count","3");
    query.setAttribute("location-bias",`500@${venue.lat},${venue.lon}`);
    const finish=(message)=>{
      if (activeSearch!==search) return;
      clearTimeout(timer); loading=false; $("status").textContent=message; controls();
    };
    search.addEventListener("gmp-load",()=>finish("Resultados cargados. Selecciona el local correcto y revisa la foto antes de marcar el resultado."));
    search.addEventListener("gmp-error",()=>finish("Google no ha podido mostrar el resultado. Revisa la clave y las APIs habilitadas, o marca error."));
    search.addEventListener("gmp-select",({place})=>{
      if (activeSearch!==search || !place?.id) return;
      selectedPlace=place.id;
      $("selected").textContent="Local seleccionado. Confirma que corresponde al de OSM y que aparece una foto real, no un icono o logotipo.";
      controls();
    });
    search.append(query,template,attribution);
    $("results").append(search);
    timer=setTimeout(()=>finish("La consulta tarda demasiado. Puedes marcar error o volver a consultar; se conserva la consulta consumida."),30000);
    const generic={bar:"bar",cafe:"cafetería",restaurant:"restaurante",fast_food:"comida rápida"}[venue.amenity];
    // Una sola asignación de consulta; no se siguen páginas ni se repite automáticamente.
    query.setAttribute("text-query",[venue.name || generic,venue.address].filter(Boolean).join(" "));
  } catch (error) {
    loading=false; $("status").textContent=error.message; controls();
  }
});
$("verdicts").addEventListener("click",async(event)=>{
  const verdict=event.target.dataset.verdict;
  if (!verdict || !attempt) return;
  loading=true; controls();
  try {
    await request("/api/review",{venueId:selectedVenue().id,attemptId:attempt.id,verdict,...(selectedPlace?{placeId:selectedPlace}:{})});
    await refresh();
    $("status").textContent=`Guardado: ${labels[verdict]}. Puedes pasar al siguiente pendiente.`;
  } catch (error) {$("status").textContent=error.message;}
  finally {loading=false;controls();}
});
async function init() {
  config=await request("/api/config");
  await refresh();showVenue();
  window.gm_authFailure=()=>{
    ready=false;loading=false;$("status").textContent="Google ha rechazado la clave. Comprueba facturación, Maps JavaScript API, Places UI Kit API y los referentes HTTP permitidos.";controls();
  };
  window.initPhotoPilot=async()=>{
    try {
      await google.maps.importLibrary("places");ready=true;
      $("status").textContent="Piloto listo. Cada pulsación en Consultar fotos consume una consulta; navegar no consulta Google.";controls();
    } catch {window.gm_authFailure();}
  };
  const script=document.createElement("script");
  const url=new URL("https://maps.googleapis.com/maps/api/js");
  for (const [key,value] of Object.entries({key:config.apiKey,v:"weekly",loading:"async",callback:"initPhotoPilot",language:"es",region:"ES"})) url.searchParams.set(key,value);
  script.src=url.href;script.async=true;
  script.onerror=window.gm_authFailure;
  document.head.append(script);
}
init().catch(error=>{$("status").textContent=error.message;});
