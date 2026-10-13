import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
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
