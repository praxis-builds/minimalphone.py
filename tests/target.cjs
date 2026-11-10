// App-level check for the yearly target: default 80%, saved and clamped from
// Settings, kept by sanitising, and History compares the year with it.
// Run: node tests/target.cjs
const assert = require("node:assert/strict");
const { boot, get, vm } = require("./harness.cjs");

const day = (date, done, total) => ({ date, planned: [], moves: [], focusSessions: [], conclusion: "", weekend: false, loggedAt: 1,
  priorities: Array.from({ length: total }, (_, i) => ({ id: `p${i}`, text: `P${i}`, status: i < done ? "done" : "pending", order: i })) });
const text = (c, id) => {
  const flat = (n) => (typeof n === "string" ? n : (n.textContent || "") + (n.children || []).map(flat).join(""));
  return flat(c.__el(id));
};

(async () => {
  // 16 Nov 2026. Two logged days averaging 70%.
  const c = boot(new Date(2026, 10, 16, 9), ({ days }) => days.push(day("2026-11-10", 3, 5), day("2026-11-11", 4, 5)));
  assert.equal(get(c, "config.yearTarget"), 80);
  assert.equal(get(c, "sanitizeConfig({}).yearTarget"), 80);

  // History: 70% so far is 10 points behind 80%.
  vm.runInContext(`renderYearTarget(__el("year-target"),clipSummary("2026-01-01","2026-12-31").average,"2026")`, c);
  assert.equal(c.__el("year-target").className, "year-target behind");
  assert.match(text(c, "year-target"), /Behind · 10 points below your 80% target so far\./);

  // Settings: lowering the target to 70 puts the year on track.
  c.__el("year-target-input").value = "70";
  await vm.runInContext("saveYearTarget()", c);
  assert.equal(get(c, "config.yearTarget"), 70);
  vm.runInContext(`renderYearTarget(__el("year-target"),70,"2026")`, c);
  assert.match(text(c, "year-target"), /On track · Right at your 70% target so far\./);

  // Out-of-range values are clamped; nonsense keeps the current target.
  c.__el("year-target-input").value = "140";
  await vm.runInContext("saveYearTarget()", c);
  assert.equal(get(c, "config.yearTarget"), 100);
  c.__el("year-target-input").value = "abc";
  await vm.runInContext("saveYearTarget()", c);
  assert.equal(get(c, "config.yearTarget"), 100);
  assert.equal(get(c, "sanitizeConfig({yearTarget:0}).yearTarget"), 1);
  assert.equal(get(c, "sanitizeConfig({yearTarget:'85'}).yearTarget"), 85);

  // A finished year says reached or missed.
  vm.runInContext(`config.yearTarget=80;renderYearTarget(__el("year-target"),77,"2025")`, c);
  assert.match(text(c, "year-target"), /Missed · 3 points short: 2025 averaged 77% against your target of 80%\./);
  vm.runInContext(`renderYearTarget(__el("year-target"),null,"2026")`, c);
  assert.match(text(c, "year-target"), /^Your target is 80%/);
  console.log("Yearly target checks passed: default, save and clamp, sanitising, on track / behind / missed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
