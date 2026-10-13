import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";

export function useMobileMenu() {
  const mobile = ref(false),
    opened = ref(false);
  const active = computed(() => mobile.value && opened.value);
  let media,
    focusSequence = 0;
  async function setOpen(value) {
    const request = ++focusSequence;
    const panel = document.getElementById("exploreMenu");
    const hadFocus = panel?.contains(document.activeElement);
    opened.value = mobile.value && value;
    await nextTick();
    if (request !== focusSequence) return;
    if (active.value) {
      // Esperar a que el navegador aplique la visibilidad del panel animado.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      if (active.value && request === focusSequence)
        document.getElementById("menuClose")?.focus({ preventScroll: true });
    } else if (mobile.value && hadFocus)
      document.getElementById("menuToggle")?.focus();
    else if (!mobile.value && document.activeElement?.id === "menuClose")
      document.getElementById("reload")?.focus();
  }
  function change() {
    mobile.value = media.matches;
    void setOpen(false);
  }
  function keydown(event) {
    if (!active.value || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void setOpen(false);
    } else if (event.key === "Tab") {
      const focusable = [
        ...document
          .getElementById("exploreMenu")
          .querySelectorAll(
            "button, a[href], input, select, textarea, [tabindex]",
          ),
      ].filter(
        (element) =>
          !element.disabled &&
          element.tabIndex >= 0 &&
          element.getClientRects().length,
      );
      focusable.push(document.getElementById("menuToggle"));
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  onMounted(() => {
    media = matchMedia("(max-width: 760px)");
    change();
    if (media.addEventListener) media.addEventListener("change", change);
    else media.addListener(change);
    document.addEventListener("keydown", keydown);
  });
  onUnmounted(() => {
    focusSequence++;
    if (media?.removeEventListener) media.removeEventListener("change", change);
    else media?.removeListener(change);
    document.removeEventListener("keydown", keydown);
  });
  return { mobile, active, setOpen };
}
