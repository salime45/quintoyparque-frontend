import { collection, doc, endAt, getDoc, getDocs, orderBy, query, startAt } from "firebase/firestore";
import { firestore } from "./firebase.js";
import { catalogPath, withinNationalArea } from "../lib/catalog-regions.js";
import { createRegionalCatalog, createNationalCatalog } from "../lib/geo-catalog.js";

const legacy = createRegionalCatalog({
  async readMetadata(region) {
    if (!firestore) throw Error("Firebase no está disponible");
    const snapshot = await getDoc(doc(firestore, catalogPath(region)));
    return snapshot.data();
  },
  async readRange(region, start, end) {
    const snapshot = await getDocs(query(collection(firestore, `${catalogPath(region)}/places`),
      orderBy("geohash"), startAt(start), endAt(end)));
    return snapshot.docs.map((document) => document.data());
  },
});

export const loadGeoSnapshot = createNationalCatalog({
  legacy, withinArea: withinNationalArea,
  async readMetadata() {
    if (!firestore) throw Error("Firebase no está disponible");
    return (await getDoc(doc(firestore, "osmCatalogTest/espana"))).data();
  },
  async readRange(start, end) {
    const snapshot = await getDocs(query(collection(firestore, "osmCatalogTest/espana/places"),
      orderBy("geohash"), startAt(start), endAt(end)));
    return snapshot.docs.map((document) => document.data());
  },
});
