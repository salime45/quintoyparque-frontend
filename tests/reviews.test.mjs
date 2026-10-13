import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {osmVenueKey, buildReviewDocument, stars} from "../public/js/reviews.mjs";

const here = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const venue={id:"node/12258686901",tags:{name:"Cervecería el Almendro"}};
const park={id:"way/781864583",tags:{leisure:"playground"}};
const input = {...{
  uid:"person-1",venue,park,rating:"5",
  parkVisible:"yes",streetCrossing:"no",
  comment:"  Buena terraza  ",createdAt:{serverTimestamp:true}
}};

test("La reseña utiliza la identidad OSM estable, no el nombre del local",()=>{
  assert.equal(osmVenueKey(venue),"node_12258686901");
  assert.equal(osmVenueKey("relation/99"),"relation_99");
  for(const id of ["abc","node/hello","node/-4","way/0","node/12/more","node_12"]){
    assert.throws(()=>osmVenueKey(id));
  }
});
test("La reseña se publica al crearla, con respuestas binarias",()=>{
  const data=buildReviewDocument(input);
  assert.deepEqual(data,{
    uid:"person-1",
    venueName:"Cervecería el Almendro",
    parkId:"way/781864583",
    parkName:"Parque infantil",
    rating:5,parkVisible:true,streetCrossing:false,
    comment:"Buena terraza",status:"published",
    createdAt:input.createdAt
  });
});
test("Los datos inválidos se rechazan antes de contactar a Firestore",()=>{
  const invalid=[
    {rating:0},{rating:6},{rating:2.4},{parkVisible:"sí"},
    {streetCrossing:"maybe"},{comment:"x".repeat(701)},{uid:""},
    {park:{id:"foo/123",tags:{}}}
  ];
  for(const v of invalid)assert.throws(()=>buildReviewDocument({...input,...v}));
  assert.equal(buildReviewDocument({...input,comment:""}).comment,"");
});
test("El texto de las estrellas se ajusta a los valores válidos",()=>{
  assert.equal(stars(5),"★★★★★");
  assert.equal(stars(2),"★★☆☆☆");
  assert.equal(stars(0),"☆☆☆☆☆");
});
test("Las fichas del mapa y la lista enlazan con el formulario",()=>{
  const html=here("public/index.html");
  assert.ok(html.includes('id="reviewModal"'));
  assert.ok(html.includes('id="reviewForm"'));
  assert.ok(html.includes('name="parkVisible"'));
  assert.ok(html.includes('name="streetCrossing"'));
  assert.ok(html.includes('bindPopup(()=>venuePopup(p,p.dist,park)'));
  assert.ok(html.includes('reviewButton.textContent="Dejar reseña"'));
  assert.ok(html.includes('where("status","==","published")'));
  assert.ok(html.includes('doc(db,"osmReviews",osmVenueKey(venue),"reviews",uid)'));
  assert.ok(html.includes('comment.textContent=item.comment'));
  assert.ok(html.includes('batch.set(reference,record);'));
  assert.ok(html.includes('batch.set(mirrorRef(uid,venue),record);'));
  assert.ok(html.includes('await batch.commit();'));
  assert.ok(html.includes('batch.update(reference,{status:"published"});'));
  assert.ok(html.includes('if(user){'));
  assert.ok(html.includes('await publishOlderPendingReview(venue);'));
  assert.ok(html.includes('refreshVisibleReviews(venue);'));
  assert.ok(html.includes('Reseña publicada: '));
  assert.ok(html.includes('La reseña se publicará inmediatamente.'));
  assert.ok(!html.includes('Está pendiente de revisión antes de publicarse.'));
});
test("El módulo inline del mapa contiene JavaScript sintácticamente válido",()=>{
  const html=here("public/index.html");
  const inline=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(inline);
  const dir=mkdtempSync(join(tmpdir(),"qyp-inline-"));
  try{
    const script=join(dir,"index.mjs");
    writeFileSync(script,inline[1]);
    execFileSync(process.execPath,["--check",script],{stdio:"pipe"});
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("La ficha del bar separa distancia, puntuación y opiniones",()=>{
  const html=here("public/index.html");
  const css=here("public/brand/theme.css");
  assert.ok(html.includes('className="venue-popup__header"'));
  assert.ok(html.includes('className="venue-popup__title"'));
  assert.ok(html.includes('className="venue-popup__distance"'));
  assert.ok(html.includes('className="venue-popup__disclaimer"'));
  assert.ok(html.includes('className="popup-score"'));
  assert.ok(html.includes('className="popup-score__number"'));
  assert.ok(html.includes('className="popup-reviews__heading"'));
  assert.ok(html.includes('className="popup-review-item"'));
  assert.ok(html.includes('className="popup-review-item__comment"'));
  assert.ok(html.includes('button.textContent="Escribir una reseña"'));
  assert.ok(css.includes(".popup-review-item__heading"));
  assert.ok(css.includes(".popup-score__metric"));
  assert.ok(css.includes(".venue-popup__actions"));
});
test("Visibilidad y cruce se representan como etiquetas diferenciadas",()=>{
  const html=here("public/index.html");
  const css=here("public/brand/theme.css");
  assert.ok(html.includes('reviewChip(item.parkVisible?"Se ve el parque":"No se ve el parque",item.parkVisible)'));
  assert.ok(html.includes('reviewChip(item.streetCrossing?"Hay que cruzar una calle":"Sin cruzar calles",!item.streetCrossing)'));
  assert.ok(css.includes(".popup-review-chip--positive"));
  assert.ok(css.includes(".popup-review-chip--caution"));
  assert.ok(html.includes('new Intl.DateTimeFormat("es-ES"'));
});
test("Popup adaptado a pantallas móviles, manteniendo el texto seguro",()=>{
  const html=here("public/index.html");
  const css=here("public/brand/theme.css");
  assert.ok(html.includes('className:"qyp-venue-popup",maxWidth:350'));
  assert.ok(html.includes('maxHeight:Math.max(180,Math.min(445,Math.round(window.innerHeight*.53)-100))'));
  assert.ok(css.includes(".leaflet-popup.qyp-venue-popup .leaflet-popup-content-wrapper"));
  assert.ok(css.includes(".leaflet-popup.qyp-venue-popup .leaflet-popup-content.leaflet-popup-scrolled"));
  assert.ok(css.includes("overflow-wrap: anywhere"));
  assert.ok(html.includes("comment.textContent=item.comment"));
  assert.ok(html.includes("title.textContent=safeLabel(venue)"));
  assert.ok(!html.slice(html.indexOf("function reviewChip"),html.indexOf("async function refreshReviewForm")).includes("innerHTML"));
});

test("Locales reseñados reciben marcador especial y filtro sin índices",()=>{
  const html=here("public/index.html");
  const css=here("public/brand/theme.css");
  const rules=here("firestore.rules");
  assert.ok(html.includes('getDocs(collection(db,"osmReviews"))'));
  assert.ok(html.includes('let reviewedVenueKeys=new Set()'));
  assert.ok(html.includes('icon:reviewed?verifiedBrandIcon:venueBrandIcon'));
  assert.ok(html.includes('id="onlyVerified"'));
  assert.ok(html.includes('$("onlyVerified").onchange=render'));
  assert.ok(html.includes('verifiedOnly?scored.filter'));
  assert.ok(html.includes('className="venue-reviewed-tag"'));
  assert.ok(css.includes('.verified-filter:has(input:checked)'));
  assert.ok(rules.includes('match /osmReviews/{venueKey}'));
  assert.ok(!html.includes('collectionGroup('));
});
test("Mis reseñas se limita a la cuenta y permite editar todos los campos de opinión",()=>{
  const html=here("public/index.html");
  const rules=here("firestore.rules");
  const css=here("public/brand/theme.css");
  assert.ok(html.includes('id="myReviewsModal"'));
  assert.ok(html.includes('id="myReviews"'));
  assert.ok(html.includes('$("myReviews").hidden=!u'));
  assert.ok(html.includes('getDocs(myReviewsCollection(uid))'));
  assert.ok(html.includes('collection(db,"userReviews",uid,"items")'));
  assert.ok(html.includes('edit.textContent="Editar reseña"'));
  assert.ok(html.includes('reviewEditing=true;'));
  assert.ok(html.includes('batch.update(reference,patch);'));
  assert.ok(html.includes('batch.set(mirrorRef(uid,venue),{...previous.data(),...patch});'));
  assert.ok(html.includes('updatedAt:serverTimestamp()'));
  assert.ok(html.includes('reviewForm.querySelector('));
  assert.ok(rules.includes('match /userReviews/{uid}/items/{venueKey}'));
  assert.ok(css.includes('#myReviewsModal'));
});
