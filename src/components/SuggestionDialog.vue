<script setup>
import { reactive, ref } from "vue";
import AppDialog from "./AppDialog.vue";
import { saveSuggestion } from "../services/firebase.js";
const props = defineProps({ open: Boolean, user: Object, position: Object });
const emit = defineEmits(["close", "pick"]);
const fields = reactive({ name: "", address: "", comment: "" }),
  saving = ref(false),
  message = ref("");
async function submit() {
  if (!props.user || !props.position || saving.value) return;
  saving.value = true;
  message.value = "";
  try {
    await saveSuggestion(
      props.user.uid,
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, value.trim()]),
      ),
      props.position,
    );
    Object.assign(fields, { name: "", address: "", comment: "" });
    emit("close");
    alert("Propuesta recibida. Quedará pendiente de revisión.");
  } catch (error) {
    message.value = "No se pudo enviar: " + error.message;
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <AppDialog
    id="modal"
    :open="open"
    aria-labelledby="suggestionTitle"
    @close="$emit('close')"
    ><form id="placeForm" @submit.prevent="submit">
      <img
        class="modal-brand"
        src="/brand/icon.svg"
        alt=""
        aria-hidden="true"
      />
      <h2 id="suggestionTitle" style="margin-top: 0">Proponer un sitio</h2>
      <p class="small">
        Selecciona la ubicación en el mapa. Solo se publicará después de
        revisarlo.
      </p>
      <label
        >Nombre del local<input
          v-model="fields.name"
          name="name"
          required
          maxlength="120"
          :disabled="saving" /></label
      ><label
        >Dirección<input
          v-model="fields.address"
          name="address"
          required
          maxlength="250"
          :disabled="saving" /></label
      ><label
        >¿Se ve el parque? ¿Hay que cruzar una calle?<textarea
          v-model="fields.comment"
          name="comment"
          required
          maxlength="700"
          :disabled="saving"
        ></textarea>
      </label>
      <p id="coords" class="small">
        {{
          position
            ? "Ubicación: " +
              position.lat.toFixed(5) +
              ", " +
              position.lng.toFixed(5)
            : ""
        }}
      </p>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="actions">
        <button type="submit" :disabled="saving">Enviar propuesta</button
        ><button
          type="button"
          class="secondary"
          :disabled="saving"
          @click="$emit('pick')"
        >
          Elegir en el mapa</button
        ><button type="button" class="secondary" @click="$emit('close')">
          Cancelar
        </button>
      </div>
    </form></AppDialog
  >
</template>
