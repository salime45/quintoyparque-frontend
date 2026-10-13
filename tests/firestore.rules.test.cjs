const { before, after, beforeEach, test } = require("node:test");
const fs = require("node:fs");
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
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}
const osmPath = (uid = "person-1", venue = "node_12345", store = user(uid)) =>
  doc(store, "osmReviews", venue, "reviews", uid);

test("OSM venue reviews: authenticated visitors can submit pending reviews", async () => {
  await assertFails(setDoc(osmPath("guest", "node_12345", anonymous()), osmReview("guest")));
  await assertSucceeds(setDoc(osmPath(), osmReview("person-1")));
  await assertSucceeds(getDoc(osmPath()));
  await assertFails(getDoc(osmPath("person-1", "node_12345", anonymous())));
  await assertFails(getDoc(osmPath("person-1", "node_12345", user("person-2"))));
});

test("OSM venue reviews: checking your own missing review is allowed", async () => {
  const result = await assertSucceeds(getDoc(osmPath()));
  assert.equal(result.exists(), false);
});

test("OSM venue reviews: cannot forge identity, publish, or submit invalid fields", async () => {
  await assertFails(setDoc(osmPath("other-uid", "node_12345", user("person-1")), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("different-user")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { status: "published" })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { rating: 6 })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { rating: 0 })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { parkVisible: "yes" })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { streetCrossing: null })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { comment: "a".repeat(701) })));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { parkId: "not-an-osm-id" })));
  await assertFails(setDoc(osmPath("person-1", "bad-id"), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { isAdmin: true })));
});

test("OSM venue reviews: public can query only published reviews", async () => {
  const path=osmPath();
  await assertSucceeds(setDoc(path, osmReview("person-1")));
  const group=collection(anonymous(), "osmReviews", "node_12345", "reviews");
  await assertFails(getDocs(group));
  await assertFails(getDocs(query(group, where("status", "==", "pending"))));
  await assertSucceeds(getDocs(query(group, where("status", "==", "published"))));
  await assertSucceeds(setDoc(osmPath("person-1", "node_12345", admin()), osmReview("person-1", { status: "published" })));
  const publicRead=await assertSucceeds(getDoc(doc(anonymous(), "osmReviews", "node_12345", "reviews", "person-1")));
  assert.equal(publicRead.data().rating, 4);
  const published=await assertSucceeds(getDocs(query(group, where("status", "==", "published"))));
  assert.equal(published.size, 1);
});

test("OSM venue reviews: users cannot change or resubmit existing reviews", async () => {
  await assertSucceeds(setDoc(osmPath(), osmReview("person-1")));
  await assertFails(setDoc(osmPath(), osmReview("person-1", { rating: 1 })));
  await assertSucceeds(setDoc(osmPath("person-1", "node_12345", admin()), osmReview("person-1", { status: "published" })));
  await assertFails(setDoc(osmPath(), osmReview("person-1")));
});
