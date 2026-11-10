// App-level check: a new day starts with the permanent priorities, then the
// Plan Tomorrow items; a retired one stops on new days. Run: node tests/permanent.cjs
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

// Results cross the sandbox boundary as JSON, so arrays compare by value.
const get = (c, expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, c));

function boot(nowLocal, setup) {
  const RealDate = Date, now = nowLocal.getTime();
  class MockDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const elements = new Map();
  const element = (id) => { if (!elements.has(id)) elements.set(id, { id, value: "", textContent: "", hidden: false, dataset: {}, showModal() {} }); return elements.get(id); };
  const context = vm.createContext({
    console, Date: MockDate, Map, Set, URL, crypto: require("node:crypto").webcrypto, setTimeout, clearTimeout,
    document: { addEventListener() {}, getElementById: element, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, scrollTo() {},
  });
  vm.runInContext(readFileSync("logic.js", "utf8"), context);
  vm.runInContext(readFileSync("script.js", "utf8"), context);
  context.__setup = setup;
  vm.runInContext(`renderAll=()=>{};renderToday=()=>{};showToast=()=>{};config=defaultConfig();config.identityMigrated=true;fallback=true;__setup({config,days,sanitizeConfig,sanitizeDay});config=sanitizeConfig(config);`, context);
  return context;
}

(async () => {
  const permanent = [
    { id: "perm-plan", text: "Plan the day", order: 0, activeFrom: "2026-11-01", retiredOn: null },
    { id: "perm-stretch", text: "Stretch", order: 1, activeFrom: "2026-11-01", retiredOn: "2026-11-17" },
  ];
  // Monday 16 Nov: Friday planned "Book flights" for the next day.
  let c = boot(new Date(2026, 10, 16, 8), ({ config, days }) => {
    config.permanent = permanent;
    days.push({ date: "2026-11-14", priorities: [], planned: [{ id: "p-flights", text: "Book flights", status: "pending", order: 0 }], moves: [], focusSessions: [], conclusion: "", weekend: true });
  });
  await vm.runInContext("ensureToday()", c);
  assert.deepEqual(get(c, "getDay('2026-11-16').priorities.map(p=>p.text)"), ["Plan the day", "Stretch", "Book flights"]);

  // Tuesday 17 Nov: "Stretch" was retired from the 17th, so the new day leaves it out…
  c = boot(new Date(2026, 10, 17, 8), ({ config }) => { config.permanent = permanent; });
  await vm.runInContext("ensureToday()", c);
  assert.deepEqual(get(c, "getDay('2026-11-17').priorities.map(p=>p.text)"), ["Plan the day"]);
  // …but filling in an earlier day still shows what applied then.
  assert.deepEqual(get(c, "blankDay('2026-11-05').priorities.map(p=>p.text)"), ["Plan the day", "Stretch"]);
  // Before the list existed, a filled-in day starts empty.
  assert.deepEqual(get(c, "blankDay('2026-10-20').priorities.length"), 0);

  // The setting survives sanitising (it is whitelisted) and keeps its fields.
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(sanitizeConfig({...config}).permanent)", c)), permanent);
  console.log("Permanent priority checks passed: new days, retirement, filled-in days, sanitising.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
