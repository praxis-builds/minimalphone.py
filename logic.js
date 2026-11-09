"use strict";

/*
 * Pure date, unit, scoring and weekend-merge logic for Minimal.
 * Loaded by the browser before script.js (as window.MinimalLogic) and by the
 * Node test suite via require(). No DOM or storage access lives here.
 *
 * A "unit" is what gets logged once and counts once in every stat. For now
 * every calendar day is its own unit, keyed by its date. A unit can only be
 * logged after it has fully ended, so today and the future are read-only.
 */
(function (root) {
  const CONCLUSION_MAX = 500;

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
  function isWeekendKey() {
    return false;
  }
  function unitKey(k) {
    return k;
  }
  function unitEnd(k) {
    return unitKey(k);
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
  /** The most recent unit that has fully ended: yesterday. */
  function defaultLogUnit(now = new Date()) {
    return prevUnit(currentUnit(now));
  }
  /** A unit can be logged once every calendar day in it is in the past. */
  function canLogUnit(k, now = new Date()) {
    return unitEnd(k) < dateKey(now);
  }
  /** Units from start to end inclusive (both normalised to unit keys). */
  function unitsBetween(start, end) {
    const out = [];
    for (let u = unitKey(start), last = unitKey(end); u <= last; u = nextUnit(u)) out.push(u);
    return out;
  }
  /** Monday-start week containing k. */
  function weekUnits(k) {
    const offset = (weekday(k) + 6) % 7;
    return unitsBetween(shiftDate(k, -offset), shiftDate(k, 6 - offset));
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

  const api = {
    CONCLUSION_MAX,
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
    score,
    dayScore,
    isLogged,
    unitState,
    summarizeUnits,
    unitStreaks,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MinimalLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
