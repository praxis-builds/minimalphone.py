// Evening reminder (M3). Runs every 15 minutes from the minimal-reminder Worker
// (reminder/worker.js). Cron runs in UTC, so the Toronto time is worked out
// here, which also follows daylight-saving changes.
//
// Rule: once Toronto time has passed the check-in time from Settings, if the
// latest loggable unit (yesterday, or the Weekend on Monday) is not logged on
// the server, send one short notice to every subscribed phone. Never more than
// one per Toronto day (reminder_log), whatever happens next.
import { buildPushPayload } from "@block65/webcrypto-web-push";
import L from "../logic.js";

export const TIME_ZONE = "America/Toronto";
const DEFAULT_TIME = "18:00";

/** Toronto wall-clock parts for an instant. */
export function torontoParts(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function readRecord(db, entity, key) {
  const row = await db.prepare("SELECT value_json FROM records WHERE entity = ? AND key = ? AND deleted = 0").bind(entity, key).first();
  return row ? JSON.parse(row.value_json) : null;
}

/** Rebuild just enough of a day from server records to ask logic.js whether it is logged. */
export async function unitFromServer(db, unit) {
  const meta = await readRecord(db, "day", unit);
  const note = await readRecord(db, "note", unit);
  const { results } = await db.prepare("SELECT key, value_json FROM records WHERE entity = 'item' AND deleted = 0 AND key LIKE ?").bind(`${unit}|%`).all();
  if (!meta && !note && !results.length) return null;
  const day = { date: unit, ...(meta || {}), conclusion: note || "", priorities: [], moves: [] };
  for (const r of results) {
    const kind = r.key.split("|")[1], v = JSON.parse(r.value_json);
    if (kind === "priority") day.priorities.push({ status: v.status });
    if (kind === "move") day.moves.push({ status: v.status, enabled: v.enabled });
  }
  return day;
}

/** Decide, without side effects, whether a reminder is due at `instant`. */
export async function reminderDecision(db, instant) {
  const local = torontoParts(instant);
  const setting = await readRecord(db, "setting", "reminder");
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(setting?.time || "") ? setting.time : DEFAULT_TIME;
  if (setting && setting.enabled === false) return { send: false, reason: "check-in is off", local };
  if (local.time < time) return { send: false, reason: `before ${time}`, local };
  const sent = await db.prepare("SELECT 1 FROM reminder_log WHERE local_date = ?").bind(local.date).first();
  if (sent) return { send: false, reason: "already sent today", local };
  // logic.js works on local dates; give it the Toronto wall-clock as a date.
  const [y, m, d] = local.date.split("-").map(Number), [hh, mm] = local.time.split(":").map(Number);
  const unit = L.defaultLogUnit(new Date(y, m - 1, d, hh, mm));
  const day = await unitFromServer(db, unit);
  if (L.isLogged(day)) return { send: false, reason: "already logged", local, unit };
  return { send: true, local, unit, weekend: L.isWeekendKey(unit) };
}

export function reminderMessage(decision) {
  return {
    title: decision.weekend ? "The Weekend isn't logged yet" : "Yesterday isn't logged yet",
    body: "Take a minute to log it in Minimal.",
    url: "./",
  };
}

/** Send with the real Web Push protocol. Returns the push service's status code. */
export function webPushSender(env) {
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  return async (subscription, message) => {
    const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: 6 * 3600, urgency: "normal", topic: "minimal-log" } }, subscription, vapid);
    const res = await fetch(subscription.endpoint, payload);
    return res.status;
  };
}

/**
 * Run once. `send(subscription, message)` returns an HTTP status; 404/410 mean
 * the phone unsubscribed, so that subscription is removed.
 */
export async function runReminder(env, instant = new Date(), sendOverride = null) {
  const decision = await reminderDecision(env.DB, instant);
  if (!decision.send) return { ...decision, sent: 0 };
  const send = sendOverride || (env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY ? webPushSender(env) : null);
  if (!send) return { ...decision, send: false, reason: "push keys are not set up", sent: 0 };
  const { results: subs } = await env.DB.prepare("SELECT endpoint, keys_json FROM push_subscriptions").all();
  if (!subs.length) return { ...decision, send: false, reason: "no phone has notifications on", sent: 0 };
  // Claim the day first, so a retry or an overlapping run can never send twice.
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO reminder_log (local_date, sent_at) VALUES (?, ?)").bind(decision.local.date, instant.getTime()).run();
  if (!claim.meta.changes) return { ...decision, send: false, reason: "already sent today", sent: 0 };
  const message = reminderMessage(decision);
  let sent = 0;
  for (const s of subs) {
    const subscription = { endpoint: s.endpoint, expirationTime: null, keys: JSON.parse(s.keys_json) };
    try {
      const status = await send(subscription, message);
      if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(s.endpoint).run();
      else if (status >= 200 && status < 300) sent++;
    } catch {
      // One unreachable push service must not stop the others.
    }
  }
  return { ...decision, sent };
}
