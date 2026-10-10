import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=file("public/index.html");
const css=file("public/brand/theme.css");
const brand=file("public/brand/icon.svg");
const park=file("public/brand/park-marker.svg");
const beer=file("public/brand/beer-marker.svg");

test("Map markers use the existing brand artwork",()=>{
  assert.match(park,/viewBox="282 194 233 452"/);
  assert.match(beer,/viewBox="58 182 245 472"/);
  assert.ok(park.includes(brand.match(/<path fill="#4B4466"[^>]*\/>/)[0]));
  assert.ok(beer.includes(brand.match(/<path fill="#FFCB00"[^>]*\/>/)[0]));
  assert.ok(beer.includes(brand.match(/<path fill="#E2D7B7"[^>]*\/>/)[0]));
});
test("Parks, venues and verified venues use branded Leaflet markers",()=>{
  assert.match(html,/const parkBrandIcon = brandMarkerIcon\("park"\)/);
  assert.match(html,/const venueBrandIcon = brandMarkerIcon\("venue"\)/);
  assert.match(html,/const verifiedBrandIcon = brandMarkerIcon\("venue", true\)/);
  assert.ok(html.includes("L.marker([c.lat,c.lon],{icon:parkBrandIcon"));
  assert.ok(html.includes("L.marker([c.lat,c.lon],{icon:venueBrandIcon"));
  assert.ok(html.includes("L.marker([p.lat,p.lng],{icon:verifiedBrandIcon"));
  assert.equal(html.includes("L.circleMarker("),false);
});
test("Legend assets and the mobile map styles exist",()=>{
  assert.ok(html.includes('class="legend-brand legend-brand--park"'));
  assert.ok(html.includes('class="legend-brand legend-brand--venue"'));
  assert.ok(html.includes('class="legend-brand legend-brand--verified"'));
  assert.ok(css.includes(".qyp-map-marker"));
  assert.ok(css.includes(".qyp-marker-host:focus-visible"));
  assert.ok(css.includes("@media (max-width: 760px)"));
  assert.ok(html.includes("proximity.parkIds.has(item.id)"));
});
