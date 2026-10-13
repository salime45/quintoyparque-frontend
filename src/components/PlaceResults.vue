<script setup>
import { safeLabel, coords } from "../lib/places.js";
defineProps({ venues: Array, radius: Number, verifiedOnly: Boolean });
defineEmits(["show", "review"]);
function location(place) {
  const { lat, lon } = coords(place);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}
</script>
<template>
  <h2 id="heading" style="font-size: 1.1rem">
    {{ verifiedOnly ? "Locales verificados" : "Locales" }} junto a parques ({{
      venues.length
    }}) · {{ radius }} m o dentro del parque
  </h2>
  <section id="results" aria-label="Sitios encontrados">
    <article v-for="place in venues.slice(0, 35)" :key="place.id">
      <h3>{{ safeLabel(place) }}</h3>
      <span v-if="place.reviewed" class="venue-reviewed-tag"
        >✓ Con reseñas</span
      >
      <p>
        {{
          place.inSamePark
            ? `Dentro del ${place.urbanParkName} · Zona infantil a ${place.dist} m · Visibilidad sin comprobar`
            : `${place.dist} metros de la zona infantil · Visibilidad sin comprobar`
        }}
      </p>
      <div class="actions">
        <button class="secondary" @click="$emit('show', place)">
          Ver en mapa</button
        ><button class="secondary" @click="$emit('review', place)">
          Dejar reseña</button
        ><a :href="location(place)" target="_blank" rel="noopener noreferrer"
          >Abrir ubicación</a
        >
      </div>
    </article>
    <p v-if="!venues.length">
      {{
        verifiedOnly
          ? "No hay locales con reseñas en esta zona. Amplía la búsqueda o quita el filtro."
          : "No se han encontrado establecimientos próximos. Prueba en otra zona."
      }}
    </p>
  </section>
</template>
