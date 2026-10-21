import { collection, doc, endAt, getDoc, getDocs, orderBy, query, startAt } from "firebase/firestore";
import { firestore } from "./firebase.js";
import { CATALOG_PATH, createGeoLoader, queryArea, unpackGeoDocuments } from "../lib/geo-catalog.js";

let metadata;
let metadataAt = 0;
export async function loadGeoMetadata() {
  if (!firestore) throw Error("Firebase no está disponible");
  if (!metadata || Date.now() - metadataAt >= 300000) {
    const snapshot = await getDoc(doc(firestore, CATALOG_PATH));
    const data = snapshot.data();
    if (!snapshot.exists() || data?.schemaVersion !== 1 || !data.coverage || !data.revision) {
      throw Error("El catálogo geográfico de pruebas todavía no está preparado");
    }
    metadata = data;
    metadataAt = Date.now();
  }
  return metadata;
}

const load = createGeoLoader(async (start, end) => {
  const snapshot = await getDocs(query(collection(firestore, `${CATALOG_PATH}/places`),
    orderBy("geohash"), startAt(start), endAt(end)));
  return snapshot.docs.map((document) => document.data());
});

export async function loadGeoSnapshot(bounds) {
  const data = await loadGeoMetadata();
  const center = bounds.getCenter();
  const area = data.coverage;
  if (center.lat < area.south || center.lat > area.north ||
      center.lng < area.west || center.lng > area.east) {
    return { ...data, elements: [], parkMatches: [], geo: true };
  }
  const search = queryArea(bounds);
  const documents = await load(search.center, search.radius, data.revision);
  return { ...data, ...unpackGeoDocuments(documents), geo: true };
}
