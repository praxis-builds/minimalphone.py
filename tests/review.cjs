// App-level check for the weekly review: it appears when the Weekend is being
// logged, saves under the week's Monday, survives sanitising and backups, and
// History lists it. Run: node tests/review.cjs
const assert = require("node:assert/strict");
const { boot, get, vm } = require("./harness.cjs");

const sat = "2026-11-14", mon = "2026-11-09";
const weekend = { date: sat, priorities: [{ id: "p1", text: "Laundry", status: "done", order: 0 }], planned: [], moves: [], focusSessions: [], conclusion: "", weekend: true };
const friday = { ...weekend, date: "2026-11-13", weekend: false, priorities: [{ id: "p2", text: "Report", status: "pending", order: 0 }], loggedAt: 1 };

(async () => {
  // Monday 16 Nov: the default log unit is the Weekend, so the review shows.
  const c = boot(new Date(2026, 10, 16, 9), ({ days }) => days.push(weekend, friday));
  vm.runInContext("activeDate=defaultLogUnit();editable=true;renderWeekReview()", c);
  assert.equal(c.__el("review-section").hidden, false);
  assert.equal(c.__el("review-title").textContent, "Last week");
  assert.equal(c.__el("review-score").textContent, "50% · 2 of 6 logged");

  // Typing saves under the week's Monday (blank answers are allowed).
  c.__el("review-worked").value = "  Early starts  ";
  c.__el("review-change").value = "";
  vm.runInContext("queueReview()", c);
  assert.deepEqual(get(c, `config.reviews`), { [mon]: { worked: "Early starts", change: "" } });
  // Clearing both answers removes the week.
  c.__el("review-worked").value = "";
  vm.runInContext("queueReview()", c);
  assert.deepEqual(get(c, `config.reviews`), {});

  // A weekday, or today, never shows the review.
  vm.runInContext("activeDate='2026-11-13';renderWeekReview()", c);
  assert.equal(c.__el("review-section").hidden, true);
  vm.runInContext("activeDate=todayKey();renderWeekReview()", c);
  assert.equal(c.__el("review-section").hidden, true);

  // Read-only past Weekend: shown but not editable.
  vm.runInContext("activeDate='2026-11-07';editable=false;renderWeekReview()", c);
  assert.equal(c.__el("review-section").hidden, false);
  assert.equal(c.__el("review-worked").disabled, true);
  assert.match(c.__el("review-title").textContent, /^Week of /);

  // Sanitising keeps good weeks and drops bad keys and empty answers.
  const clean = get(c, `sanitizeReviews({"${mon}":{worked:"a",change:"b"},"2026-11-10":{worked:"not a Monday"},"2026-11-02":{worked:"",change:""},"x":{worked:"y"}})`);
  assert.deepEqual(clean, { [mon]: { worked: "a", change: "b" } });

  // A backup merge adds weeks this phone does not have and keeps its own.
  vm.runInContext(`config.reviews={"${mon}":{worked:"mine",change:""}}`, c);
  const merged = get(c, `mergeBackupIntoCurrent({items:[],moves:[],reviews:{"${mon}":{worked:"theirs",change:""},"2026-11-02":{worked:"older",change:""}}},[]).config.reviews`);
  assert.deepEqual(merged, { [mon]: { worked: "mine", change: "" }, "2026-11-02": { worked: "older", change: "" } });

  // History lists the year's reviews, newest first, each opening its Weekend.
  vm.runInContext(`config.reviews={"2026-11-02":{worked:"older",change:""},"${mon}":{worked:"Early starts",change:"Fewer meetings"}};renderReviewList(__el("history-reviews"),"2026")`, c);
  const list = c.__el("history-reviews").children;
  assert.equal(list.length, 2);
  assert.equal(list[0].dataset.date, sat);
  assert.equal(list[1].dataset.date, "2026-11-07");
  console.log("Weekly review checks passed: when it shows, saving, sanitising, backup merge, History list.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
