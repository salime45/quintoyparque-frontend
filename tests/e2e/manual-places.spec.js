import { test, expect } from "@playwright/test";

test.skip(process.env.MANUAL_PLACES_E2E !== "1", "Requiere los datos ficticios y la compilación de test:manual-places");

test("El alta manual aparece en el buscador y abre su ficha sin marca de reseñas", async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  if (await page.locator("#menuToggle").isVisible()) await page.locator("#menuToggle").click();
  await page.locator("#placeSearch").fill("cafe manual");
  const result = page.locator("#placeSearchResults button").filter({ hasText: "Café manual de prueba" });
  await expect(result).toHaveCount(1);
  await result.click();
  // Leaflet conserva brevemente las fichas anteriores durante sus transiciones.
  const popup = page.locator(".leaflet-popup-content").filter({ hasText: "Café manual de prueba" }).last();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Visibilidad y terraza sin verificar");
  const marker = page.locator('.leaflet-marker-icon[title="Café manual de prueba"]');
  await expect(marker).toBeVisible();
  await expect(marker.locator(".qyp-map-marker__check")).toHaveCount(0);
});
