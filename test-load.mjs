// Full-module load test: rewrites app.js imports to stubs, then REALLY imports
// the module (node --check is unreliable for ESM per AGENTS.md) to catch
// ReferenceErrors / typos at load time. Run: node test-load.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
let out = src
  .replace(
    `import { db } from './firebase-init.js';`,
    `const db = {};`
  )
  .replace(
    `import { collection, getDocs, addDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";`,
    `const collection = () => ({}); const getDocs = async () => ({ empty: true, forEach(){} });
     const addDoc = async () => ({}); const setDoc = async () => ({}); const doc = () => ({});`
  );
if (out === src || out.includes('gstatic.com')) {
  console.error('FAIL: import stub replacement did not apply');
  process.exit(1);
}
mkdirSync('/tmp/headsup-test', { recursive: true });
writeFileSync('/tmp/headsup-test/app.test.mjs', out);

// ---- DOM/browser stubs ----
function makeEl() {
  const el = {
    _listeners: {},
    addEventListener(t, f) { (this._listeners[t] ||= []).push(f); },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    options: [],
    value: '',
    textContent: '',
    disabled: false,
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    appendChild(c) { return c; },
    insertBefore(c) { return c; },
  };
  return new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      return undefined; // unknown props -> undefined (like a bare stub)
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const els = {};
globalThis.document = {
  querySelectorAll: () => [],
  getElementById: (id) => (els[id] ||= makeEl()),
  createElement: () => makeEl(),
};
globalThis.window = {
  addEventListener() {},
  innerWidth: 800,
  innerHeight: 400,
  orientation: 90,
};
globalThis.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] ?? null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
globalThis.Audio = class { constructor() {} play() { return Promise.resolve(); } };
globalThis.screen = { orientation: { angle: 90 } };

try {
  await import('/tmp/headsup-test/app.test.mjs');
  console.log('ok   - app.js module loads with zero ReferenceErrors');
} catch (e) {
  console.error('FAIL - app.js threw at import time:');
  console.error(e);
  process.exit(1);
}

// Exercise a few pure paths that run without a DOM: esc() isn't exported,
// but we can at least verify top-level listener wiring didn't throw.
console.log('ALL LOAD TESTS PASSED');
