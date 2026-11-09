// Regression: offline support must start even when the page's load event fired
// before the app finished starting (it registers at the end of an async init).
// Run with: node tests/service-worker.cjs
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

function boot(readyState) {
  const registered = [], listeners = {};
  const context = vm.createContext({
    console, Date, Map, Set, URL, setTimeout, clearTimeout,
    location: { protocol: "https:", hostname: "minimal-apz.pages.dev" },
    navigator: { serviceWorker: { register: (url) => { registered.push(url); return Promise.resolve(); } } },
    document: { readyState, addEventListener() {}, getElementById: () => ({}) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(readFileSync("logic.js", "utf8"), context);
  vm.runInContext(readFileSync("script.js", "utf8"), context);
  vm.runInContext("registerServiceWorker()", context);
  return { registered, listeners };
}

const late = boot("complete");
assert.deepEqual(late.registered, ["./service-worker.js"], "registers at once when load already fired");

const early = boot("loading");
assert.deepEqual(early.registered, [], "waits for load while the page is still loading");
early.listeners.load();
assert.deepEqual(early.registered, ["./service-worker.js"], "registers on load");

console.log("Service worker regression checks passed: registers whether or not load has fired.");
