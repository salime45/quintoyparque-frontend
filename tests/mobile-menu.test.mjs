import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/js/mobile-menu.js', import.meta.url), 'utf8');

function setup(legacy = false) {
  const nodes = {};
  let document;
  function element(id) {
    return nodes[id] = {
      id, hidden: false, inert: false, attrs: {}, listeners: {}, tabIndex: 0,
      classList: { toggle() {} },
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(k, v) { this.listeners[k] = v; },
      focus() { document.activeElement = this; },
      contains(x) { return x === nodes.menuClose || x === nodes.reload; },
      querySelectorAll() { return [nodes.menuClose, nodes.reload]; },
      getClientRects() { return [1]; }
    };
  }
  ['exploreMenu', 'menuToggle', 'menuClose', 'menuBackdrop', 'brand', 'toolbar', 'map', 'reload'].forEach(element);
  document = {
    activeElement: null,
    getElementById: id => nodes[id],
    querySelector: selector => selector === 'header .brand' ? nodes.brand : selector === 'header .toolbar' ? nodes.toolbar : null,
    addEventListener(k, v) { this[k] = v; }
  };
  const mobile = { matches: true };
  if (legacy) mobile.addListener = fn => { mobile.change = fn; };
  else mobile.addEventListener = (k, fn) => { mobile.change = fn; };
  vm.runInNewContext(script, { document, matchMedia: () => mobile });
  return { nodes, document, mobile };
}

test('Hamburguesa al extremo derecho y activa antes de cargar Leaflet', () => {
  const header = html.match(/<header>[\s\S]*?<\/header>/)[0];
  assert.ok(header.indexOf('id="menuToggle"') > header.indexOf('id="logout"'));
  assert.match(header, /<\/button><\/header>$/);
  const menuScript = html.match(/<script[^>]*src="\.\/js\/mobile-menu\.js[^"]*"[^>]*><\/script>/)[0];
  assert.ok(!menuScript.includes('defer'));
  assert.ok(html.indexOf(menuScript) < html.indexOf('<script src="https://unpkg.com/leaflet'));
});

test('La misma hamburguesa abre y cierra sin quedar desactivada', () => {
  const { nodes } = setup();
  assert.equal(nodes.exploreMenu.inert, true);
  nodes.menuToggle.listeners.click();
  assert.equal(nodes.menuToggle.attrs['aria-expanded'], 'true');
  assert.equal(nodes.menuToggle.inert, false);
  assert.equal(nodes.toolbar.inert, true);
  assert.equal(nodes.map.inert, true);
  nodes.menuToggle.focus();
  nodes.menuToggle.listeners.click();
  assert.equal(nodes.menuToggle.attrs['aria-expanded'], 'false');
  assert.equal(nodes.toolbar.inert, false);
  assert.equal(nodes.map.inert, false);
});

test('Cerrar con Escape, fondo y selección; restaurar el panel en escritorio', () => {
  const { nodes, document, mobile } = setup(true);
  nodes.menuToggle.listeners.click();
  document.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(document.activeElement, nodes.menuToggle);
  nodes.menuToggle.listeners.click();
  nodes.menuBackdrop.listeners.click();
  assert.equal(nodes.menuBackdrop.hidden, true);
  nodes.menuToggle.listeners.click();
  document['qyp:close-menu']();
  assert.equal(nodes.exploreMenu.inert, true);
  nodes.menuToggle.listeners.click();
  mobile.matches = false;
  mobile.change();
  assert.equal(nodes.exploreMenu.inert, false);
  assert.equal(nodes.toolbar.inert, false);
});
