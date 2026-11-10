"use strict";

// Run with: node --test tests/logic.test.js
const { test, describe, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

// Local-time dates (the app works in the device's local time zone).
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h);
const day = (date, statuses, extra = {}) => ({
  date,
  priorities: [],
  planned: [],
  moves: statuses.map((status, i) => ({ id: `move-${i}`, label: `Move ${i}`, status, enabled: true, order: i })),
  focusSessions: [],
  conclusion: "",
  ...extra,
});

describe("default day (system clock mocked)", () => {
  beforeEach(() => mock.timers.enable({ apis: ["Date"] }));
  afterEach(() => mock.timers.reset());

  const cases = [
    ["Monday opens on the Weekend, not Sunday", at(2026, 11, 9), "2026-11-07"],
    ["Tuesday opens on Monday", at(2026, 11, 10), "2026-11-09"],
    ["Wednesday opens on Tuesday", at(2026, 11, 11), "2026-11-10"],
    ["Saturday opens on Friday", at(2026, 11, 14), "2026-11-13"],
    ["Sunday still opens on Friday (Weekend not over)", at(2026, 11, 15), "2026-11-13"],
    ["Monday just after midnight opens on the Weekend", at(2026, 11, 16, 0), "2026-11-14"],
    ["Monday after a month-end weekend", at(2026, 6, 1), "2026-05-30"],
  ];
  for (const [name, now, expected] of cases) {
    test(name, () => {
      mock.timers.setTime(now.getTime());
      assert.equal(L.defaultLogUnit(), expected);
    });
  }

  test("current unit is today, or Saturday's key across the weekend", () => {
    mock.timers.setTime(at(2026, 11, 10).getTime());
    assert.equal(L.currentUnit(), "2026-11-10");
    mock.timers.setTime(at(2026, 11, 15).getTime());
    assert.equal(L.currentUnit(), "2026-11-14");
  });
});

describe("today is locked", () => {
  const tuesday = at(2026, 11, 10, 23);
  test("today and future days cannot be logged", () => {
    assert.equal(L.canLogUnit("2026-11-10", tuesday), false);
    assert.equal(L.canLogUnit("2026-11-11", tuesday), false);
    assert.equal(L.canLogUnit("2027-01-01", tuesday), false);
  });
  test("yesterday and earlier unlogged days can be logged", () => {
    assert.equal(L.canLogUnit("2026-11-09", tuesday), true);
    assert.equal(L.canLogUnit("2026-10-01", tuesday), true);
  });
  test("the Weekend stays locked all of Saturday and Sunday and opens on Monday", () => {
    assert.equal(L.canLogUnit("2026-11-14", at(2026, 11, 14)), false);
    assert.equal(L.canLogUnit("2026-11-14", at(2026, 11, 15, 23)), false);
    assert.equal(L.canLogUnit("2026-11-14", at(2026, 11, 16, 0)), true);
    assert.equal(L.canLogUnit("2026-11-15", at(2026, 11, 16, 0)), true, "Sunday resolves to the Weekend");
  });
  test("an untouched record is not logged; any resolved item or note logs it", () => {
    assert.equal(L.isLogged(undefined), false);
    assert.equal(L.isLogged(day("2026-11-09", ["pending"])), false);
    assert.equal(L.isLogged(day("2026-11-09", ["skipped"])), true);
    assert.equal(L.isLogged(day("2026-11-09", ["pending"], { conclusion: "Quiet day" })), true);
    assert.equal(L.isLogged(day("2026-11-09", ["pending"], { loggedAt: 1 })), true);
  });
  test("not logged is different from missed", () => {
    assert.equal(L.unitState(undefined), "notlogged");
    assert.equal(L.unitState(day("2026-11-09", ["pending"])), "notlogged");
    assert.equal(L.unitState(day("2026-11-09", ["skipped", "skipped"])), "missed");
    assert.equal(L.unitState(day("2026-11-09", ["done", "skipped"])), "scored");
  });
});

describe("weekend merge", () => {
  const sat = {
    date: "2026-11-07",
    priorities: [
      { id: "p1", text: "Groceries", status: "pending", order: 0 },
      { id: "p3", text: "Read", status: "done", order: 1 },
    ],
    planned: [{ id: "p9", text: "Laundry", status: "pending", order: 0 }],
    moves: [
      { id: "walk", label: "Walk", status: "pending", enabled: true, order: 0 },
      { id: "water", label: "Water", status: "done", enabled: true, order: 1 },
    ],
    focusSessions: [{ id: "f1", plannedDuration: 1500 }],
    conclusion: "Lazy Saturday",
  };
  const sun = {
    date: "2026-11-08",
    priorities: [{ id: "p1", text: "Groceries", status: "done", order: 0 }],
    planned: [{ id: "p2", text: "Call bank", status: "pending", order: 0 }],
    moves: [
      { id: "walk", label: "Walk", status: "skipped", enabled: true, order: 0 },
      { id: "water", label: "Water", status: "pending", enabled: true, order: 1 },
    ],
    focusSessions: [{ id: "f2", plannedDuration: 3000 }],
    conclusion: "Got groceries",
  };

  test("an item is done if it was done on either day", () => {
    const m = L.mergeWeekendPair(sat, sun);
    assert.equal(m.date, "2026-11-07");
    assert.equal(m.weekend, true);
    const status = Object.fromEntries([...m.priorities, ...m.moves].map((i) => [i.id, i.status]));
    assert.deepEqual(status, { p1: "done", p3: "done", walk: "skipped", water: "done" });
  });
  test("both notes are kept", () => {
    assert.equal(L.mergeWeekendPair(sat, sun).conclusion, "Sat: Lazy Saturday\nSun: Got groceries");
    assert.equal(L.mergeWeekendPair({ ...sat, conclusion: "" }, sun).conclusion, "Got groceries");
    assert.equal(L.mergeWeekendPair(sat, { ...sun, conclusion: "" }).conclusion, "Lazy Saturday");
  });
  test("plans and focus sessions from both days survive, Sunday's plan first", () => {
    const m = L.mergeWeekendPair(sat, sun);
    assert.deepEqual(m.planned.map((p) => p.text), ["Call bank", "Laundry"]);
    assert.deepEqual(m.focusSessions.map((f) => f.id), ["f1", "f2"]);
  });
  test("a lone Sunday becomes the Weekend record under Saturday's date", () => {
    const r = L.migrateWeekends([sun]);
    assert.deepEqual(r.days.map((d) => d.date), ["2026-11-07"]);
    assert.equal(r.days[0].weekend, true);
    assert.equal(r.days[0].conclusion, "Got groceries");
  });
  test("migration leaves weekdays alone and removes Sunday records", () => {
    const fri = day("2026-11-06", ["done"]);
    const r = L.migrateWeekends([fri, sat, sun]);
    assert.equal(r.changed, true);
    assert.deepEqual(r.removed, ["2026-11-08"]);
    assert.deepEqual(r.days.map((d) => d.date), ["2026-11-06", "2026-11-07"]);
    assert.equal(r.days[0], fri, "weekday record is untouched");
  });
  test("running the migration again changes nothing", () => {
    const once = L.migrateWeekends([day("2026-11-06", ["done"]), sat, sun]).days;
    const twice = L.migrateWeekends(once);
    assert.equal(twice.changed, false);
    assert.deepEqual(twice.days, once);
  });
  test("merging the same Sunday into an already-merged Weekend does not duplicate", () => {
    const merged = L.mergeWeekendPair(sat, sun);
    const again = L.mergeWeekendPair(merged, sun);
    assert.equal(again.conclusion, merged.conclusion);
    assert.equal(again.priorities.length, merged.priorities.length);
    assert.equal(again.focusSessions.length, merged.focusSessions.length);
  });
});

describe("percentages: units, today excluded", () => {
  test("a normal week is 6 units: Monday to Friday plus the Weekend", () => {
    assert.deepEqual(L.weekUnits("2026-11-11"), [
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    assert.equal(L.weekUnits("2026-11-15").length, 6, "Sunday belongs to the same week");
  });
  test("a weekend belongs to the month that holds its Saturday", () => {
    // Nov 2026 starts on a Sunday: the Oct 31 Weekend counts in October.
    const nov = L.unitsBetween("2026-11-01", "2026-11-30");
    assert.equal(nov[0], "2026-11-02");
    assert.equal(nov.length, 21 + 4);
    assert.ok(L.unitsBetween("2026-10-01", "2026-10-31").includes("2026-10-31"));
  });
  test("today is not counted, even if it already has a record", () => {
    const now = at(2026, 11, 11); // Wednesday
    const days = [
      day("2026-11-09", ["done", "done"]), // Mon 100%
      day("2026-11-10", ["done", "skipped"]), // Tue 50%
      day("2026-11-11", ["skipped", "skipped"]), // today (would be 0%)
    ];
    const s = L.summarizeUnits(days, "2026-11-09", "2026-11-14", now);
    assert.equal(s.units, 2);
    assert.equal(s.logged, 2);
    assert.equal(s.average, 75);
    assert.equal(s.missed, 0);
    assert.deepEqual(s.keys, ["2026-11-09", "2026-11-10"]);
  });
  test("the Weekend counts once, with both days merged into it", () => {
    const now = at(2026, 11, 16); // the Monday after
    const merged = L.migrateWeekends([
      day("2026-11-13", ["done", "done"]), // Fri 100%
      day("2026-11-14", ["done", "pending"]), // Sat
      day("2026-11-15", ["pending", "done"]), // Sun -> Weekend 100%
    ]).days;
    const s = L.summarizeUnits(merged, "2026-11-09", "2026-11-15", now);
    assert.equal(s.units, 6);
    assert.equal(s.logged, 2);
    assert.equal(s.notLogged, 4);
    assert.equal(s.average, 100);
  });
  test("not-logged units are counted but kept out of the average; 0% logged units are missed", () => {
    const now = at(2026, 11, 16);
    const days = [
      day("2026-11-09", ["done", "done"]), // 100
      day("2026-11-10", ["skipped", "skipped"]), // 0, missed
      day("2026-11-11", ["pending", "pending"]), // record, never logged
      // Thu, Fri, Weekend: no records
    ];
    const s = L.summarizeUnits(days, "2026-11-09", "2026-11-15", now);
    assert.deepEqual(
      { units: s.units, logged: s.logged, notLogged: s.notLogged, missed: s.missed, average: s.average, reached: s.reached },
      { units: 6, logged: 2, notLogged: 4, missed: 1, average: 50, reached: 1 },
    );
  });
  test("streaks walk across the Weekend and ignore today", () => {
    const now = at(2026, 11, 17); // Tuesday
    const days = [
      day("2026-11-13", ["done"]), // Fri
      day("2026-11-14", ["done"]), // Weekend
      day("2026-11-16", ["done"]), // Mon
      day("2026-11-17", ["pending"]), // today
    ];
    assert.deepEqual(L.unitStreaks(days, now), { current: 3, longest: 3 });
  });
  test("an unlogged yesterday does not break the current streak", () => {
    const now = at(2026, 11, 12); // Thursday; Wednesday not logged yet
    const days = [day("2026-11-09", ["done"]), day("2026-11-10", ["done"])];
    assert.equal(L.unitStreaks(days, now).current, 2);
  });
});

describe("permanent priorities", () => {
  const permanents = [
    { id: "perm-plan", text: "Plan the day", order: 0, activeFrom: "2026-11-01", retiredOn: null },
    { id: "perm-inbox", text: "Inbox zero", order: 1, activeFrom: "2026-11-10", retiredOn: null },
    { id: "perm-old", text: "Stretch", order: 2, activeFrom: "2026-10-01", retiredOn: "2026-11-12" },
  ];
  test("a new day starts with the permanent priorities active on that date, in order", () => {
    const day = L.composeNewDayPriorities(permanents, [], "2026-11-11");
    assert.deepEqual(day.map((p) => p.text), ["Plan the day", "Inbox zero", "Stretch"]);
    assert.ok(day.every((p) => p.status === "pending"));
    assert.deepEqual(day.map((p) => p.order), [0, 1, 2]);
  });
  test("a retired priority stops on new days from its retire date; earlier days keep it", () => {
    assert.deepEqual(L.activePermanentsOn(permanents, "2026-11-11").map((p) => p.id), ["perm-plan", "perm-inbox", "perm-old"]);
    assert.deepEqual(L.activePermanentsOn(permanents, "2026-11-12").map((p) => p.id), ["perm-plan", "perm-inbox"]);
  });
  test("one added later does not appear on days before it started", () => {
    assert.deepEqual(L.activePermanentsOn(permanents, "2026-11-05").map((p) => p.id), ["perm-plan", "perm-old"]);
  });
  test("Plan Tomorrow extras still carry over, after the permanent ones", () => {
    const day = L.composeNewDayPriorities(permanents, [{ id: "p-flights", text: "Book flights" }], "2026-11-16");
    assert.deepEqual(day.map((p) => p.text), ["Plan the day", "Inbox zero", "Book flights"]);
  });
  test("a planned item that repeats a permanent one appears once", () => {
    const day = L.composeNewDayPriorities(permanents, [{ id: "other", text: "plan the day " }, { id: "perm-inbox", text: "Inbox zero" }], "2026-11-16");
    assert.deepEqual(day.map((p) => p.id), ["perm-plan", "perm-inbox"]);
  });
  test("the day still holds at most 10 priorities, permanent ones first", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, text: `Planned ${i}` }));
    const day = L.composeNewDayPriorities(permanents, many, "2026-11-16");
    assert.equal(day.length, 10);
    assert.deepEqual(day.slice(0, 2).map((p) => p.id), ["perm-plan", "perm-inbox"]);
  });
});
