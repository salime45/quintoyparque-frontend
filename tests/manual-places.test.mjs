import test from "node:test";
import assert from "node:assert/strict";
import { planPlace, validatePlace, main } from "../scripts/manual-places.mjs";

const input = { name: "Café Prueba", address: "Calle Ejemplo, 1", lat: 39.47, lng: -0.37, category: "cafe", source: "Visita personal", sourceRef: "Observado el 18/11/2026" };
const park = { id: "node/1", lat: 39.4703, lon: -0.37, tags: { leisure: "playground", name: "Zona infantil" } };

test("Una ficha válida produce un alta separada de OSM con procedencia y parque", () => {
  const plan = planPlace(input, [park], []);
  assert.match(plan.path, /^places\/manual_[a-f0-9]{24}$/);
  assert.equal(plan.data.parkId, park.id);
  assert.equal(plan.data.distanceMeters, 33);
  assert.equal(plan.data.origin, "manual");
  assert.equal(plan.data.sourceRef, input.sourceRef);
  assert.match(plan.data.description, /sin verificar/);
  assert.equal(planPlace({ ...input, name: " CAFE PRUEBA " }, [park], []).path, plan.path);
});

test("Rechaza coordenadas, categorías y campos que permitirían saltarse la validación", () => {
  for (const patch of [{ lat: "39.47" }, { lat: 91 }, { lng: NaN }, { lng: 181 }, { name: "!!!" }, { sourceRef: "" }, { category: "park" }, { status: "published" }, { parkId: "inventado" }]) {
    assert.throws(() => validatePlace({ ...input, ...patch }));
  }
  assert.throws(() => planPlace(input, [], []), /zona infantil/);
  assert.throws(() => planPlace(input, [{ ...park, lat: 40 }], []), /zona infantil/);
});

test("Detecta duplicados manuales y OSM aunque cambien tildes o mayúsculas", () => {
  const osm = { id: "node/2", lat: 39.4701, lon: -0.37, tags: { name: "CAFE PRUEBA", amenity: "cafe" } };
  const manual = { id: "manual_previo", ...input, name: "Otro nombre" };
  assert.deepEqual(planPlace(input, [park, osm], [manual]).duplicates, ["node/2", "manual_previo"]);
  assert.deepEqual(planPlace(input, [park, { ...osm, lat: 40 }], []).duplicates, []);
});

test("El CLI rechaza el proyecto incorrecto antes de consultar Firebase", async () => {
  await assert.rejects(main(["--file=no-existe.json", "--project=otro"]), /project/);
  await assert.rejects(main(["--borrar"]), /desconocido/);
});
