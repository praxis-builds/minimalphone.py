// Regression: the rollover dialog must never ask about the unit that is being logged.
// Run with: node tests/rollover.cjs
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

function boot(nowLocal, days) {
  const RealDate = Date, now = nowLocal.getTime();
  class MockDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { id, value: "", textContent: "", hidden: false, open: false, dataset: {}, showModal() { this.open = true; } });
    return elements.get(id);
  };
  const context = vm.createContext({
    console, Date: MockDate, Map, Set, URL, crypto: require("node:crypto").webcrypto, setTimeout, clearTimeout,
    document: { addEventListener() {}, getElementById: element, querySelector: () => ({ classList: { toggle() {}, remove() {} } }) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, scrollTo() {},
  });
  vm.runInContext(readFileSync("logic.js", "utf8"), context);
  vm.runInContext(readFileSync("script.js", "utf8"), context);
  context.__days = days;
  vm.runInContext(`renderAll=()=>{};renderToday=()=>{};showToast=()=>{};config=defaultConfig();config.identityMigrated=true;fallback=true;days=__days.map(sanitizeDay);`, context);
  return { context, dialog: element("rollover-dialog"), message: element("rollover-message") };
}
const day = (date, statuses, extra = {}) => ({
  date,
  priorities: statuses.map((status, i) => ({ id: `p-${date}-${i}`, text: `Task ${i} ${date}`, status, order: i })),
  planned: [], moves: [], conclusion: "", ...extra,
});

(async () => {
  // Monday 16 Nov 2026: the Weekend (Nov 14) is being logged and is only half done.
  const fri = day("2026-11-13", ["done", "pending"]);
  const weekend = day("2026-11-14", ["done", "pending"], { weekend: true });
  let t = boot(new Date(2026, 10, 16, 9), [fri, weekend]);
  await vm.runInContext("ensureToday()", t.context);
  assert.equal(t.dialog.open, true, "Friday (already logged, before the Weekend) may be asked about");
  assert.equal(t.dialog.dataset.from, "2026-11-13", "the dialog must not target the Weekend being logged");

  // Same Monday, Friday already resolved: no dialog at all, even though the Weekend has unfinished items.
  t = boot(new Date(2026, 10, 16, 9), [{ ...fri, rolloverResolved: "archive" }, weekend]);
  await vm.runInContext("ensureToday()", t.context);
  assert.equal(t.dialog.open, false, "no dialog for the unit that is still being logged");

  // Tuesday: the Weekend is no longer being logged (Monday is), so now it can be asked about.
  t = boot(new Date(2026, 10, 17, 9), [{ ...fri, rolloverResolved: "archive" }, weekend, day("2026-11-16", ["pending"])]);
  await vm.runInContext("ensureToday()", t.context);
  assert.equal(t.dialog.open, true);
  assert.equal(t.dialog.dataset.from, "2026-11-14");
  assert.match(t.message.textContent, /the Weekend of Nov 14, 2026 – Nov 15, 2026/);

  console.log("Rollover regression checks passed: never targets the unit being logged; Weekend named correctly.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
