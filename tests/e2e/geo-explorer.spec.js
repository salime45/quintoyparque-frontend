import { test, expect } from "@playwright/test";
test.skip(process.env.CATALOG_E2E !== "geo", "Requiere la compilación geográfica y el emulador");

async function openMenu(page) {
  if (await page.locator("#menuToggle").isVisible()) await page.locator("#menuToggle").click();
}
test.beforeEach(async ({ page }) => {
  // Se permite únicamente el emulador local. Nunca se usa Firebase real.
  await page.route("https://**/*", (route) => route.abort());
});

test("Consulta Firestore sin descargar el catálogo completo y respeta los radios", async ({ page }) => {
  const downloads = [];
  page.on("request", (request) => { if (request.url().includes("osm-places.json")) downloads.push(request.url()); });
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("1 locales a 60 m");
  await page.locator("#radius").selectOption("100");
  await expect(page.locator("#results article")).toHaveCount(2);
  await page.locator("#placeSearch").fill("cafe prueba");
  await expect(page.locator("#placeSearchResults button")).toHaveCount(1);
  await page.locator("#placeSearchResults button").click();
  await expect(page.locator(".venue-popup__title")).toHaveText("Café de prueba");
  expect(downloads).toEqual([]);
});

test("La geolocalización carga otra zona automáticamente y el buscador cambia de zona", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success) { success({ coords: { latitude: 39.55, longitude: -0.3763 } }); },
    } });
  });
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("1 locales a 60 m");
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de otra zona");
  await page.locator("#placeSearch").fill("cafe prueba");
  await expect(page.locator("#placeSearchResults button")).toHaveCount(0);
  await expect(page.locator(".place-search__empty")).toContainText("No encontramos");
});

test("Salir de cobertura retira los resultados anteriores", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success) { success({ coords: { latitude: 48.8566, longitude: 2.3522 } }); },
    } });
  });
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#results article")).toHaveCount(1);
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#status")).toContainText("Esta zona todavía no está cubierta");
  await expect(page.locator("#results article")).toHaveCount(0);
});


test("El enlace de Madrid carga su catálogo y permite buscar un local", async ({ page }) => {
  const downloads = [];
  page.on("request", (request) => { if (/osm-(places|madrid)\.json/.test(request.url())) downloads.push(request.url()); });
  await page.goto("/?zona=madrid");
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de Madrid");
  await page.locator("#placeSearch").fill("cafe madrid");
  await expect(page.locator("#placeSearchResults button")).toHaveCount(1);
  await page.locator("#placeSearchResults button").click();
  await expect(page.locator(".venue-popup__title")).toHaveText("Café de Madrid");
  expect(downloads).toEqual([]);
});

test("La ubicación cambia de Valencia a Getafe y vuelve sin mezclar catálogos", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success) {
        const position = calls++ === 0 ? [40.308, -3.7327] : [39.4699, -0.3763];
        success({ coords: { latitude: position[0], longitude: position[1] } });
      },
    } });
  });
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de prueba");
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de Getafe");
  await expect(page.locator("#results")).not.toContainText("Café de prueba");
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de prueba");
  await expect(page.locator("#results")).not.toContainText("Café de Getafe");
});


test("La ubicación encuentra Barcelona y Canarias sin descargar el país completo", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success) {
        const [latitude, longitude] = calls++ === 0 ? [41.3874, 2.1686] : [28.1235, -15.4363];
        success({ coords: { latitude, longitude } });
      },
    } });
  });
  await page.goto("/");
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de prueba");
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de Barcelona");
  await page.locator("#near").click();
  await openMenu(page);
  await expect(page.locator("#results article")).toContainText("Café de Canarias");
  await expect(page.locator("#results")).not.toContainText("Café de Barcelona");
});
