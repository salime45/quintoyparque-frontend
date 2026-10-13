// Modelo de reseñas para pares local-parque de OpenStreetMap.
// La ruta es estable aunque el nombre o las coordenadas cambien.
const osmIdPattern = /^(node|way|relation)\/([1-9][0-9]{0,19})$/;

export function osmVenueKey(item) {
  const id = typeof item === "string" ? item : item?.id;
  if (typeof id !== "string" || !osmIdPattern.test(id)) {
    throw new TypeError("Identificador OSM inválido");
  }
  return id.replace("/", "_");
}

export function reviewPlaceName(item, fallback) {
  const raw = item?.tags?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  return (name || fallback).slice(0, 120);
}

function yesOrNo(value, field) {
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new RangeError("Indica sí o no para " + field);
}

export function buildReviewDocument({ uid, venue, park, rating, parkVisible, streetCrossing, comment = "", createdAt }) {
  osmVenueKey(venue);
  osmVenueKey(park);
  if (typeof uid !== "string" || uid.length === 0) throw new TypeError("Usuario no identificado");
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new RangeError("La puntuación debe estar entre 1 y 5");
  if (typeof comment !== "string" || comment.trim().length > 700) {
    throw new RangeError("El comentario no puede superar 700 caracteres");
  }
  if (!createdAt) throw new TypeError("Falta la fecha de creación");
  return {
    uid,
    venueName: reviewPlaceName(venue, "Bar o cafetería"),
    parkId: park.id,
    parkName: reviewPlaceName(park, "Parque infantil"),
    rating: n,
    parkVisible: yesOrNo(parkVisible, "visibilidad"),
    streetCrossing: yesOrNo(streetCrossing, "cruce de calle"),
    comment: comment.trim(),
    status: "published",
    createdAt,
  };
}

export function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.floor(Number(rating) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}
