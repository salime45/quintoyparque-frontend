<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
const props = defineProps({ open: Boolean });
const emit = defineEmits(["close"]);
const dialog = ref(null);
function sync() {
  if (!dialog.value) return;
  if (props.open && !dialog.value.open) dialog.value.showModal();
  else if (!props.open && dialog.value.open) dialog.value.close();
}
watch(() => props.open, sync);
onMounted(sync);
onUnmounted(() => {
  if (dialog.value?.open) dialog.value.close();
});
</script>
<template>
  <dialog ref="dialog" @close="!open || $emit('close')"><slot /></dialog>
</template>
