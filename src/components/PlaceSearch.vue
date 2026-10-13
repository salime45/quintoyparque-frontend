<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { findPlaces, normalizeSearchText } from "../lib/place-search.js";
const props = defineProps({
  catalog: Function,
  radius: Number,
  published: Array,
});
const emit = defineEmits(["select"]);
const text = ref(""),
  hits = ref([]),
  expanded = ref(false),
  message = ref("");
const input = ref(null),
  list = ref(null),
  root = ref(null);
let sequence = 0;
function close() {
  sequence++;
  expanded.value = false;
}
async function search() {
  const query = text.value.trim(),
    request = ++sequence;
  if (normalizeSearchText(query).length < 2) {
    hits.value = [];
    expanded.value = false;
    return;
  }
  expanded.value = true;
  hits.value = [];
  message.value = "Buscando lugares…";
  try {
    const entries = await props.catalog();
    if (request !== sequence) return;
    hits.value = findPlaces(entries, query, 9);
    message.value = hits.value.length
      ? ""
      : "No encontramos ese sitio con el radio seleccionado. Prueba con otro nombre, amplía a 100/150 m o propón un lugar.";
  } catch {
    if (request === sequence)
      message.value =
        "No se pudo consultar el catálogo de lugares. Inténtalo de nuevo.";
  }
}
function select(hit) {
  text.value = hit.label;
  close();
  emit("select", hit);
}
function clear() {
  text.value = "";
  hits.value = [];
  close();
  input.value.focus();
}
function keydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    input.value.focus();
  } else if (
    expanded.value &&
    ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
  ) {
    const buttons = [...list.value.querySelectorAll("button")];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "Enter") {
      if (index < 0) select(hits.value[0]);
      else buttons[index].click();
    } else if (event.key === "ArrowUp" && index <= 0) input.value.focus();
    else
      buttons[
        (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
      ].focus();
  }
}
function outside(event) {
  if (!root.value?.contains(event.target)) close();
}
watch(
  () => [props.radius, props.published],
  () => {
    if (text.value.trim()) void search();
  },
);
onMounted(() => document.addEventListener("pointerdown", outside));
onUnmounted(() => {
  close();
  document.removeEventListener("pointerdown", outside);
});
</script>
<template>
  <div
    ref="root"
    class="place-search"
    role="search"
    aria-label="Buscar lugares en Valencia"
    @keydown="keydown"
  >
    <label for="placeSearch">¿Qué sitio buscas?</label>
    <div class="place-search__field">
      <span class="place-search__icon" aria-hidden="true">⌕</span
      ><input
        id="placeSearch"
        ref="input"
        v-model="text"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="expanded"
        aria-controls="placeSearchResults"
        autocomplete="off"
        placeholder="Bar, parque o calle…"
        spellcheck="false"
        @input="search"
        @focus="search"
      /><button
        id="clearPlaceSearch"
        type="button"
        class="place-search__clear"
        aria-label="Limpiar búsqueda"
        :hidden="!text"
        @click="clear"
      >
        ×
      </button>
    </div>
    <div
      id="placeSearchResults"
      ref="list"
      class="place-search__results"
      role="listbox"
      aria-label="Lugares encontrados"
      :hidden="!expanded"
    >
      <p v-if="message" class="place-search__empty">{{ message }}</p>
      <button
        v-for="hit in hits"
        :key="hit.id"
        type="button"
        class="place-search__item"
        role="option"
        aria-selected="false"
        @click="select(hit)"
      >
        <span class="place-search__kind" aria-hidden="true"
          ><img
            :src="
              hit.kind === 'park'
                ? '/brand/park-marker.svg'
                : '/brand/beer-marker.svg'
            "
            alt=""
            width="20"
            height="26" /></span
        ><span class="place-search__details"
          ><strong>{{ hit.label }}</strong
          ><small>{{ hit.subtitle }}</small></span
        >
      </button>
    </div>
    <p class="place-search__help">
      Busca en toda Valencia y alrededores, no solo en el mapa visible.
    </p>
  </div>
</template>
