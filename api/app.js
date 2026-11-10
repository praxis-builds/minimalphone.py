// Minimal sync API. Runs as a Cloudflare Pages Function (functions/api/[[route]].js)
// and as a plain Worker in the tests (api/test-worker.js). Bindings: DB (D1),
// APP_PASSCODE (secret). Nothing here logs request bodies or entry content.
import { LIMITS, recordId, sameValue, stable, validateOp, wins } from "../sync-core.js";
import { webPushSender } from "./reminder.js";

const COOKIE = "minimal_session";
const SESSION_DAYS = 180;
const DAY = 86400000;
const LOCK_FAILURES = 10, LOCK_WINDOW = 15 * 60 * 1000;
const PAGE = 2000;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const fail = (status, error) => json({ error }, status);

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.startsWith("/api/")) return fail(404, "not found");
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return fail(403, "cross-origin request refused");
  }
  try {
    if (path === "/api/login" && request.method === "POST") return await login(request, env, now);
    const session = await requireSession(request, env, now);
    if (!session) return fail(401, "sign in required");
    if (path === "/api/session" && request.method === "GET") return json({ ok: true, expiresAt: session.expires_at, serverTime: now });
    if (path === "/api/logout" && request.method === "POST") return await logout(env, session, false);
    if (path === "/api/logout-all" && request.method === "POST") return await logout(env, session, true);
    if (path === "/api/sync" && request.method === "POST") return await sync(request, env, now);
    if (path === "/api/conflicts/seen" && request.method === "POST") return await conflictsSeen(request, env, now);
    if (path === "/api/push/key" && request.method === "GET") return env.VAPID_PUBLIC_KEY ? json({ publicKey: env.VAPID_PUBLIC_KEY }) : fail(503, "Notifications are not set up on the server yet.");
    if (path === "/api/push/subscribe" && request.method === "POST") return await pushSubscribe(request, env, now);
    if (path === "/api/push/unsubscribe" && request.method === "POST") return await pushUnsubscribe(request, env);
    if (path === "/api/push/test" && request.method === "POST") return await pushTest(request, env);
    return fail(404, "not found");
  } catch (error) {
    // Report the failure without echoing any stored or submitted content.
    return fail(500, error?.publicMessage || "server error");
  }
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare two strings without leaking where they differ (both are hashed first). */
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256Hex(`minimal:${a}`), sha256Hex(`minimal:${b}`)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

function sessionCookie(token, maxAgeSeconds) {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

async function login(request, env, now) {
  if (!env.APP_PASSCODE) return fail(503, "Sync is not set up: the APP_PASSCODE secret is missing.");
  const lock = await env.DB.prepare("SELECT failures, window_start FROM login_lock WHERE id = 1").first();
  const inWindow = lock && now - lock.window_start < LOCK_WINDOW;
  if (inWindow && lock.failures >= LOCK_FAILURES) {
    const retry = Math.ceil((lock.window_start + LOCK_WINDOW - now) / 1000);
    return json({ error: "Too many attempts. Try again later." }, 429, { "retry-after": String(retry) });
  }
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  const passcode = typeof body?.passcode === "string" ? body.passcode : "";
  if (!passcode || !(await safeEqual(passcode, env.APP_PASSCODE))) {
    await env.DB.prepare("UPDATE login_lock SET failures = ?, window_start = ? WHERE id = 1")
      .bind(inWindow ? lock.failures + 1 : 1, inWindow ? lock.window_start : now).run();
    return fail(401, "Wrong passcode.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expires = now + SESSION_DAYS * DAY;
  await env.DB.batch([
    env.DB.prepare("UPDATE login_lock SET failures = 0, window_start = 0 WHERE id = 1"),
    env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(await sha256Hex(token), now, expires, now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
  ]);
  return json({ ok: true, expiresAt: expires, serverTime: now }, 200, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
}

async function requireSession(request, env, now) {
  const token = readCookie(request, COOKIE);
  if (!token || token.length > 100) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT token_hash, expires_at, last_seen_at FROM sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, now).first();
  if (!row) return null;
  if (now - row.last_seen_at > DAY) {
    row.expires_at = now + SESSION_DAYS * DAY;
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").bind(now, row.expires_at, tokenHash).run();
  }
  return row;
}

async function logout(env, session, everywhere) {
  await (everywhere
    ? env.DB.prepare("DELETE FROM sessions").run()
    : env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.token_hash).run());
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}

async function nextSeq(env) {
  const row = await env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key = 'seq' RETURNING value").first();
  return row.value;
}

/**
 * Upload queued ops and download everything changed since `cursor`.
 * Body: { deviceId, cursor, ops: [{ id, entity, key, value, deleted, updatedAt }] }
 */
async function sync(request, env, now) {
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  const deviceId = typeof body?.deviceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.deviceId) ? body.deviceId : "";
  if (!deviceId) return fail(400, "bad deviceId");
  const cursor = Number.isInteger(body.cursor) && body.cursor >= 0 ? body.cursor : 0;
  const ops = Array.isArray(body.ops) ? body.ops : [];
  if (ops.length > LIMITS.opsPerRequest) return fail(413, `send at most ${LIMITS.opsPerRequest} ops per request`);
  for (const op of ops) {
    const problem = validateOp(op);
    if (problem) return fail(400, `invalid op: ${problem}`);
  }

  await env.DB.prepare("INSERT INTO devices (id, created_at, last_sync_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_sync_at = excluded.last_sync_at").bind(deviceId, now, now).run();

  let applied = 0, duplicates = 0, conflicts = 0;
  // Rows whose stored value beat an uploaded edit: sent back so the phone shows the winner.
  const corrections = new Map();
  for (const raw of ops) {
    // A device whose clock runs ahead must not win every future edit.
    const op = { ...raw, deviceId, deleted: Boolean(raw.deleted), value: raw.deleted ? null : raw.value, updatedAt: Math.min(raw.updatedAt, now + LIMITS.futureSkewMs) };
    const row = await env.DB.prepare("SELECT value_json, deleted, updated_at, device_id, seq FROM records WHERE entity = ? AND key = ?").bind(op.entity, op.key).first();
    const existing = row && { entity: op.entity, key: op.key, value: row.value_json === null ? null : JSON.parse(row.value_json), deleted: Boolean(row.deleted), updatedAt: row.updated_at, deviceId: row.device_id, seq: row.seq };
    const correct = () => { if (existing && !sameValue(op, existing)) corrections.set(recordId(op.entity, op.key), existing); };
    const seen = await env.DB.prepare("SELECT 1 FROM applied_ops WHERE op_id = ?").bind(raw.id).first();
    if (seen) { duplicates++; correct(); continue; }
    const statements = [env.DB.prepare("INSERT INTO applied_ops (op_id, applied_at) VALUES (?, ?)").bind(op.id, now)];
    const incomingWins = wins(op, existing);
    if (!incomingWins) correct();
    if (existing && existing.seq > cursor && existing.deviceId !== deviceId && !sameValue(op, existing)) {
      const [kept, lost] = incomingWins ? [op, existing] : [existing, op];
      statements.push(env.DB.prepare("INSERT INTO conflicts (entity, key, kept_json, lost_json, kept_device, lost_device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(op.entity, op.key, kept.deleted ? null : stable(kept.value), lost.deleted ? null : stable(lost.value), kept.deviceId, lost.deviceId, now));
      conflicts++;
    }
    // An edit that matches what is stored changes nothing, whatever its timestamp.
    if (incomingWins && !(existing && sameValue(op, existing))) {
      const seq = await nextSeq(env);
      statements.push(env.DB.prepare(`INSERT INTO records (entity, key, value_json, deleted, updated_at, device_id, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity, key) DO UPDATE SET value_json = excluded.value_json, deleted = excluded.deleted, updated_at = excluded.updated_at, device_id = excluded.device_id, seq = excluded.seq`)
        .bind(op.entity, op.key, op.deleted ? null : stable(op.value), op.deleted ? 1 : 0, op.updatedAt, deviceId, seq));
      applied++;
    }
    await env.DB.batch(statements);
  }
  // Keep the idempotency log bounded; a very old retry still loses to the stored edit.
  await env.DB.prepare("DELETE FROM applied_ops WHERE applied_at < ?").bind(now - 90 * DAY).run();

  const { results } = await env.DB.prepare("SELECT entity, key, value_json, deleted, updated_at, device_id, seq FROM records WHERE seq > ? ORDER BY seq LIMIT ?").bind(cursor, PAGE + 1).all();
  const more = results.length > PAGE;
  const page = results.slice(0, PAGE);
  const records = page.map((r) => ({ entity: r.entity, key: r.key, value: r.value_json === null ? null : JSON.parse(r.value_json), deleted: Boolean(r.deleted), updatedAt: r.updated_at, deviceId: r.device_id, seq: r.seq }));
  const listed = new Set(records.map((r) => recordId(r.entity, r.key)));
  for (const [id, row] of corrections) if (!listed.has(id)) records.push(row);
  const head = await env.DB.prepare("SELECT value FROM meta WHERE key = 'seq'").first();
  const newCursor = page.length ? page[page.length - 1].seq : Math.max(cursor, more ? cursor : head.value);
  const { results: open } = await env.DB.prepare("SELECT id, entity, key, kept_json, lost_json, kept_device, lost_device, created_at FROM conflicts WHERE seen_at IS NULL ORDER BY id DESC LIMIT 50").all();
  return json({
    cursor: newCursor,
    more,
    records,
    applied, duplicates, conflicts,
    openConflicts: open.map((c) => ({ id: c.id, record: recordId(c.entity, c.key), entity: c.entity, key: c.key, kept: c.kept_json === null ? null : JSON.parse(c.kept_json), lost: c.lost_json === null ? null : JSON.parse(c.lost_json), keptDevice: c.kept_device, lostDevice: c.lost_device, at: c.created_at })),
    serverTime: now,
  });
}

async function conflictsSeen(request, env, now) {
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  const ids = Array.isArray(body?.ids) ? body.ids.filter(Number.isInteger).slice(0, 200) : [];
  if (ids.length) await env.DB.prepare(`UPDATE conflicts SET seen_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`).bind(now, ...ids).run();
  return json({ ok: true, marked: ids.length });
}

/* ---------- Web Push subscriptions (evening reminder) ---------- */
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
function readSubscription(body) {
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const keys = body?.keys || {};
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== "https:" || endpoint.length > 1000) return null;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || !B64URL.test(keys.p256dh) || !B64URL.test(keys.auth) || keys.p256dh.length > 200 || keys.auth.length > 100) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
async function pushSubscribe(request, env, now) {
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  const sub = readSubscription(body);
  if (!sub) return fail(400, "invalid subscription");
  await env.DB.prepare("INSERT INTO push_subscriptions (endpoint, keys_json, created_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json")
    .bind(sub.endpoint, JSON.stringify(sub.keys), now).run();
  return json({ ok: true });
}
async function pushUnsubscribe(request, env) {
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  if (typeof body?.endpoint !== "string") return fail(400, "missing endpoint");
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
  return json({ ok: true });
}
/** Sends one notice to the calling phone so the person can see notifications work. */
async function pushTest(request, env) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return fail(503, "Notifications are not set up on the server yet.");
  let body;
  try { body = await request.json(); } catch { return fail(400, "expected JSON"); }
  const sub = readSubscription(body);
  if (!sub) return fail(400, "invalid subscription");
  const status = await webPushSender(env)({ ...sub, expirationTime: null }, { title: "Minimal notifications are on", body: "You will get one note in the evening if a day is not logged.", url: "./" });
  return status >= 200 && status < 300 ? json({ ok: true }) : fail(502, `The push service answered ${status}.`);
}
