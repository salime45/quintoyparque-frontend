import { test, expect } from "@playwright/test";
test.skip(process.env.CATALOG_E2E === "geo", "Cubierto por las pruebas con Firestore emulado");
const catalog = {
  schemaVersion: 2,
  generatedAt: "2026-10-01T00:00:00Z",
  coverage: { south: 39.28, north: 39.67, west: -0.62, east: -0.2 },
  elements: [
    {
      id: "way/1",
      lat: 39.4699,
      lon: -0.3763,
      tags: { leisure: "playground", name: "Parque de prueba" },
    },
    {
      id: "node/2",
      lat: 39.4701,
      lon: -0.3763,
      tags: { amenity: "cafe", name: "Café de prueba" },
    },
    {
      id: "node/3",
      lat: 39.4707,
      lon: -0.3763,
      tags: { amenity: "bar", name: "Bar a noventa metros" },
    },
  ],
  parkMatches: [],
};
test.beforeEach(async ({ page }) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/data/osm-places.json", (route) =>
    route.fulfill({ json: catalog }),
  );
});
async function openMenu(page) {
  if (await page.locator("#menuToggle").isVisible())
    await page.locator("#menuToggle").click();
}
test("El mapa avisa si falta zoom y retira el aviso al acercarse", async ({ page }) => {
  await page.goto("/");
  const notice = page.locator(".map-search-notice span");
  await page.locator(".leaflet-control-zoom-out").click();
  await expect(page.locator(".leaflet-map-pane")).toHaveClass(/leaflet-zoom-anim/);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await page.locator(".leaflet-control-zoom-out").click();
  await expect(page.locator(".leaflet-map-pane")).toHaveClass(/leaflet-zoom-anim/);
  await expect(page.locator(".leaflet-map-pane")).not.toHaveClass(/leaflet-zoom-anim/);
  await openMenu(page);
  await page.locator("#reload").click();
  await expect(page.locator("#status")).toContainText("Acerca el mapa");
  if (await page.locator("#menuClose").isVisible())
    await page.locator("#menuClose").click();
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText("Acerca el mapa para buscar parques y locales en esta zona.");
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(notice).toHaveCount(0);
});
test("El icono de ubicación centra el mapa y actualiza la zona", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 40.4168, longitude: -3.7038 } });
        },
      },
    });
  });
  await page.goto("/");
  const button = page.locator("#map").getByRole("button", {
    name: "Centrar en mi ubicación",
  });
  await expect(button).toBeVisible();
  await expect(button).toHaveText("");
  await expect(button.locator("svg")).toBeVisible();
  await button.click();
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("Esta zona todavía no está cubierta");
});
test("El icono de ubicación permite informar de un permiso denegado", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          failure({ code: 1 });
        },
      },
    });
  });
  await page.goto("/");
  const map = page.locator("#map");
  const locationButton = map.getByRole("button", {
    name: "Centrar en mi ubicación",
  });
  await expect(locationButton).toBeVisible();
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("1 locales a 60 m");
  if (testInfo.project.name === "mobile") {
    await expect(page.locator("#menuToggle")).toHaveAttribute("aria-expanded", "true");
    await page.locator("#menuClose").click();
    await expect(page.locator("#menuToggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#exploreMenu")).toBeHidden();
  }
  await expect(map).not.toHaveAttribute("inert");
  await expect(locationButton).toBeVisible();
  await locationButton.click();
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("No se ha podido acceder a tu ubicación");
});
test("El mapa usa el catálogo, cambia el radio y filtra verificados", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("1 locales a 60 m");
  await expect(page.locator("#results article")).toHaveCount(1);
  await page.locator("#radius").selectOption("100");
  await expect(page.locator("#results article")).toHaveCount(2);
  await page.locator("#onlyVerified").check();
  await expect(page.locator("#results article")).toHaveCount(0);
  await page.locator("#onlyVerified").uncheck();
  await expect(page.locator("#results article")).toHaveCount(2);
  expect(errors).toEqual([]);
});
test("La búsqueda por teclado centra el mapa y abre una ficha", async ({
  page,
}) => {
  await page.goto("/");
  await openMenu(page);
  await page.locator("#placeSearch").fill("cafe prueba");
  await expect(page.locator("#placeSearchResults button")).toHaveCount(1);
  await page.locator("#placeSearch").press("ArrowDown");
  await expect(page.locator("#placeSearchResults button")).toBeFocused();
  await page.locator("#placeSearchResults button").press("Enter");
  await expect(page.locator(".venue-popup__title")).toHaveText(
    "Café de prueba",
  );
  await page.locator(".popup-review-btn").click();
  await expect(page.locator("#reviewModal")).toBeVisible();
  await expect(page.locator("#reviewAuthGate")).toBeVisible();
  await page.locator("#reviewClose").click();
  await expect(page.locator("#reviewModal")).not.toBeVisible();
});
test("El menú móvil conserva foco, Escape, fondo y cambio a escritorio", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await page.locator("#menuToggle").click();
  await expect(page.locator("#menuClose")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#menuToggle")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#menuClose")).toBeFocused();
  await expect(page.locator("#map")).toHaveAttribute("inert", "");
  await page.locator("#menuToggle").click();
  await expect(page.locator("#menuToggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator("#menuToggle").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#menuToggle")).toBeFocused();
  await page.locator("#menuToggle").click();
  await page.locator("#menuBackdrop").click({ position: { x: 380, y: 300 } });
  await expect(page.locator("#menuToggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator("#menuToggle").click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#exploreMenu")).not.toHaveAttribute("inert");
});
test("Un fallo del catálogo permite reintentar sin bloquear la interfaz", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/data/osm-places.json", (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 503, body: "No disponible" })
      : route.fulfill({ json: catalog }),
  );
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("No se pudo cargar");
  await page.locator("#reload").click();
  await expect(page.locator("#results article")).toHaveCount(1);
});
