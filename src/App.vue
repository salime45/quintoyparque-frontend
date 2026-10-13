<script setup>
import { ref, nextTick } from "vue";
import AppHeader from "./components/AppHeader.vue";
import PlaceSearch from "./components/PlaceSearch.vue";
import MapFilters from "./components/MapFilters.vue";
import PlaceResults from "./components/PlaceResults.vue";
import MapView from "./components/MapView.vue";
import ReviewDialog from "./components/ReviewDialog.vue";
import MyReviewsDialog from "./components/MyReviewsDialog.vue";
import SuggestionDialog from "./components/SuggestionDialog.vue";
import { useExplorer } from "./composables/useExplorer.js";
import { useMobileMenu } from "./composables/useMobileMenu.js";
const mapView = ref(null);
const { mobile, active: menuOpen, setOpen } = useMobileMenu();
const {
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
  refresh,
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
} = useExplorer(mapView, () => setOpen(false));
let returnToMyReviews = false;
async function editReview(target) {
  returnToMyReviews = true;
  myReviewsOpen.value = false;
  await nextTick();
  reviewTarget.value = target;
}
async function closeReview() {
  reviewTarget.value = null;
  await nextTick();
  if (returnToMyReviews && user.value) myReviewsOpen.value = true;
  returnToMyReviews = false;
}
async function selectedPlace(hit) {
  try {
    await selectPlace(hit);
  } catch {
    status.value = "No se pudo abrir el lugar. Inténtalo de nuevo.";
  }
}
</script>
<template>
  <AppHeader
    :user="user"
    :available="firebaseAvailable"
    :menu-open="menuOpen"
    @toggle-menu="setOpen(!menuOpen)"
    @login="signIn"
    @logout="signOut"
    @my-reviews="myReviewsOpen = true"
  />
  <main>
    <button
      id="menuBackdrop"
      class="menu-backdrop"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      :hidden="!menuOpen"
      @click="setOpen(false)"
    ></button>
    <aside
      id="exploreMenu"
      :class="{ 'is-open': menuOpen }"
      aria-labelledby="exploreTitle"
      :inert="mobile && !menuOpen"
      :role="menuOpen ? 'dialog' : undefined"
      :aria-modal="menuOpen ? 'true' : undefined"
    >
      <div class="explore-menu-header">
        <h2 id="exploreTitle" style="margin: 0">Explora el mapa</h2>
        <button
          id="menuClose"
          class="secondary mobile-menu-close"
          type="button"
          aria-label="Cerrar menú"
          @click="setOpen(false)"
        >
          ✕
        </button>
      </div>
      <p class="small">
        Encuentra bares, cafeterías, restaurantes y locales de comida rápida
        próximos a parques infantiles, incluidos los que están
        <strong>dentro del mismo parque</strong>. La distancia se mide en línea
        recta: la cercanía no garantiza visibilidad desde la terraza.
      </p>
      <PlaceSearch
        :catalog="searchCatalog"
        :radius="radius"
        :published="publishedEntries"
        @select="selectedPlace"
      />
      <div class="controls">
        <button id="reload" :disabled="loading" @click="refresh">
          Buscar aquí</button
        ><button id="near" class="secondary" @click="locate">
          Mi ubicación</button
        ><button id="suggest" class="secondary" @click="suggest">
          Proponer sitio
        </button>
      </div>
      <div id="status" role="status">{{ status }}</div>
      <MapFilters
        v-model:radius="radius"
        v-model:only-parks="onlyParks"
        v-model:only-cafes="onlyCafes"
        v-model:only-verified="onlyVerified"
      />
      <PlaceResults
        :venues="places.venues"
        :radius="radius"
        :verified-only="onlyVerified"
        @show="showPlace"
        @review="openReview"
      />
      <footer>
        Datos ©
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          >OpenStreetMap contributors</a
        >
        (ODbL). Los límites de parques se calculan automáticamente con
        OpenStreetMap al actualizar el catálogo. Los locales propuestos por
        familias se revisan por separado. «Verificado» significa que tiene al
        menos una reseña comunitaria, no una inspección del local. Comprueba
        terraza, cruces, seguridad y horarios antes de ir.
      </footer>
    </aside>
    <MapView
      ref="mapView"
      :parks="places.parks"
      :venues="places.venues"
      :published="published"
      :only-parks="onlyParks"
      :only-cafes="onlyCafes"
      :verified-only="onlyVerified"
      :radius="radius"
      :uid="user?.uid"
      :revision="reviewRevision"
      :inert="menuOpen"
      @ready="refresh"
      @review="openReview"
      @promoted="markReviewed"
      @map-click="mapClick"
    />
  </main>
  <ReviewDialog
    :target="reviewTarget"
    :user="user"
    @close="closeReview"
    @saved="markReviewed"
    @promoted="markReviewed"
  />
  <MyReviewsDialog
    :open="myReviewsOpen"
    :user="user"
    :revision="reviewRevision"
    @close="myReviewsOpen = false"
    @edit="editReview"
  />
  <SuggestionDialog
    :open="suggestionOpen"
    :user="user"
    :position="selection"
    @close="suggestionOpen = false"
    @pick="pickSuggestion"
  />
</template>
