import test from "node:test";
import assert from "node:assert/strict";
import { venuePhoto } from "../src/lib/venue-photo.js";

test("Resuelve archivos Commons y conserva el enlace a su autoría y licencia", () => {
  const photo = venuePhoto({ tags: { wikimedia_commons: "File:Café local.jpg" } });
  assert.equal(photo.src, "https://commons.wikimedia.org/wiki/Special:FilePath/Caf%C3%A9%20local.jpg?width=640");
  assert.equal(photo.source, "https://commons.wikimedia.org/wiki/File:Caf%C3%A9%20local.jpg");
  assert.deepEqual(venuePhoto({ tags: { image: photo.source } }), photo);
});

test("Admite fotos HTTPS y usa image si Commons contiene una categoría", () => {
  const image = "https://example.org/local.jpg?size=640";
  assert.equal(venuePhoto({ tags: { wikimedia_commons: "Category:Locales", image } }).src, image);
});

test("Omite referencias vacías, páginas web y protocolos inseguros", () => {
  for (const image of [undefined, "", "javascript:alert(1)", "data:image/png;base64,abc", "http://example.org/a.jpg", "https://example.org/local", "https://user:pass@example.org/a.jpg", "File:Local.pdf"]) {
    assert.equal(venuePhoto({ tags: { image } }), null);
  }
  assert.equal(venuePhoto({}), null);
});
