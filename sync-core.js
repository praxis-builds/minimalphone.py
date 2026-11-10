// Shared sync rules for Minimal. Pure functions only: used by the app (browser),
// the Cloudflare API and the tests, so all three agree on what a record is and
// which edit wins.
//
// The app's state ({config, days}) is "exploded" into flat records, one per
// syncable piece, so that the latest edit wins per item rather than per day:
//   item:<date>|<priority|planned|move>|<id>   day:<date>   note:<date>
//   focus:<id>   setting:<name>   registry:<id>   review:<monday of the week>

export const ENTITIES = ["item", "day", "note", "focus", "setting", "registry", "review"];
export const ITEM_KINDS = { priorities: "priority", planned: "planned", moves: "move" };
const KIND_TO_LIST = { priority: "priorities", planned: "planned", move: "moves" };
// Settings that follow the person across devices. Everything else in config
// (focus timer, last export, migration flags…) stays on the device.
export const SYNCED_SETTINGS = ["profile", "accent", "milestoneEnabled", "reminder", "moves", "launchers", "permanent", "yearTarget"];
const DAY_FIELDS = ["loggedAt", "weekend", "milestoneCelebrated", "rolloverResolved", "reminderShown", "reminderDismissed"];
export const LIMITS = { opsPerRequest: 500, valueBytes: 64 * 1024, keyLength: 200, futureSkewMs: 5 * 60 * 1000 };

/** JSON with sorted object keys, so equal values always compare equal. */
export function stable(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
    .join(",")}}`;
}

/** 64-bit FNV-1a as 16 hex chars. Deterministic op ids make re-uploads idempotent. */
export function hash(text) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(text)) h = ((h ^ BigInt(byte)) * prime) & mask;
  return h.toString(16).padStart(16, "0");
}

export const recordId = (entity, key) => `${entity}:${key}`;

export function opId(deviceId, op) {
  return hash([deviceId, op.entity, op.key, op.updatedAt, op.deleted ? 1 : 0, stable(op.value)].join("\u0000"));
}

/** Does edit a beat edit b? Later updatedAt wins; ties go to the larger device id. */
export function wins(a, b) {
  if (!b) return true;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return String(a.deviceId || "") > String(b.deviceId || "");
}

export function sameValue(a, b) {
  return Boolean(a.deleted) === Boolean(b.deleted) && stable(a.value) === stable(b.value);
}

/**
 * Split app state into records. `stamp(entity, key, fallback)` lets the caller
 * choose each record's timestamp; by default the day's or config's updatedAt.
 * Returns Map<recordId, {entity, key, value, updatedAt}>.
 */
export function explode(config, days, { stampZero = false } = {}) {
  const out = new Map(),
    put = (entity, key, value, updatedAt) =>
      out.set(recordId(entity, key), { entity, key, value, updatedAt: stampZero ? 0 : Number(updatedAt) || 0 });
  const cfgAt = config?.updatedAt;
  if (config) {
    put("setting", "profile", { name: config.name || "", initials: config.initials || "", locationLabel: config.locationLabel || "" }, cfgAt);
    for (const name of SYNCED_SETTINGS.slice(1)) if (config[name] !== undefined) put("setting", name, config[name], cfgAt);
    for (const item of config.items || []) put("registry", item.id, item, cfgAt);
    for (const [week, r] of Object.entries(config.reviews || {})) put("review", week, { worked: r?.worked || "", change: r?.change || "" }, cfgAt);
  }
  for (const day of days || []) {
    const at = day.updatedAt;
    const meta = {};
    for (const f of DAY_FIELDS) if (day[f] !== undefined && day[f] !== null && day[f] !== false) meta[f] = day[f];
    put("day", day.date, meta, at);
    if (day.conclusion) put("note", day.date, day.conclusion, at);
    for (const [list, kind] of Object.entries(ITEM_KINDS)) {
      // Position is the item's place in the list, so gaps in `order` never cause a spurious edit.
      [...(day[list] || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((item, position) => {
        const value = { status: item.status, position };
        if (kind === "move") Object.assign(value, { label: item.label, enabled: item.enabled !== false });
        else value.text = item.text;
        if (item.status === "skipped" && item.skipReason) value.reason = item.skipReason;
        put("item", `${day.date}|${kind}|${item.id}`, value, at);
      });
    }
    for (const s of day.focusSessions || []) put("focus", s.id, { ...s, date: day.date }, at);
  }
  return out;
}

/**
 * Rebuild app state from records. `baseConfig` keeps the device-only config
 * fields; `baseDays` keeps device-only day fields. Days with no records vanish.
 */
export function implode(records, baseConfig = {}, baseDays = []) {
  const config = { ...baseConfig },
    byDate = new Map(),
    base = new Map((baseDays || []).map((d) => [d.date, d])),
    dayOf = (date) => {
      if (!byDate.has(date)) {
        const prev = base.get(date) || {};
        byDate.set(date, {
          ...prev,
          date,
          priorities: [], planned: [], moves: [], focusSessions: [], conclusion: "",
          loggedAt: null, weekend: false, milestoneCelebrated: false, rolloverResolved: null,
          reminderShown: false, reminderDismissed: false,
        });
      }
      return byDate.get(date);
    };
  const registry = [], reviews = {};
  for (const r of records.values()) {
    if (r.deleted) continue;
    if (r.entity === "setting") {
      if (r.key === "profile") Object.assign(config, { name: r.value?.name || "", initials: r.value?.initials || "", locationLabel: r.value?.locationLabel || "" });
      else if (SYNCED_SETTINGS.includes(r.key)) config[r.key] = r.value;
    } else if (r.entity === "registry") registry.push(r.value);
    else if (r.entity === "review") reviews[r.key] = { worked: String(r.value?.worked || ""), change: String(r.value?.change || "") };
    else if (r.entity === "day") Object.assign(dayOf(r.key), r.value || {});
    else if (r.entity === "note") dayOf(r.key).conclusion = String(r.value || "");
    else if (r.entity === "focus") dayOf(r.value.date).focusSessions.push(r.value);
    else if (r.entity === "item") {
      const [date, kind, id] = splitItemKey(r.key);
      const list = KIND_TO_LIST[kind];
      if (!list) continue;
      const v = r.value || {};
      const item = kind === "move"
        ? { id, label: v.label, status: v.status, enabled: v.enabled !== false, order: v.position }
        : { id, text: v.text, status: v.status, order: v.position };
      if (v.reason) item.skipReason = v.reason;
      dayOf(date)[list].push(item);
    }
  }
  if (registry.length || records.size) config.items = registry.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (records.size) config.reviews = reviews;
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    for (const list of Object.values(KIND_TO_LIST)) d[list].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id))).forEach((x, i) => (x.order = i));
    d.focusSessions.sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
  }
  return { config, days };
}

export function splitItemKey(key) {
  const first = key.indexOf("|"), second = key.indexOf("|", first + 1);
  return [key.slice(0, first), key.slice(first + 1, second), key.slice(second + 1)];
}

/** Ops that turn `before` into `after`, stamped `now`. Removed records become tombstones. */
export function diff(before, after, now) {
  const ops = [];
  for (const [id, rec] of after) {
    const prev = before.get(id);
    if (!prev || stable(prev.value) !== stable(rec.value)) ops.push({ entity: rec.entity, key: rec.key, value: rec.value, deleted: false, updatedAt: now });
  }
  for (const [id, rec] of before) if (!after.has(id)) ops.push({ entity: rec.entity, key: rec.key, value: null, deleted: true, updatedAt: now });
  return ops;
}

/** Server-side validation of one uploaded op. Returns an error string or "". */
export function validateOp(op) {
  if (!op || typeof op !== "object") return "op must be an object";
  if (!ENTITIES.includes(op.entity)) return "unknown entity";
  if (typeof op.key !== "string" || !op.key || op.key.length > LIMITS.keyLength) return "bad key";
  if (typeof op.id !== "string" || !/^[0-9a-f]{16}$/.test(op.id)) return "bad op id";
  if (!Number.isFinite(op.updatedAt) || op.updatedAt < 0) return "bad updatedAt";
  if (!op.deleted && stable(op.value).length > LIMITS.valueBytes) return "value too large";
  return "";
}

if (typeof window !== "undefined") window.MinimalSync = { ENTITIES, SYNCED_SETTINGS, LIMITS, stable, hash, recordId, opId, wins, sameValue, explode, implode, diff, splitItemKey, validateOp };
