import {
  ref,
  shallowRef,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from "vue";
import { usesGeoCatalog } from "../lib/geo-catalog.js";
import { loadVisiblePairs, getSearchCatalog } from "../services/catalog.js";
import {
  firebaseAvailable,
  observeUser,
  login,
  logout,
  loadReviewedKeys,
  loadPublished,
} from "../services/firebase.js";
import { publishedPlaceSearchEntry } from "../lib/place-search.js";
import { visiblePlaces } from "../lib/places.js";
import { osmVenueKey } from "../lib/reviews.mjs";

export function useExplorer(mapView, closeMenu) {
  const user = shallowRef(null);
  const radius = ref(60);
  const onlyParks = ref(true),
    onlyCafes = ref(true),
    onlyVerified = ref(false);
  const status = ref("Cargando mapa…"),
    loading = ref(false);
  const pairs = shallowRef(null),
    reviewedKeys = shallowRef(new Set()),
    published = shallowRef([]);
  const selection = shallowRef(null),
    reviewTarget = shallowRef(null),
    myReviewsOpen = ref(false);
  const suggestionOpen = ref(false),
    pickingSuggestion = ref(false);
  const reviewRevision = ref(0);
  const searchRevision = ref(0);
  const places = computed(() =>
    visiblePlaces(
      pairs.value,
      radius.value,
      onlyVerified.value,
      reviewedKeys.value,
    ),
  );
  const publishedEntries = computed(() =>
    published.value
      .map((place) => publishedPlaceSearchEntry(place.id.slice(10), place))
      .filter(Boolean),
  );
  let moveTimer;
  function moved() {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(refresh, 250);
  }
  let sequence = 0,
    disposed = false;
  const stopAuth = observeUser((account) => {
    user.value = account;
    if (!account) {
      myReviewsOpen.value = false;
      suggestionOpen.value = false;
      pickingSuggestion.value = false;
    }
  });
  onUnmounted(() => {
    clearTimeout(moveTimer);
    disposed = true;
    sequence++;
    stopAuth();
  });
  onMounted(() => {
    if (!usesGeoCatalog) void loadReviewedKeys()
      .then((keys) => {
        if (!disposed)
          reviewedKeys.value = new Set([...keys, ...reviewedKeys.value]);
      })
      .catch((error) =>
        console.warn("No se pudieron cargar los locales con reseñas", error),
      );
    void loadPublished()
      .then((places) => {
        if (!disposed) published.value = places;
      })
      .catch((error) =>
        console.warn("No se pudieron cargar los locales publicados", error),
      );
  });
  async function refresh() {
    if (!mapView.value) return;
    const request = ++sequence;
    if (mapView.value.getZoom() < 12) {
      loading.value = false;
      if (usesGeoCatalog) pairs.value = null;
      status.value =
        "Acerca el mapa para explorar los establecimientos de una zona.";
      return;
    }
    loading.value = true;
    status.value = "Cargando parques y locales de esta zona…";
    try {
      const { data, pairs: result } = await loadVisiblePairs(
        mapView.value.getBounds(),
        radius.value,
      );
      if (disposed || request !== sequence) return;
      const center = mapView.value.getCenter(),
        area = data.coverage;
      if (data.geo ? !data.covered : (
        center.lat < area.south ||
        center.lat > area.north ||
        center.lng < area.west ||
        center.lng > area.east
      )) {
        pairs.value = null;
        if (usesGeoCatalog) searchRevision.value++;
        status.value =
          usesGeoCatalog
            ? "Esta zona todavía no está cubierta. Puedes explorar Valencia, Madrid y sus alrededores."
            : "Esta zona todavía no está cubierta. Por ahora puedes explorar Valencia y alrededores.";
        return;
      }
      pairs.value = result;
      if (usesGeoCatalog) searchRevision.value++;
      if (usesGeoCatalog) {
        void loadReviewedKeys(result.venues.map(osmVenueKey)).then((keys) => {
          if (!disposed && request === sequence) reviewedKeys.value = new Set([...reviewedKeys.value, ...keys]);
        }).catch((error) => console.warn("No se pudieron cargar los distintivos de esta zona", error));
      }
      const date = new Date(data.generatedAt).toLocaleDateString("es-ES");
      status.value =
        result.parks.length +
        " zonas infantiles y " +
        result.venues.length +
        " locales a " +
        radius.value +
        " m o dentro del mismo parque (según límites OSM). Datos: " +
        date +
        ". Terraza y visibilidad sin verificar.";
    } catch (error) {
      if (!disposed && request === sequence) {
        pairs.value = null;
        if (usesGeoCatalog) searchRevision.value++;
        status.value =
          "No se pudo cargar el catálogo local. " +
          error.message +
          ". Inténtalo de nuevo en unos minutos.";
      }
    } finally {
      if (request === sequence) loading.value = false;
    }
  }
  watch(radius, refresh);
  async function searchCatalog() {
    return [
      ...(await getSearchCatalog(radius.value, mapView.value.getBounds())),
      ...publishedEntries.value,
    ];
  }
  async function selectPlace(hit) {
    closeMenu();
    onlyParks.value = true;
    onlyCafes.value = true;
    onlyVerified.value = false;
    mapView.value.focusPlace(hit.place, hit.companion);
    await refresh();
    await nextTick();
    mapView.value.openPlace(
      hit.place.id,
      hit.kind === "park" ? hit.label : undefined,
    );
  }
  function showPlace(place) {
    closeMenu();
    mapView.value.focusPlace(place, place.park);
    mapView.value.openPlace(place.id);
  }
  function openReview(venue, park = venue.park) {
    if (venue && park) reviewTarget.value = { venue, park };
  }
  function markReviewed(venue) {
    const key = osmVenueKey(venue);
    if (!reviewedKeys.value.has(key))
      reviewedKeys.value = new Set([...reviewedKeys.value, key]);
    reviewRevision.value++;
  }
  async function signIn() {
    try {
      await login();
    } catch (error) {
      alert("No se pudo iniciar sesión: " + error.message);
    }
  }
  async function signOut() {
    try {
      await logout();
    } catch (error) {
      alert("No se pudo cerrar sesión: " + error.message);
    }
  }
  function locate() {
    closeMenu();
    if (!navigator.geolocation) {
      status.value = "El navegador no admite geolocalización.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (disposed) return;
        mapView.value.focusPlace(
          { lat: position.coords.latitude, lon: position.coords.longitude },
          null,
          15,
        );
        void refresh();
      },
      () => {
        if (!disposed) status.value = "No se ha podido acceder a tu ubicación.";
      },
      { enableHighAccuracy: false, timeout: 9000 },
    );
  }
  function suggest() {
    if (!firebaseAvailable) {
      alert(
        "Pendiente de configurar Firebase. Por ahora puedes explorar el mapa.",
      );
      return;
    }
    if (!user.value) {
      alert("Inicia sesión para proponer un sitio.");
      return;
    }
    selection.value = mapView.value.getCenter();
    suggestionOpen.value = true;
  }
  function pickSuggestion() {
    suggestionOpen.value = false;
    pickingSuggestion.value = true;
    closeMenu();
    status.value = "Haz clic en el mapa para elegir la ubicación del sitio.";
  }
  function mapClick(position) {
    if (!pickingSuggestion.value || !user.value) return;
    selection.value = position;
    pickingSuggestion.value = false;
    suggestionOpen.value = true;
  }
  return {
    user,
    radius,
    onlyParks,
    onlyCafes,
    onlyVerified,
    status,
    loading,
    places,
    published,
    publishedEntries,
    reviewTarget,
    myReviewsOpen,
    suggestionOpen,
    selection,
    reviewRevision,
    searchRevision,
    refresh,
    moved,
    searchCatalog,
    selectPlace,
    showPlace,
    openReview,
    markReviewed,
    signIn,
    signOut,
    locate,
    suggest,
    pickSuggestion,
    mapClick,
    firebaseAvailable,
  };
}
