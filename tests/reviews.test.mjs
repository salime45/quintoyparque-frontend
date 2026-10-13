import test from "node:test";
import assert from "node:assert/strict";
import {osmVenueKey, buildReviewDocument, stars} from "../src/lib/reviews.mjs";

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
