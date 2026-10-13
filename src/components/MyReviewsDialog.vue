<script setup>
import { ref, watch, onUnmounted } from "vue";
import AppDialog from "./AppDialog.vue";
import ReviewFlags from "./ReviewFlags.vue";
import { stars } from "../lib/reviews.mjs";
import { reviewDate } from "../lib/places.js";
import { loadMyReviews } from "../services/firebase.js";
const props = defineProps({ open: Boolean, user: Object, revision: Number });
const emit = defineEmits(["close", "edit"]);
const items = ref([]),
  status = ref("");
let sequence = 0;
watch(
  () => [props.open, props.user?.uid, props.revision],
  async () => {
    const request = ++sequence,
      uid = props.user?.uid;
    items.value = [];
    if (!props.open || !uid) return;
    status.value = "Cargando tus reseñas…";
    try {
      const records = await loadMyReviews(uid);
      if (request !== sequence) return;
      items.value = records;
      status.value = records.length
        ? records.length +
          (records.length === 1 ? " reseña publicada" : " reseñas publicadas")
        : "Todavía no tienes reseñas registradas en este listado.";
    } catch {
      if (request === sequence)
        status.value =
          "No se pudieron cargar tus reseñas. Inténtalo más tarde.";
    }
  },
  { immediate: true },
);
onUnmounted(() => sequence++);
function edit(item) {
  emit("edit", {
    venue: {
      id: item.key.replace("_", "/"),
      tags: { name: item.venueName || "Establecimiento" },
    },
    park: {
      id: item.parkId,
      tags: { name: item.parkName || "Parque infantil", leisure: "playground" },
    },
  });
}
</script>
<template>
  <AppDialog
    id="myReviewsModal"
    :open="open && !!user"
    aria-labelledby="myReviewsTitle"
    @close="$emit('close')"
    ><div class="my-reviews-header">
      <div>
        <h2 id="myReviewsTitle">Mis reseñas</h2>
        <p class="small">Consulta y edita las opiniones que has publicado.</p>
      </div>
      <button
        id="myReviewsClose"
        type="button"
        class="secondary"
        @click="$emit('close')"
      >
        Cerrar
      </button>
    </div>
    <p id="myReviewsStatus" role="status" class="small">{{ status }}</p>
    <section id="myReviewsList" aria-label="Reseñas que has publicado">
      <article v-for="item in items" :key="item.key" class="my-review-card">
        <h3>{{ item.venueName || "Bar o cafetería" }}</h3>
        <p class="my-review-card__stars">{{ stars(item.rating) }}</p>
        <p class="small">Parque: {{ item.parkName || "Parque infantil" }}</p>
        <ReviewFlags :review="item" />
        <p class="small">
          {{ reviewDate(item) ? "Publicado: " + reviewDate(item) : "" }}
        </p>
        <p v-if="item.comment" class="my-review-card__comment">
          {{ item.comment }}
        </p>
        <button type="button" class="secondary" @click="edit(item)">
          Editar reseña
        </button>
      </article>
    </section>
    <p class="small my-reviews-legacy">
      Si echas en falta una reseña antigua, abre ese bar en el mapa una vez con
      tu sesión iniciada para recuperarla aquí.
    </p></AppDialog
  >
</template>
