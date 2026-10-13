<script setup>
defineProps({ review: Object });
</script>
<template>
  <div class="popup-review-flags">
    <span
      :class="[
        'popup-review-chip',
        review.parkVisible
          ? 'popup-review-chip--positive'
          : 'popup-review-chip--caution',
      ]"
      >{{ review.parkVisible ? "Se ve el parque" : "No se ve el parque" }}</span
    ><span
      :class="[
        'popup-review-chip',
        review.streetCrossing
          ? 'popup-review-chip--caution'
          : 'popup-review-chip--positive',
      ]"
      >{{
        review.streetCrossing ? "Hay que cruzar una calle" : "Sin cruzar calles"
      }}</span
    >
  </div>
</template>
