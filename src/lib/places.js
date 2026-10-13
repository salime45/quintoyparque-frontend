import { osmVenueKey } from "./reviews.mjs";

export const safeLabel = (place) =>
  place.tags?.name ||
  (place.tags?.leisure === "playground"
    ? "Parque infantil"
    : {
        cafe: "Cafetería sin nombre",
        bar: "Bar sin nombre",
        restaurant: "Restaurante sin nombre",
        fast_food: "Local de comida rápida sin nombre",
      }[place.tags?.amenity] || "Establecimiento sin nombre");
export const coords = (place) => ({
  lat: place.lat ?? place.center?.lat,
  lon: place.lon ?? place.lng ?? place.center?.lon,
});
export function distance(a, b) {
  const rad = Math.PI / 180;
  return Math.round(
    6371000 *
      Math.hypot(
        (b.lat - a.lat) * rad,
        (b.lon - a.lon) * rad * Math.cos(a.lat * rad),
      ),
  );
}
export function visiblePlaces(pairs, radius, verifiedOnly, reviewedKeys) {
  if (!pairs) return { parks: [], venues: [] };
  const venues = pairs.venues
    .map((place) => ({
      ...place,
      dist: pairs.venueDistances.get(place.id),
      inSamePark: pairs.sameParkVenueIds.has(place.id),
      urbanParkName: pairs.sameParkNames.get(place.id) || "",
      park: pairs.nearestParkByVenue.get(place.id),
      reviewed: reviewedKeys.has(osmVenueKey(place)),
    }))
    .filter(
      (place) =>
        place.dist != null &&
        (place.dist <= radius || place.inSamePark) &&
        (!verifiedOnly || place.reviewed),
    )
    .sort(
      (a, b) => Number(b.inSamePark) - Number(a.inSamePark) || a.dist - b.dist,
    );
  const parks = pairs.parks
    .filter(
      (park) =>
        !verifiedOnly ||
        venues.some(
          (venue) =>
            distance(coords(park), coords(venue)) <= radius ||
            (venue.inSamePark && venue.park?.id === park.id),
        ),
    )
    .map((park) => ({
      ...park,
      count: verifiedOnly
        ? venues.filter(
            (venue) =>
              distance(coords(park), coords(venue)) <= radius ||
              (venue.inSamePark && venue.park?.id === park.id),
          ).length
        : pairs.parkVenueCounts.get(park.id) || 0,
    }));
  return { parks, venues };
}
export function reviewDate(item) {
  const stamp = item.createdAt;
  const date =
    typeof stamp?.toDate === "function"
      ? stamp.toDate()
      : typeof stamp?.seconds === "number"
        ? new Date(stamp.seconds * 1000)
        : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : "";
}
