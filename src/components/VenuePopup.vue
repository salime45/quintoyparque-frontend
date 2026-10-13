<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { safeLabel, reviewDate } from "../lib/places.js";
import { stars } from "../lib/reviews.mjs";
import { loadVenueReviews, promoteOlderReview } from "../services/firebase.js";
import ReviewFlags from "./ReviewFlags.vue";
const props = defineProps({ venue: Object, uid: String, revision: Number });
const emit = defineEmits(["review", "promoted"]);
const reviews = ref([]),
  message = ref("Cargando opiniones…");
const average = computed(
  () =>
    reviews.value.reduce((sum, item) => sum + item.rating, 0) /
    reviews.value.length,
);
let sequence = 0;
watch(
  () => [props.venue.id, props.uid, props.revision],
  async () => {
    const request = ++sequence;
    message.value = "Cargando opiniones…";
    try {
      if (props.uid) {
        try {
          if (await promoteOlderReview(props.venue, props.uid))
            emit("promoted", props.venue);
        } catch (error) {
          console.warn("No se pudo sincronizar la reseña antigua", error);
        }
      }
      const result = await loadVenueReviews(props.venue);
      if (request !== sequence) return;
      reviews.value = result;
      message.value = result.length
        ? ""
        : "Todavía no hay opiniones. ¡Sé el primero!";
    } catch {
      if (request === sequence)
        message.value =
          "No se pudieron cargar las reseñas. Inténtalo más tarde.";
    }
  },
  { immediate: true },
);
onUnmounted(() => sequence++);
</script>
<template>
  <section class="venue-popup">
    <div class="venue-popup__header">
      <span class="venue-popup__brand" aria-hidden="true"
        ><img src="/brand/beer-marker.svg" alt="" width="23" height="30"
      /></span>
      <div class="venue-popup__title-group">
        <h3 class="venue-popup__title">{{ safeLabel(venue) }}</h3>
        <span class="venue-popup__category">{{
          {
            bar: "Bar",
            cafe: "Cafetería",
            restaurant: "Restaurante",
            fast_food: "Comida rápida",
          }[venue.tags?.amenity] || "Local"
        }}</span>
      </div>
    </div>
    <div class="venue-popup__distance">
      <strong>{{
        venue.inSamePark ? "Dentro del parque" : venue.dist + " m"
      }}</strong
      ><span>{{
        venue.inSamePark
          ? (venue.urbanParkName || "Parque urbano") +
            " · zona infantil a " +
            venue.dist +
            " m"
          : "del " + safeLabel(venue.park)
      }}</span>
    </div>
    <p class="venue-popup__disclaimer">
      {{
        venue.inSamePark
          ? "Dentro del mismo recinto según los polígonos OSM · "
          : "Distancia en línea recta · "
      }}Terraza y visibilidad sin verificar
    </p>
    <div class="popup-reviews" aria-live="polite">
      <p v-if="message" class="popup-review-empty">{{ message }}</p>
      <template v-else
        ><div class="popup-score">
          <span class="popup-score__label">Valoración de la comunidad</span>
          <div class="popup-score__metric">
            <strong class="popup-score__number">{{
              average.toFixed(1).replace(".", ",")
            }}</strong
            ><span class="popup-score__out-of">/ 5</span
            ><span
              class="popup-score__stars"
              role="img"
              :aria-label="average.toFixed(1) + ' de 5 estrellas'"
              >{{ stars(Math.round(average)) }}</span
            >
          </div>
          <span class="popup-score__count"
            >{{ reviews.length }}
            {{ reviews.length === 1 ? "opinión" : "opiniones" }}</span
          >
        </div>
        <h4 class="popup-reviews__heading">Opiniones recientes</h4>
        <article
          v-for="(item, index) in reviews.slice(0, 3)"
          :key="index"
          class="popup-review-item"
        >
          <div class="popup-review-item__heading">
            <span
              class="popup-review-item__stars"
              role="img"
              :aria-label="item.rating + ' de 5 estrellas'"
              >{{ stars(item.rating) }}</span
            ><time v-if="reviewDate(item)">{{ reviewDate(item) }}</time>
          </div>
          <ReviewFlags :review="item" />
          <p
            v-if="item.parkName && item.parkName !== 'Parque infantil'"
            class="popup-review-item__park"
          >
            Parque: {{ item.parkName }}
          </p>
          <p v-if="item.comment" class="popup-review-item__comment">
            {{ item.comment }}
          </p>
        </article>
        <p v-if="reviews.length > 3" class="popup-review-more">
          Mostrando las 3 opiniones más recientes.
        </p></template
      >
    </div>
    <div class="venue-popup__actions">
      <button
        type="button"
        class="popup-review-btn"
        @click="$emit('review', venue, venue.park)"
      >
        Escribir una reseña
      </button>
    </div>
  </section>
</template>
