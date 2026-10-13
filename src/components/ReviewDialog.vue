<script setup>
import { ref, reactive, watch, onUnmounted } from "vue";
import AppDialog from "./AppDialog.vue";
import { safeLabel } from "../lib/places.js";
import { stars } from "../lib/reviews.mjs";
import {
  firebaseAvailable,
  login,
  loadMyReview,
  promoteOlderReview,
  saveReview,
} from "../services/firebase.js";
const props = defineProps({ target: Object, user: Object });
const emit = defineEmits(["close", "saved", "promoted"]);
const fields = reactive({
  rating: "",
  parkVisible: "",
  streetCrossing: "",
  comment: "",
});
const editing = ref(false),
  message = ref(""),
  confirmation = ref(""),
  showForm = ref(false),
  saving = ref(false);
let sequence = 0;
watch(
  () => [props.target, props.user?.uid],
  async () => {
    const request = ++sequence,
      target = props.target,
      uid = props.user?.uid;
    Object.assign(fields, {
      rating: "",
      parkVisible: "",
      streetCrossing: "",
      comment: "",
    });
    editing.value = false;
    showForm.value = false;
    confirmation.value = "";
    if (!target) return;
    if (!firebaseAvailable) {
      message.value = "No se puede guardar la reseña ahora mismo.";
      return;
    }
    if (!uid) {
      message.value = "Inicia sesión para publicar una opinión.";
      return;
    }
    message.value = "Cargando tu reseña…";
    try {
      try {
        if (await promoteOlderReview(target.venue, uid))
          emit("promoted", target.venue);
      } catch (error) {
        console.warn("No se pudo sincronizar la reseña antigua", error);
      }
      const existing = await loadMyReview(target.venue, uid);
      if (request !== sequence) return;
      message.value = "";
      if (existing && existing.status !== "published") {
        confirmation.value =
          "Esta reseña aún no puede editarse. Vuelve a abrirla o inténtalo más tarde.";
        return;
      }
      if (existing) {
        editing.value = true;
        Object.assign(fields, {
          rating: String(existing.rating),
          parkVisible: existing.parkVisible ? "yes" : "no",
          streetCrossing: existing.streetCrossing ? "yes" : "no",
          comment: existing.comment || "",
        });
      }
      showForm.value = true;
    } catch {
      if (request === sequence)
        message.value =
          "No se ha podido consultar Firestore. Revisa la conexión e inténtalo otra vez.";
    }
  },
  { immediate: true },
);
onUnmounted(() => sequence++);
async function signIn() {
  try {
    await login();
  } catch (error) {
    message.value = "No se pudo iniciar sesión: " + error.message;
  }
}
async function submit() {
  if (!props.user || !props.target || saving.value) return;
  const request = sequence,
    target = props.target,
    uid = props.user.uid,
    isEditing = editing.value;
  saving.value = true;
  message.value = isEditing ? "Guardando cambios…" : "Publicando reseña…";
  try {
    const record = await saveReview({
      uid,
      ...target,
      fields: { ...fields },
      editing: isEditing,
    });
    emit("saved", target.venue);
    if (request !== sequence) return;
    showForm.value = false;
    confirmation.value =
      (isEditing ? "Cambios guardados: " : "Reseña publicada: ") +
      stars(record.rating) +
      ". Tu opinión ya es pública.";
    message.value = isEditing
      ? "Tu reseña se ha actualizado."
      : "Gracias por compartir tu experiencia.";
  } catch (error) {
    if (request === sequence)
      message.value =
        error.code === "permission-denied"
          ? "No se pudo guardar: comprueba tu sesión y los permisos de Firestore."
          : "No se pudo guardar la reseña. " + error.message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <AppDialog
    id="reviewModal"
    :open="!!target"
    aria-labelledby="reviewTitle"
    @close="$emit('close')"
    ><div class="review-dialog-header">
      <img
        class="modal-brand"
        src="/brand/icon.svg"
        alt=""
        aria-hidden="true"
      />
      <div>
        <h2 id="reviewTitle">
          {{ editing ? "Editar mi reseña" : "Dejar una reseña" }}
        </h2>
        <p class="small" id="reviewVenueName">
          {{ target ? safeLabel(target.venue) : "" }}
        </p>
        <p class="small" id="reviewParkName">
          {{ target ? "Parque asociado: " + safeLabel(target.park) : "" }}
        </p>
      </div>
    </div>
    <p class="review-message" role="status" id="reviewMessage">{{ message }}</p>
    <div id="reviewAuthGate" :hidden="!!user">
      <p>Inicia sesión con Google para valorar este sitio.</p>
      <button id="reviewLogin" type="button" @click="signIn">
        Acceder con Google
      </button>
    </div>
    <div id="reviewExisting" class="review-existing" :hidden="!confirmation">
      {{ confirmation }}
    </div>
    <form id="reviewForm" :hidden="!showForm" @submit.prevent="submit">
      <fieldset class="review-fieldset review-stars" :disabled="saving">
        <legend>
          ¿Qué puntuación le das? <span aria-hidden="true">*</span>
        </legend>
        <div class="review-rating-options">
          <label v-for="rating in 5" :key="rating"
            ><input
              v-model="fields.rating"
              type="radio"
              name="rating"
              :value="String(rating)"
              :aria-label="rating + (rating === 1 ? ' estrella' : ' estrellas')"
              required
            /><span
              >★ <small>{{ rating }}</small></span
            ></label
          >
        </div>
      </fieldset>
      <fieldset class="review-fieldset" :disabled="saving">
        <legend>
          ¿Se ve el parque desde la terraza? <span aria-hidden="true">*</span>
        </legend>
        <div class="review-choice">
          <label
            ><input
              v-model="fields.parkVisible"
              type="radio"
              name="parkVisible"
              value="yes"
              required
            />
            Sí</label
          ><label
            ><input
              v-model="fields.parkVisible"
              type="radio"
              name="parkVisible"
              value="no"
            />
            No</label
          >
        </div>
      </fieldset>
      <fieldset class="review-fieldset" :disabled="saving">
        <legend>
          ¿Hay que cruzar alguna calle para llegar al parque?
          <span aria-hidden="true">*</span>
        </legend>
        <div class="review-choice">
          <label
            ><input
              v-model="fields.streetCrossing"
              type="radio"
              name="streetCrossing"
              value="yes"
              required
            />
            Sí</label
          ><label
            ><input
              v-model="fields.streetCrossing"
              type="radio"
              name="streetCrossing"
              value="no"
            />
            No</label
          >
        </div>
      </fieldset>
      <label for="reviewComment">Comentario (opcional)</label
      ><textarea
        id="reviewComment"
        v-model="fields.comment"
        name="comment"
        maxlength="700"
        rows="3"
        :disabled="saving"
        placeholder="¿Se ve bien a los niños? ¿Qué destacarías del sitio?"
      ></textarea>
      <p class="small">
        La reseña se publicará inmediatamente. No incluyas datos personales en
        el comentario.
      </p>
      <div class="actions review-actions">
        <button id="reviewSubmit" type="submit" :disabled="saving">
          {{ editing ? "Guardar cambios" : "Publicar reseña" }}</button
        ><button
          id="reviewCancel"
          type="button"
          class="secondary"
          @click="$emit('close')"
        >
          Cancelar
        </button>
      </div>
    </form>
    <button
      id="reviewClose"
      class="secondary review-close"
      type="button"
      :hidden="showForm"
      @click="$emit('close')"
    >
      Cerrar
    </button></AppDialog
  >
</template>
