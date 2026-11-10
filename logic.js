"use strict";

/*
 * Pure date, unit, scoring and weekend-merge logic for Minimal.
 * Loaded by the browser before script.js (as window.MinimalLogic) and by the
 * Node test suite via require(). No DOM or storage access lives here.
 *
 * A "unit" is what gets logged once and counts once in every stat:
 *   - Monday to Friday: one unit each, keyed by its own date.
 *   - Saturday + Sunday: one "Weekend" unit, keyed by Saturday's date.
 * A unit can only be logged after it has fully ended (Weekend opens on Monday).
 */
(function (root) {
  const CONCLUSION_MAX = 500;
  const WEEKEND_CONCLUSION_MAX = 1000;
  const REVIEW_MAX = 300;
  /** One-tap reasons for a skipped item. Optional: a skip can have none. */
  const SKIP_REASONS = { tired: "Tired", work: "Work", forgot: "Forgot", unimportant: "Didn't matter" };

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseDate(k) {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  function shiftDate(k, n) {
    const d = parseDate(k);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }
  function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  function weekday(k) {
    return parseDate(k).getDay();
  }

  /* Unit helpers */
  function isWeekendKey(k) {
    return weekday(k) === 6;
  }
  function unitKey(k) {
    return weekday(k) === 0 ? shiftDate(k, -1) : k;
  }
  function unitEnd(k) {
    const u = unitKey(k);
    return isWeekendKey(u) ? shiftDate(u, 1) : u;
  }
  function nextUnit(k) {
    return unitKey(shiftDate(unitEnd(k), 1));
  }
  function prevUnit(k) {
    return unitKey(shiftDate(unitKey(k), -1));
  }
  /** The unit that contains today. It can be planned but not logged. */
  function currentUnit(now = new Date()) {
    return unitKey(dateKey(now));
  }
  /** The most recent unit that has fully ended: yesterday, or the Weekend on Monday. */
  function defaultLogUnit(now = new Date()) {
    return prevUnit(currentUnit(now));
  }
  /** A unit can be logged once every calendar day in it is in the past. */
  function canLogUnit(k, now = new Date()) {
    return unitEnd(k) < dateKey(now);
  }
  /**
   * Units whose key falls in [start, end]. A Weekend belongs to the period
   * that contains its Saturday, so a range starting on a Sunday skips the
   * Weekend that began the day before.
   */
  function unitsBetween(start, end) {
    const out = [];
    for (let u = unitKey(start) < start ? nextUnit(start) : start; u <= end; u = nextUnit(u)) out.push(u);
    return out;
  }
  /** Monday-start week containing k: 6 units (Mon–Fri + Weekend). */
  function weekUnits(k) {
    const offset = (weekday(k) + 6) % 7;
    return unitsBetween(shiftDate(k, -offset), shiftDate(k, 6 - offset));
  }

  /** Monday of the week that contains k. A weekly review is stored under this date. */
  function weekStart(k) {
    return shiftDate(k, -((weekday(k) + 6) % 7));
  }
  /** Mon–Sun of a week as {start, end}. */
  function weekBounds(k) {
    const start = weekStart(k);
    return { start, end: shiftDate(start, 6) };
  }

  /* Scoring */
  function score(items) {
    const tracked = (items || []).filter((i) => i.enabled !== false),
      total = tracked.length,
      done = tracked.filter((i) => i.status === "done").length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : null };
  }
  function dayScore(day) {
    return score([...(day.priorities || []), ...(day.moves || [])]);
  }
  /** Logged = explicitly logged, or any item resolved, or a conclusion written. */
  function isLogged(day) {
    if (!day) return false;
    if (day.loggedAt) return true;
    if (String(day.conclusion || "").trim()) return true;
    return [...(day.priorities || []), ...(day.moves || []).filter((m) => m.enabled !== false)].some(
      (i) => i.status === "done" || i.status === "skipped",
    );
  }
  /** "notlogged" | "missed" (logged, 0%) | "unmeasured" (logged, no items) | "scored" */
  function unitState(day) {
    if (!isLogged(day)) return "notlogged";
    const s = dayScore(day);
    if (s.percent === null) return "unmeasured";
    return s.percent === 0 ? "missed" : "scored";
  }

  /**
   * Summarise a period. Only units that can be logged count, so today and the
   * future are always excluded. Not-logged units are counted separately and are
   * excluded from the average (they are not "missed").
   */
  function summarizeUnits(days, start, end, now = new Date()) {
    const byKey = new Map(days.map((d) => [d.date, d])),
      result = { units: 0, logged: 0, notLogged: 0, missed: 0, measured: 0, reached: 0, average: null, keys: [] };
    let sum = 0;
    for (const u of unitsBetween(start, end)) {
      if (!canLogUnit(u, now)) continue;
      result.units++;
      result.keys.push(u);
      const day = byKey.get(u),
        state = unitState(day);
      if (state === "notlogged") {
        result.notLogged++;
        continue;
      }
      result.logged++;
      if (state === "missed") result.missed++;
      const s = dayScore(day);
      if (s.percent !== null) {
        result.measured++;
        sum += s.percent;
        if (s.percent >= 80) result.reached++;
      }
    }
    result.average = result.measured ? Math.round(sum / result.measured) : null;
    return result;
  }

  /** Streaks of consecutive 80%+ units. Today never counts; an unlogged latest unit is skipped. */
  function unitStreaks(days, now = new Date()) {
    const reached = new Set(
        days.filter((d) => canLogUnit(d.date, now) && isLogged(d) && dayScore(d).percent >= 80).map((d) => d.date),
      ),
      sorted = [...reached].sort();
    let longest = 0,
      run = 0;
    sorted.forEach((u, i) => {
      run = i && nextUnit(sorted[i - 1]) === u ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    const byKey = new Map(days.map((d) => [d.date, d]));
    let cursor = defaultLogUnit(now);
    if (!isLogged(byKey.get(cursor))) cursor = prevUnit(cursor);
    let current = 0;
    while (reached.has(cursor)) {
      current++;
      cursor = prevUnit(cursor);
    }
    return { current, longest };
  }

  /** The score of the week that contains k: its 6 units, averaged like any period. */
  function weekSummary(days, k, now = new Date()) {
    const { start, end } = weekBounds(k);
    return summarizeUnits(days, start, end, now);
  }

  /**
   * How often an item was skipped for each reason between start and end,
   * most common first ("none" = skipped without a reason). Only logged units count.
   */
  function skipReasonCounts(days, itemId, start, end) {
    const counts = new Map();
    for (const d of days) {
      if (d.date < unitKey(start) || d.date > end || !isLogged(d)) continue;
      const item = [...(d.priorities || []), ...(d.moves || [])].find((x) => x.id === itemId);
      if (!item || item.status !== "skipped") continue;
      const reason = SKIP_REASONS[item.skipReason] ? item.skipReason : "none";
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    const order = [...Object.keys(SKIP_REASONS), "none"];
    return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || order.indexOf(a.reason) - order.indexOf(b.reason));
  }

  /* Weekend merge */
  const RANK = { pending: 0, skipped: 1, done: 2 };
  function mergeItems(a = [], b = [], key) {
    const out = a.map((x) => ({ ...x })),
      find = (x) =>
        out.find((y) => (x.id && y.id === x.id) || String(y[key] || "").toLowerCase() === String(x[key] || "").toLowerCase());
    for (const x of b) {
      const hit = find(x);
      if (!hit) out.push({ ...x });
      else if ((RANK[x.status] || 0) > (RANK[hit.status] || 0)) hit.status = x.status;
      if (hit && x.enabled !== false && hit.enabled === false) hit.enabled = true;
    }
    return out.map((x, i) => ({ ...x, order: i }));
  }
  function mergeConclusions(sat, sun, max = WEEKEND_CONCLUSION_MAX) {
    const a = String(sat || "").trim(),
      b = String(sun || "").trim();
    if (!b || a.includes(b)) return a.slice(0, max);
    if (!a) return b.slice(0, max);
    const saturdayPart = /^Sat: /.test(a) ? a : `Sat: ${a}`;
    return `${saturdayPart}\nSun: ${b}`.slice(0, max);
  }
  /** Merge a Saturday and a Sunday record into one Weekend record keyed by Saturday. */
  function mergeWeekendPair(sat, sun) {
    const satKey = sat ? sat.date : unitKey(sun.date);
    if (!sat) return { ...sun, date: satKey, weekend: true };
    if (!sun) return { ...sat, weekend: true };
    const seen = new Set(),
      sessions = [...(sat.focusSessions || []), ...(sun.focusSessions || [])].filter((s) => {
        const k = s.id || JSON.stringify(s);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return {
      ...sat,
      date: satKey,
      weekend: true,
      priorities: mergeItems(sat.priorities, sun.priorities, "text").slice(0, 10),
      moves: mergeItems(sat.moves, sun.moves, "label").slice(0, 10),
      // Sunday's plan is the plan for Monday, so it leads.
      planned: mergeItems(sun.planned, sat.planned, "text").slice(0, 10),
      focusSessions: sessions,
      conclusion: mergeConclusions(sat.conclusion, sun.conclusion),
      loggedAt: sat.loggedAt || sun.loggedAt || null,
      milestoneCelebrated: Boolean(sat.milestoneCelebrated || sun.milestoneCelebrated),
      rolloverResolved: sun.rolloverResolved || sat.rolloverResolved || null,
      updatedAt: Math.max(Number(sat.updatedAt) || 0, Number(sun.updatedAt) || 0) || Date.now(),
    };
  }
  /**
   * Fold every Sunday record into its Saturday. Idempotent: running it on
   * already-merged data returns changed=false and the same records.
   * Returns { days, changed, removed: [sunday keys], written: [weekend records] }.
   */
  function migrateWeekends(days) {
    const byKey = new Map(days.map((d) => [d.date, d])),
      removed = [],
      written = [];
    for (const d of days) {
      const wd = weekday(d.date);
      if (wd === 0) {
        const satKey = shiftDate(d.date, -1),
          merged = mergeWeekendPair(byKey.get(satKey), d);
        byKey.set(satKey, merged);
        byKey.delete(d.date);
        removed.push(d.date);
      } else if (wd === 6 && !d.weekend) {
        byKey.set(d.date, { ...byKey.get(d.date), weekend: true });
      }
    }
    for (const d of byKey.values()) {
      const before = days.find((x) => x.date === d.date);
      if (before !== d) written.push(d);
    }
    const next = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { days: next, changed: removed.length > 0 || written.length > 0, removed, written };
  }

  /* Permanent priorities */
  /** Permanent priorities that apply on `date`: started on or before it, not retired by it. */
  function activePermanentsOn(list, date) {
    return (list || [])
      .filter((p) => (!p.activeFrom || p.activeFrom <= date) && (!p.retiredOn || date < p.retiredOn))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  /**
   * Priorities a new day starts with: active permanent ones first, in order,
   * then what was planned the evening before. Duplicates (same id or same
   * text) appear once; at most `max` items.
   */
  function composeNewDayPriorities(permanents, planned, date, max = 10) {
    const out = [],
      seen = new Set(),
      add = (id, text) => {
        const key = String(text || "").trim().toLowerCase();
        if (out.length >= max || seen.has(`id:${id}`) || seen.has(`t:${key}`)) return;
        seen.add(`id:${id}`);
        seen.add(`t:${key}`);
        out.push({ id, text, status: "pending", order: out.length });
      };
    for (const p of activePermanentsOn(permanents, date)) add(p.id, p.text);
    for (const p of planned || []) add(p.id, p.text);
    return out;
  }

  const api = {
    CONCLUSION_MAX,
    WEEKEND_CONCLUSION_MAX,
    REVIEW_MAX,
    SKIP_REASONS,
    dateKey,
    parseDate,
    shiftDate,
    daysBetween,
    isWeekendKey,
    unitKey,
    unitEnd,
    nextUnit,
    prevUnit,
    currentUnit,
    defaultLogUnit,
    canLogUnit,
    unitsBetween,
    weekUnits,
    weekStart,
    weekBounds,
    weekSummary,
    skipReasonCounts,
    score,
    dayScore,
    isLogged,
    unitState,
    summarizeUnits,
    unitStreaks,
    activePermanentsOn,
    composeNewDayPriorities,
    mergeWeekendPair,
    migrateWeekends,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MinimalLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
