// App-level check for the Year in review page: its numbers, its weekly
// reviews, the History link (highlighted in December only) and navigation.
// Run: node tests/year-review.cjs
const assert = require("node:assert/strict");
const { boot, get, vm } = require("./harness.cjs");

const day = (date, done, total = 4) => ({ date, planned: [], moves: [], focusSessions: [], conclusion: "", weekend: date === "2026-11-14", loggedAt: 1,
  priorities: Array.from({ length: total }, (_, i) => ({ id: `p${i}`, text: `P${i}`, status: i < done ? "done" : "pending", order: i })) });
const seed = ({ config, days }) => {
  days.push(day("2026-10-05", 4), day("2026-10-06", 2), day("2026-11-09", 4), day("2026-11-10", 4), day("2026-11-14", 3));
  config.reviews = { "2026-11-09": { worked: "Early starts", change: "Fewer meetings" }, "2025-12-29": { worked: "Old year", change: "" } };
  config.yearTarget = 80;
};
const tiles = (c) => c.__el("yr-tiles").children.map((t) => [t.children[0].textContent, t.children[1].textContent]);

(async () => {
  // In November the page is available but the link is quiet.
  let c = boot(new Date(2026, 10, 20, 9), seed);
  c.__el("history-year").value = "2026";
  vm.runInContext(`renderYearReviewLink("2026")`, c);
  assert.equal(c.__el("open-year-review").classList.contains("highlight"), false);
  assert.equal(c.__el("year-review-link-text").textContent, "2026 in review");

  const r = get(c, "renderYearReview()");
  assert.equal(r.average, 85); // 100, 50, 100, 100, 75
  assert.equal(c.__el("yr-average").textContent, "85%");
  assert.deepEqual(tiles(c), [["November", "best month · 92%"], ["2", "longest streak at 80%+"], [String(r.logged), `of ${r.units} days logged`], ["3", "days at 80% or more"]]);
  assert.equal(c.__el("yr-sofar").hidden, false); // the year is still running
  assert.equal(c.__el("yr-target").className, "year-target ontrack");
  // Only this year's weekly reviews, each opening its Weekend.
  assert.equal(c.__el("yr-reviews").children.length, 1);
  assert.equal(c.__el("yr-reviews").children[0].dataset.date, "2026-11-14");
  assert.equal(c.__el("yr-reviews-count").textContent, "1 week");
  assert.equal(c.__el("yr-reviews-empty").hidden, true);

  // In December the link is highlighted, for the current year only.
  c = boot(new Date(2026, 11, 3, 9), seed);
  vm.runInContext(`renderYearReviewLink("2026")`, c);
  assert.equal(c.__el("open-year-review").classList.contains("highlight"), true);
  assert.equal(c.__el("year-review-link-text").textContent, "Your 2026 in review is ready");
  vm.runInContext(`renderYearReviewLink("2025")`, c);
  assert.equal(c.__el("open-year-review").classList.contains("highlight"), false);

  // A past year: finished, no "so far" note, its own reviews.
  c = boot(new Date(2027, 1, 3, 9), seed);
  c.__el("history-year").value = "2026";
  const past = get(c, "renderYearReview()");
  assert.equal(past.finished, true);
  assert.equal(c.__el("yr-sofar").hidden, true);
  assert.equal(c.__el("yr-target").className, "year-target reached");
  c.__el("history-year").value = "2025";
  vm.runInContext("renderYearReview()", c);
  assert.equal(c.__el("yr-reviews").children.length, 1);
  assert.equal(c.__el("yr-average").textContent, "—");
  console.log("Year in review checks passed: numbers, target, weekly reviews, December highlight, past years.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
