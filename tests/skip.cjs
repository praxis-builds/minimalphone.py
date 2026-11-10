// App-level check for skip reasons: Skip offers the four one-tap reasons,
// a reason can be left blank or changed, un-skipping clears it, the item line
// shows it, and sanitising keeps only valid reasons. Run: node tests/skip.cjs
const assert = require("node:assert/strict");
const { boot, get, vm } = require("./harness.cjs");

const friday = { date: "2026-11-13", planned: [], focusSessions: [], conclusion: "", weekend: false,
  priorities: [{ id: "p1", text: "Gym", status: "pending", order: 0 }],
  moves: [{ id: "m1", label: "Walk", status: "pending", enabled: true, order: 0 }] };

(async () => {
  // Saturday 14 Nov: Friday is the day being logged.
  const c = boot(new Date(2026, 10, 14, 9), ({ days }) => days.push(structuredClone(friday)));
  vm.runInContext("activeDate=defaultLogUnit();editable=true", c);
  const act = (type, id, action) => vm.runInContext(`runItemAction("${type === "move" ? "moves-list" : "priority-list"}",{dataset:{id:"${id}",type:"${type}"}},"${action}")`, c);
  const item = (id) => get(c, `[...getDay("2026-11-13").priorities,...getDay("2026-11-13").moves].find(x=>x.id==="${id}")`);
  const sheet = () => c.__el("item-menu-actions").children.map((b) => [b.dataset.action, b.textContent]);

  // Skip → the reason sheet opens with the four reasons plus "No reason".
  await act("priority", "p1", "status-skipped");
  assert.equal(item("p1").status, "skipped");
  assert.equal(c.__el("item-menu-title").textContent, "Why was “Gym” skipped?");
  assert.deepEqual(sheet(), [["reason-tired", "Tired"], ["reason-work", "Work"], ["reason-forgot", "Forgot"], ["reason-unimportant", "Didn't matter"], ["reason-none", "No reason"]]);
  assert.equal(c.__el("item-menu").classList.contains("reason-sheet"), true);
  // Leaving it blank is fine: still skipped, no reason.
  assert.equal(item("p1").skipReason, undefined);

  // One tap sets it; the item line shows it; changing it works.
  await act("priority", "p1", "reason-work");
  assert.equal(item("p1").skipReason, "work");
  vm.runInContext(`renderDayItems(__el("priority-list"),getDay("2026-11-13").priorities,"priority",true)`, c);
  const meta = c.__el("priority-list").children[0].children[1].children[1];
  assert.equal(meta.textContent, "Skipped · Work");
  await act("priority", "p1", "reason-tired");
  assert.equal(item("p1").skipReason, "tired");
  await act("priority", "p1", "reason-none");
  assert.equal(item("p1").skipReason, undefined);

  // Small Moves get reasons too; Undo skip, or marking done, clears the reason.
  await act("move", "m1", "status-skipped");
  await act("move", "m1", "reason-forgot");
  assert.equal(item("m1").skipReason, "forgot");
  await act("move", "m1", "status-done");
  assert.deepEqual([item("m1").status, item("m1").skipReason], ["done", undefined]);
  // A reason cannot be put on an item that is not skipped.
  await act("move", "m1", "reason-tired");
  assert.equal(item("m1").skipReason, undefined);

  // Sanitising keeps a valid reason on a skipped item only.
  const clean = get(c, `sanitizeDay({...getDay("2026-11-13"),priorities:[{id:"a",text:"A",status:"skipped",skipReason:"work"},{id:"b",text:"B",status:"skipped",skipReason:"<x>"},{id:"c",text:"C",status:"done",skipReason:"work"}]}).priorities.map(p=>p.skipReason||null)`);
  assert.deepEqual(clean, ["work", null, null]);
  console.log("Skip reason checks passed: the sheet, blank, set, change, clear on undo, item line, sanitising.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
