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
