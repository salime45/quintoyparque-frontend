const { before, after, beforeEach, test } = require("node:test");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} = require("firebase/firestore");

let env;
const anonymous = () => env.unauthenticatedContext().firestore();
const user = (uid = "person-1") => env.authenticatedContext(uid).firestore();
const admin = () => env.authenticatedContext("moderator", { admin: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-quintoyparque",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { if (env) await env.cleanup(); });

async function seedPlace(id, status) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "places", id), {
      name: "Cafeteria de ejemplo", status, lat: 39.47, lng: -0.38,
    });
  });
}
function proposal(uid, overrides = {}) {
  return {
    uid,
    name: "Bar junto a parque",
    address: "Plaza de ejemplo, Valencia",
    comment: "La terraza tiene el parque delante",
    lat: 39.47,
    lng: -0.38,
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}
function review(uid, overrides = {}) {
  return {
    uid,
    rating: 5,
    comment: "Vemos la zona de juegos desde la terraza",
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

test("public reads see only published places", async () => {
  await seedPlace("approved", "published");
  await seedPlace("draft", "pending");
  await assertSucceeds(getDoc(doc(anonymous(), "places", "approved")));
  await assertFails(getDoc(doc(anonymous(), "places", "draft")));
  await assertSucceeds(getDocs(query(collection(anonymous(), "places"), where("status", "==", "published"))));
  await assertFails(getDocs(collection(anonymous(), "places")));
});

test("only administrators can publish and modify places", async () => {
  await assertFails(setDoc(doc(user(), "places", "bad"), { name: "Fake", status: "published" }));
  await assertSucceeds(setDoc(doc(admin(), "places", "approved"), {
    name: "Publicado", status: "published", lat: 39.47, lng: -0.38,
  }));
});

test("only logged-in users can submit a pending proposal in Valencia", async () => {
  await assertFails(setDoc(doc(anonymous(), "suggestions", "guest"), proposal("guest")));
  await assertSucceeds(setDoc(doc(user(), "suggestions", "allowed"), proposal("person-1")));
  await assertFails(setDoc(doc(user(), "suggestions", "forged"), proposal("someone-else")));
  await assertFails(setDoc(doc(user(), "suggestions", "published"), proposal("person-1", { status: "published" })));
  await assertFails(setDoc(doc(user(), "suggestions", "outside"), proposal("person-1", { lat: 60 })));
  await assertSucceeds(setDoc(doc(user(), "suggestions", "madrid"), proposal("person-1", { lat: 40.4168, lng: -3.7038 })));
  await assertFails(setDoc(doc(user(), "suggestions", "outside-madrid"), proposal("person-1", { lat: 40.4168, lng: -4.5 })));
});

test("suggestions are private to administrators", async () => {
  await assertSucceeds(setDoc(doc(user(), "suggestions", "allowed"), proposal("person-1")));
  await assertFails(getDoc(doc(user(), "suggestions", "allowed")));
  await assertFails(getDoc(doc(anonymous(), "suggestions", "allowed")));
  await assertSucceeds(getDoc(doc(admin(), "suggestions", "allowed")));
});

test("only valid pending reviews on published places are accepted", async () => {
  await seedPlace("approved", "published");
  await seedPlace("draft", "pending");
  await assertFails(setDoc(doc(anonymous(), "places", "approved", "reviews", "guest"), review("guest")));
  await assertSucceeds(setDoc(doc(user(), "places", "approved", "reviews", "person-1"), review("person-1")));
  await assertFails(setDoc(doc(user(), "places", "approved", "reviews", "person-2"), review("someone-else")));
  await assertFails(setDoc(doc(user("person-3"), "places", "approved", "reviews", "person-3"), review("person-3", { rating: 9 })));
  await assertFails(setDoc(doc(user("person-4"), "places", "draft", "reviews", "person-4"), review("person-4")));
  await assertFails(setDoc(doc(user("person-5"), "places", "missing", "reviews", "person-5"), review("person-5")));
});

test("reviews must be moderated before they become public", async () => {
  await seedPlace("approved", "published");
  await assertSucceeds(setDoc(doc(user(), "places", "approved", "reviews", "person-1"), review("person-1")));
  await assertFails(getDoc(doc(anonymous(), "places", "approved", "reviews", "person-1")));
  await assertFails(getDoc(doc(user(), "places", "approved", "reviews", "person-1")));
  await assertSucceeds(getDoc(doc(admin(), "places", "approved", "reviews", "person-1")));
});


function osmReview(uid, overrides = {}) {
  return {
    uid,
    venueName: "Cafetería junto al parque",
    parkId: "way/781864583",
    parkName: "Parque infantil",
    rating: 4,
    parkVisible: true,
    streetCrossing: false,
    comment: "Se ve desde la terraza",
    status: "published",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}
const osmPath = (uid = "person-1", venue = "node_12345", store = user(uid)) =>
  doc(store, "osmReviews", venue, "reviews", uid);

async function seedLegacyPendingReview(uid = "person-1") {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), "osmReviews", "node_12345", "reviews", uid),
      osmReview(uid, {status: "pending"}));
  });
}

test("OSM: new authenticated reviews publish immediately and are publicly readable", async () => {
  await assertFails(setDoc(osmPath("guest", "node_12345", anonymous()), osmReview("guest")));
  await assertSucceeds(setDoc(osmPath(), osmReview("person-1")));
  const publicDoc = await assertSucceeds(getDoc(osmPath("person-1", "node_12345", anonymous())));
  assert.equal(publicDoc.data().rating, 4);
  assert.equal(publicDoc.data().status, "published");
});

test("OSM: checking your own missing review is allowed", async () => {
  const result = await assertSucceeds(getDoc(osmPath()));
  assert.equal(result.exists(), false);
});

test("OSM: invalid new reviews cannot bypass identity or schema checks", async () => {
  await assertFails(setDoc(osmPath("other-uid", "node_12345", user("person-1")), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("different-user")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {status: "pending"})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {rating: 6})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {rating: 0})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {parkVisible: "yes"})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {streetCrossing: null})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {comment: "a".repeat(701)})));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {parkId: "not-an-osm-id"})));
  await assertFails(setDoc(osmPath("person-1", "bad-id"), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {isAdmin: true})));
});

test("OSM: public list only accepts status published queries", async () => {
  await assertSucceeds(setDoc(osmPath(), osmReview("person-1")));
  await seedLegacyPendingReview("person-2");
  const group=collection(anonymous(), "osmReviews", "node_12345", "reviews");
  await assertFails(getDocs(group));
  await assertFails(getDocs(query(group, where("status", "==", "pending"))));
  const snap=await assertSucceeds(getDocs(query(group, where("status", "==", "published"))));
  assert.equal(snap.size, 1);
  await assertFails(getDoc(osmPath("person-2", "node_12345", anonymous())));
});

test("OSM: the author can only promote their old pending review", async () => {
  await seedLegacyPendingReview();
  await assertFails(updateDoc(osmPath("person-1","node_12345",user("person-2")), {status:"published"}));
  await assertFails(updateDoc(osmPath(), {status:"published",rating:1}));
  await assertFails(updateDoc(osmPath(), {comment:"Texto modificado"}));
  await assertFails(updateDoc(osmPath(), {status:"rejected"}));
  await assertSucceeds(updateDoc(osmPath(), {status:"published"}));
  const published=await assertSucceeds(getDoc(osmPath("person-1","node_12345",anonymous())));
  assert.equal(published.data().status,"published");
  assert.equal(published.data().rating,4);
  await assertFails(updateDoc(osmPath(), {status:"pending"}));
  await assertFails(updateDoc(osmPath(), {rating:1}));
});

test("OSM: published reviews cannot be replaced or deleted by their author", async () => {
  await assertSucceeds(setDoc(osmPath(), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", {rating:1})));
  await assertFails(updateDoc(osmPath(), {comment:"Cambio no autorizado"}));
  await assertSucceeds(updateDoc(osmPath("person-1", "node_12345", admin()), {comment:"Moderación excepcional"}));
});

const summaryPath = (venue = "node_12345", database = user()) =>
  doc(database, "osmReviews", venue);
const mirrorPath = (uid = "person-1", venue = "node_12345", database = user(uid)) =>
  doc(database, "userReviews", uid, "items", venue);

async function submitIndexedReview(uid = "person-1") {
  const database = user(uid);
  const data = osmReview(uid);
  const write = writeBatch(database);
  write.set(osmPath(uid, "node_12345", database), data);
  write.set(mirrorPath(uid, "node_12345", database), data);
  write.set(summaryPath("node_12345", database), {
    reviewed: true, venueName: data.venueName, updatedAt: serverTimestamp()
  }, {merge:true});
  await assertSucceeds(write.commit());
}

test("Verified community venues must be backed by a published review", async () => {
  await assertFails(setDoc(summaryPath(), {
    reviewed:true, venueName:"Bar inventado", updatedAt:serverTimestamp()
  }));
  await assertFails(setDoc(mirrorPath(), osmReview("person-1")));
  await submitIndexedReview();
  const publicSummary=await assertSucceeds(getDoc(summaryPath("node_12345", anonymous())));
  assert.equal(publicSummary.data().reviewed,true);
  assert.deepEqual(Object.keys(publicSummary.data()).sort(),["reviewed","updatedAt","venueName"]);
  const publicList=await assertSucceeds(getDocs(collection(anonymous(),"osmReviews")));
  assert.equal(publicList.size,1);
  const publicReview=await assertSucceeds(getDoc(osmPath("person-1","node_12345",anonymous())));
  assert.equal(publicReview.data().status,"published");
});

test("Mis reseñas is private and can be read without collection-group indexes", async () => {
  await submitIndexedReview();
  const mine=await assertSucceeds(getDocs(collection(user(),"userReviews","person-1","items")));
  assert.equal(mine.size,1);
  assert.equal(mine.docs[0].data().venueName,"Cafetería junto al parque");
  await assertFails(getDocs(collection(anonymous(),"userReviews","person-1","items")));
  await assertFails(getDocs(collection(user("person-2"),"userReviews","person-1","items")));
  await assertFails(getDoc(mirrorPath("person-1","node_12345",user("person-2"))));
  await assertFails(setDoc(mirrorPath("person-1","node_678",user("person-2")),osmReview("person-2")));
});

test("Editing an own published review succeeds, keeping the private copy in sync", async () => {
  await submitIndexedReview();
  const before=await assertSucceeds(getDoc(osmPath()));
  const next={rating:2,comment:"Editado tras otra visita",parkVisible:false,
    streetCrossing:true,updatedAt:serverTimestamp()};
  const database=user(), batch=writeBatch(database);
  batch.update(osmPath("person-1","node_12345",database),next);
  batch.set(mirrorPath("person-1","node_12345",database),{...before.data(),...next});
  batch.set(summaryPath("node_12345",database),{
    reviewed:true,venueName:"Cafetería junto al parque",updatedAt:serverTimestamp()
  },{merge:true});
  await assertSucceeds(batch.commit());
  const publicReview=await assertSucceeds(getDoc(osmPath("person-1","node_12345",anonymous())));
  assert.equal(publicReview.data().rating,2);
  assert.equal(publicReview.data().parkVisible,false);
  assert.equal(publicReview.data().comment,"Editado tras otra visita");
  const myCopy=await assertSucceeds(getDoc(mirrorPath()));
  assert.equal(myCopy.data().rating,2);
  assert.equal(myCopy.data().streetCrossing,true);
});

test("Editing cannot forge identity, change the park, or bypass field checks", async () => {
  await submitIndexedReview();
  await assertFails(updateDoc(osmPath(),{rating:1}));
  await assertFails(updateDoc(osmPath(),{rating:8,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(osmPath(),{parkId:"way/999",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(osmPath(),{uid:"another-person",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(osmPath(),{status:"pending",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(osmPath("person-1","node_12345",user("person-2")),
    {comment:"No soy el autor",updatedAt:serverTimestamp()}));
  await assertFails(setDoc(mirrorPath(),osmReview("person-1",{rating:1})));
});

test("A historical pending review can be promoted and indexed by its author", async () => {
  await seedLegacyPendingReview("person-1");
  const previously=await assertSucceeds(getDoc(osmPath()));
  const database=user();
  const batch=writeBatch(database);
  batch.update(osmPath("person-1","node_12345",database),{status:"published"});
  batch.set(mirrorPath("person-1","node_12345",database),
    {...previously.data(),status:"published"});
  batch.set(summaryPath("node_12345",database),{
    reviewed:true,venueName:"Cafetería junto al parque",updatedAt:serverTimestamp()
  },{merge:true});
  await assertSucceeds(batch.commit());
  const resulting=await assertSucceeds(getDoc(osmPath("person-1","node_12345",anonymous())));
  assert.equal(resulting.data().status,"published");
  const myListing=await assertSucceeds(getDoc(mirrorPath()));
  assert.equal(myListing.data().status,"published");
});

test("el catálogo geográfico de pruebas es público y ningún cliente puede modificarlo", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "osmCatalogTest/valencia"), { schemaVersion: 1 });
    await setDoc(doc(ctx.firestore(), "osmCatalogTest/valencia/places/node_2"), { geohash: "ezp" });
  });
  await assertSucceeds(getDoc(doc(anonymous(), "osmCatalogTest/valencia")));
  await assertSucceeds(getDocs(collection(anonymous(), "osmCatalogTest/valencia/places")));
  for (const db of [anonymous(), user(), admin()]) {
    await assertFails(setDoc(doc(db, "osmCatalogTest/valencia/places/node_2"), { geohash: "fake" }));
    await assertFails(setDoc(doc(db, "osmCatalogTest/valencia"), { revision: "fake" }));
  }
  await assertSucceeds(getDoc(doc(anonymous(), "osmCatalogTest/madrid")));
  await assertSucceeds(getDocs(collection(anonymous(), "osmCatalogTest/madrid/places")));
  for (const db of [anonymous(), user(), admin()]) {
    await assertFails(setDoc(doc(db, "osmCatalogTest/madrid/places/node_2"), { geohash: "fake" }));
    await assertFails(setDoc(doc(db, "osmCatalogTest/madrid"), { revision: "fake" }));
  }
  await assertFails(getDocs(collection(anonymous(), "osmCatalogTest/barcelona/places")));
});
