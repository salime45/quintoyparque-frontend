<script setup>
const radius = defineModel("radius", { type: Number });
const onlyParks = defineModel("onlyParks", { type: Boolean });
const onlyCafes = defineModel("onlyCafes", { type: Boolean });
const onlyVerified = defineModel("onlyVerified", { type: Boolean });
</script>
<template>
  <div class="map-legend" aria-label="Leyenda del mapa">
    <span
      ><span class="legend-brand legend-brand--park" aria-hidden="true"
        ><img
          src="/brand/park-marker.svg"
          alt=""
          width="18"
          height="23" /></span
      >Parques con locales próximos</span
    ><span
      ><span class="legend-brand legend-brand--venue" aria-hidden="true"
        ><img
          src="/brand/beer-marker.svg"
          alt=""
          width="18"
          height="23" /></span
      >Cafeterías y bares</span
    ><span
      ><span class="legend-brand legend-brand--verified" aria-hidden="true"
        ><img src="/brand/beer-marker.svg" alt="" width="18" height="23" /><b
          class="legend-brand__check"
          >✓</b
        ></span
      >Verificados (con reseñas)</span
    >
  </div>
  <div class="radius-control">
    <label for="radius"
      >Radio de proximidad (también se incluyen locales dentro del mismo
      parque)</label
    ><select
      id="radius"
      v-model.number="radius"
      aria-label="Distancia máxima entre el parque y el local"
    >
      <option :value="60">60 m · Muy cerca</option>
      <option :value="100">100 m · Cerca</option>
      <option :value="150">150 m · Ampliar búsqueda</option>
    </select>
  </div>
  <div class="controls">
    <label style="font-weight: normal"
      ><input
        id="onlyParks"
        v-model="onlyParks"
        type="checkbox"
        style="width: auto; margin: 0"
      />
      Mostrar parques</label
    ><label style="font-weight: normal"
      ><input
        id="onlyCafes"
        v-model="onlyCafes"
        type="checkbox"
        style="width: auto; margin: 0"
      />
      Mostrar bares y cafés</label
    ><label class="verified-filter"
      ><input id="onlyVerified" v-model="onlyVerified" type="checkbox" /> Solo
      verificados</label
    >
  </div>
</template>
