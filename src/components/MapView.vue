<script setup>
import { ref, onMounted, onUnmounted, watch, h, render } from "vue";
import L from "leaflet";
import VenuePopup from "./VenuePopup.vue";
import { safeLabel, coords } from "../lib/places.js";
const props = defineProps({
  parks: Array,
  venues: Array,
  published: Array,
  onlyParks: Boolean,
  onlyCafes: Boolean,
  verifiedOnly: Boolean,
  radius: Number,
  uid: String,
  revision: Number,
  inert: Boolean,
});
const emit = defineEmits(["ready", "review", "promoted", "map-click", "locate"]);
const container = ref(null);
let map, observer, parkLayer, cafeLayer, publishedLayer;
let markers = new Map(),
  popupRoot,
  popupVenue;
function brandMarkerIcon(kind, verified = false) {
  const park = kind === "park";
  return L.divIcon({
    className: "qyp-marker-host",
    html: `<span class="qyp-map-marker qyp-map-marker--${park ? "park" : "venue"}${verified ? " qyp-map-marker--verified" : ""}"><img src="/brand/${park ? "park-marker.svg" : "beer-marker.svg"}" alt="" width="23" height="32">${verified ? '<b class="qyp-map-marker__check" aria-hidden="true">✓</b>' : ""}</span>`,
    iconSize: [40, 45],
    iconAnchor: [20, 43],
    popupAnchor: [0, -41],
  });
}
const parkIcon = brandMarkerIcon("park"),
  venueIcon = brandMarkerIcon("venue"),
  verifiedIcon = brandMarkerIcon("venue", true);
function textPopup(title, text) {
  const root = document.createElement("div"),
    heading = document.createElement("strong");
  heading.textContent = title;
  root.append(
    heading,
    document.createElement("br"),
    document.createTextNode(text),
  );
  return root;
}
function updatePopup() {
  if (!popupRoot || !popupVenue) return;
  render(
    h(VenuePopup, {
      venue: popupVenue,
      uid: props.uid,
      revision: props.revision,
      onReview: (venue, park) => emit("review", venue, park),
      onPromoted: (venue) => emit("promoted", venue),
    }),
    popupRoot,
  );
}
function clearPopup() {
  if (popupRoot) render(null, popupRoot);
  popupRoot = null;
  popupVenue = null;
}
function draw() {
  if (!map) return;
  const openId = [...markers].find(([, marker]) => marker.isPopupOpen())?.[0];
  clearPopup();
  parkLayer.clearLayers();
  cafeLayer.clearLayers();
  publishedLayer.clearLayers();
  markers = new Map();
  for (const park of props.parks) {
    const position = coords(park);
    const marker = L.marker([position.lat, position.lon], {
      icon: parkIcon,
      title: safeLabel(park),
    }).bindPopup(
      textPopup(
        safeLabel(park),
        park.count +
          " locales " +
          (props.verifiedOnly ? "con reseñas" : "relacionados") +
          " · A " +
          props.radius +
          " m o dentro del mismo parque (sin verificar la visibilidad)",
      ),
    );
    markers.set(park.id, marker);
    if (props.onlyParks) marker.addTo(parkLayer);
  }
  for (const venue of props.venues) {
    const position = coords(venue);
    const marker = L.marker([position.lat, position.lon], {
      icon: venue.reviewed ? verifiedIcon : venueIcon,
      title: safeLabel(venue) + (venue.reviewed ? " · Con reseñas" : ""),
    });
    marker.bindPopup(
      () => {
        clearPopup();
        popupRoot = document.createElement("div");
        popupVenue = venue;
        updatePopup();
        return popupRoot;
      },
      {
        className: "qyp-venue-popup",
        maxWidth: 350,
        minWidth: Math.min(300, window.innerWidth - 84),
        maxHeight: Math.max(
          180,
          Math.min(445, Math.round(window.innerHeight * 0.53) - 100),
        ),
      },
    );
    marker.on("popupclose", clearPopup);
    markers.set(venue.id, marker);
    if (props.onlyCafes) marker.addTo(cafeLayer);
  }
  for (const place of props.published) {
    const marker = L.marker([place.lat, place.lng], {
      icon: verifiedIcon,
      title: place.name || "Local publicado",
    }).bindPopup(
      textPopup(
        place.name || "Local publicado",
        (place.description || "Sitio publicado por la comunidad") +
          " · Publicado",
      ),
    );
    markers.set(place.id, marker);
    if (props.onlyCafes) marker.addTo(publishedLayer);
  }
  const previous = markers.get(openId);
  if (previous && map.hasLayer(previous)) previous.openPopup();
}
watch(
  () => [
    props.parks,
    props.venues,
    props.published,
    props.onlyParks,
    props.onlyCafes,
    props.verifiedOnly,
    props.radius,
  ],
  draw,
);
watch(() => [props.uid, props.revision], updatePopup);
onMounted(() => {
  map = L.map(container.value).setView([39.4699, -0.3763], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const locationControl = L.control({ position: "topleft" });
  locationControl.onAdd = () => {
    const control = L.DomUtil.create("div", "leaflet-bar qyp-location-control");
    const button = L.DomUtil.create("button", "qyp-location-button", control);
    button.type = "button";
    button.title = "Centrar en mi ubicación";
    button.setAttribute("aria-label", "Centrar en mi ubicación");
    button.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>';
    L.DomEvent.disableClickPropagation(control);
    L.DomEvent.disableScrollPropagation(control);
    L.DomEvent.on(button, "click", () => emit("locate"));
    return control;
  };
  locationControl.addTo(map);
  parkLayer = L.layerGroup().addTo(map);
  cafeLayer = L.layerGroup().addTo(map);
  publishedLayer = L.layerGroup().addTo(map);
  observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  observer.observe(container.value);
  map.on("click", (event) => emit("map-click", event.latlng));
  draw();
  emit("ready");
});
onUnmounted(() => {
  observer?.disconnect();
  clearPopup();
  map?.remove();
});
function focusPlace(place, companion, zoom = 17) {
  const position = coords(place);
  if (companion) {
    const other = coords(companion);
    map.fitBounds(
      [
        [position.lat, position.lon],
        [other.lat, other.lon],
      ],
      { padding: [70, 70], maxZoom: zoom, animate: false },
    );
  } else map.setView([position.lat, position.lon], zoom, { animate: false });
}
function openPlace(id, label) {
  const marker = markers.get(id);
  if (label)
    marker?.setPopupContent(textPopup(label, "Zona infantil del parque"));
  marker?.openPopup();
}
defineExpose({
  getBounds: () => map.getBounds(),
  getCenter: () => map.getCenter(),
  getZoom: () => map.getZoom(),
  focusPlace,
  openPlace,
});
</script>
<template>
  <div
    id="map"
    ref="container"
    aria-label="Mapa interactivo de Valencia"
    :inert="inert"
  ></div>
</template>
