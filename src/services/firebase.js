import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  documentId,
  collection,
  addDoc,
  writeBatch,
  doc,
  getDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import config from "./firebase-config.js";
import { osmVenueKey, buildReviewDocument } from "../lib/reviews.mjs";
import { safeLabel } from "../lib/places.js";

let auth;
let db;
try {
  if (config?.apiKey && config?.projectId) {
    const emulator = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;
    const app = initializeApp(emulator ? { ...config, projectId: "demo-quintoyparque" } : config);
    auth = getAuth(app);
    db = getFirestore(app);
    if (emulator) {
      const [host, port] = emulator.split(":");
      connectFirestoreEmulator(db, host, Number(port));
    }
    if (config.measurementId)
      void import("firebase/analytics")
        .then(async ({ getAnalytics, isSupported }) => {
          if (await isSupported()) getAnalytics(app);
        })
        .catch((error) => console.warn("Analytics no está disponible", error));
  }
} catch (error) {
  console.warn("Firebase no está disponible", error);
}

export { db as firestore };
export const firebaseAvailable = Boolean(auth && db);
export const observeUser = (callback) =>
  auth ? onAuthStateChanged(auth, callback) : () => {};
export const login = () =>
  auth
    ? signInWithPopup(auth, new GoogleAuthProvider())
    : Promise.reject(new Error("Firebase Authentication no está disponible."));
export const logout = () => signOut(auth);
const reviewRef = (venue, uid) =>
  doc(db, "osmReviews", osmVenueKey(venue), "reviews", uid);
const mirrorRef = (uid, venue) =>
  doc(db, "userReviews", uid, "items", osmVenueKey(venue));
const summaryRef = (venue) => doc(db, "osmReviews", osmVenueKey(venue));
const summary = (venue) => ({
  reviewed: true,
  venueName: safeLabel(venue).slice(0, 120),
  updatedAt: serverTimestamp(),
});
const byDate = (a, b) =>
  (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
export async function loadReviewedKeys(keys) {
  if (!db) return new Set();
  const source = collection(db, "osmReviews");
  if (keys) {
    const result = new Set();
    for (let index = 0; index < keys.length; index += 30) {
      const snapshot = await getDocs(query(source, where(documentId(), "in", keys.slice(index, index + 30))));
      snapshot.docs.forEach((item) => { if (item.data().reviewed === true) result.add(item.id); });
    }
    return result;
  }
  const snap = await getDocs(source);
  return new Set(
    snap.docs
      .filter((item) => item.data().reviewed === true)
      .map((item) => item.id),
  );
}
export async function loadPublished() {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "places"), where("status", "==", "published")),
  );
  return snap.docs
    .map((item) => ({ ...item.data(), id: "firestore/" + item.id }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}
export async function loadVenueReviews(venue) {
  if (!db) throw new Error("Las reseñas no están disponibles.");
  const snap = await getDocs(
    query(
      collection(db, "osmReviews", osmVenueKey(venue), "reviews"),
      where("status", "==", "published"),
    ),
  );
  return snap.docs.map((item) => item.data()).sort(byDate);
}
export async function loadMyReview(venue, uid) {
  const snap = await getDoc(reviewRef(venue, uid));
  return snap.exists() ? snap.data() : null;
}
export async function loadMyReviews(uid) {
  const snap = await getDocs(collection(db, "userReviews", uid, "items"));
  return snap.docs
    .map((item) => ({ ...item.data(), key: item.id }))
    .sort(byDate);
}
const promotions = new Map();
export async function promoteOlderReview(venue, uid) {
  if (!db || !uid) return false;
  const key = osmVenueKey(venue) + "/" + uid;
  if (promotions.has(key)) return promotions.get(key);
  const operation = (async () => {
    const reference = reviewRef(venue, uid);
    const old = await getDoc(reference);
    if (!old.exists() || !["pending", "published"].includes(old.data().status))
      return false;
    const existing = old.data();
    const [mirror, head] = await Promise.all([
      getDoc(mirrorRef(uid, venue)),
      getDoc(summaryRef(venue)),
    ]);
    if (existing.status === "published" && mirror.exists() && head.exists())
      return false;
    const batch = writeBatch(db);
    if (existing.status === "pending")
      batch.update(reference, { status: "published" });
    batch.set(mirrorRef(uid, venue), { ...existing, status: "published" });
    batch.set(summaryRef(venue), summary(venue), { merge: true });
    await batch.commit();
    return true;
  })();
  promotions.set(key, operation);
  try {
    return await operation;
  } finally {
    promotions.delete(key);
  }
}
export async function saveReview({ uid, venue, park, fields, editing }) {
  const record = buildReviewDocument({
    uid,
    venue,
    park,
    ...fields,
    createdAt: serverTimestamp(),
  });
  const reference = reviewRef(venue, uid);
  const batch = writeBatch(db);
  if (editing) {
    const previous = await getDoc(reference);
    if (!previous.exists() || previous.data().status !== "published")
      throw new Error("Esta reseña ya no está disponible para editar.");
    const patch = {
      rating: record.rating,
      parkVisible: record.parkVisible,
      streetCrossing: record.streetCrossing,
      comment: record.comment,
      updatedAt: serverTimestamp(),
    };
    batch.update(reference, patch);
    batch.set(mirrorRef(uid, venue), { ...previous.data(), ...patch });
  } else {
    batch.set(reference, record);
    batch.set(mirrorRef(uid, venue), record);
  }
  batch.set(summaryRef(venue), summary(venue), { merge: true });
  await batch.commit();
  return record;
}
export function saveSuggestion(uid, fields, position) {
  return addDoc(collection(db, "suggestions"), {
    uid,
    ...fields,
    lat: position.lat,
    lng: position.lng,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}
