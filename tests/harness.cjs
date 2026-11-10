// Shared boot for the app-level tests: runs logic.js and script.js in a VM with
// a fake clock and a tiny fake DOM (enough for the render functions under test).
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

// Results cross the sandbox boundary as JSON, so arrays compare by value.
const get = (c, expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, c));

function boot(nowLocal, setup) {
  const RealDate = Date, now = nowLocal.getTime();
  class MockDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const elements = new Map();
  const node = (tag) => {
    const el = { tag, value: "", textContent: "", hidden: false, disabled: false, dataset: {}, children: [], attrs: {}, className: "", style: {},
      showModal() {}, append(...k) { el.children.push(...k); }, replaceChildren(...k) { el.children = [...k]; },
      setAttribute(n, v) { el.attrs[n] = v; }, classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } }, get childElementCount() { return el.children.length; } };
    return el;
  };
  const element = (id) => { if (!elements.has(id)) elements.set(id, Object.assign(node("div"), { id })); return elements.get(id); };
  const context = vm.createContext({
    console, Date: MockDate, Map, Set, URL, crypto: require("node:crypto").webcrypto, setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
    document: { addEventListener() {}, getElementById: element, querySelector: () => null, createElement: node, activeElement: null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, scrollTo() {},
  });
  vm.runInContext(readFileSync("logic.js", "utf8"), context);
  vm.runInContext(readFileSync("script.js", "utf8"), context);
  context.__setup = setup;
  context.__el = element;
  vm.runInContext(`renderAll=()=>{};renderHistory=()=>{};showToast=()=>{};config=defaultConfig();config.identityMigrated=true;fallback=true;__setup({config,days});config=sanitizeConfig(config);`, context);
  return context;
}

module.exports = { boot, get, vm };
