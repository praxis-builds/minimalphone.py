// API and sync tests. They run inside the Workers runtime (Miniflare) against a
// real local D1 database with migrations/0001_init.sql applied.
import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SyncClient } from "../../sync-client.js";
import { explode, implode, opId, stable } from "../../sync-core.js";

const BASE = "https://minimal.test";
const PASSCODE = "correct horse battery staple";

async function api(path, { method = "GET", body, cookie, origin } = {}) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  return SELF.fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn() {
  const res = await api("/api/login", { method: "POST", body: { passcode: PASSCODE } });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie").split(";")[0];
}
/** A phone: its own sync state and its own copy of the app data. */
function phone(cookie, name = "phone") {
  let saved = null;
  const device = {
    name,
    state: { config: { key: "main", name: "", accent: "mint", moves: [], launchers: [], items: [], updatedAt: 1 }, days: [] },
    online: true,
  };
  device.client = new SyncClient({
    store: { get: async () => saved, set: async (v) => { saved = structuredClone(v); } },
    fetch: async (path, init) => {
      if (!device.online) throw new TypeError("Failed to fetch");
      const headers = { ...init.headers, cookie };
      return SELF.fetch(BASE + path, { ...init, headers });
    },
  });
  device.get = () => device.state;
  device.apply = async (next) => { device.state = structuredClone(next); return device.state; };
  device.edit = async (fn) => { fn(device.state); for (const d of device.state.days) d.updatedAt = Date.now(); await device.client.track(device.state.config, device.state.days); };
  device.sync = () => device.client.sync(device.get, device.apply);
  return device;
}
const day = (date, priorities = [], extra = {}) => ({
  date, priorities: priorities.map(([id, text, status = "pending"], order) => ({ id, text, status, order })),
  planned: [], moves: [], focusSessions: [], conclusion: "", updatedAt: Date.parse(`${date}T20:00:00Z`), ...extra,
});
const statusOf = (device, date, id) => device.state.days.find((d) => d.date === date)?.priorities.find((p) => p.id === id)?.status;
const count = async (table) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;

beforeEach(async () => {
  await env.DB.batch(["records", "sessions", "devices", "applied_ops", "conflicts"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await env.DB.prepare("UPDATE login_lock SET failures = 0, window_start = 0").run();
  await env.DB.prepare("UPDATE meta SET value = 0 WHERE key = 'seq'").run();
});

describe("sessions", () => {
  it("rejects every API call without a valid session", async () => {
    const calls = [["/api/session", "GET"], ["/api/sync", "POST", { deviceId: "dev_aaaaaaaaaaaa", cursor: 0, ops: [] }], ["/api/logout", "POST"], ["/api/logout-all", "POST"], ["/api/conflicts/seen", "POST", { ids: [1] }]];
    for (const [path, method, body] of calls) {
      expect((await api(path, { method, body })).status, `${method} ${path} without cookie`).toBe(401);
      expect((await api(path, { method, body, cookie: "minimal_session=forged-token" })).status, `${method} ${path} forged`).toBe(401);
    }
  });

  it("signs in with the passcode, sets a locked-down cookie, and signs out", async () => {
    expect((await api("/api/login", { method: "POST", body: { passcode: "wrong" } })).status).toBe(401);
    const res = await api("/api/login", { method: "POST", body: { passcode: PASSCODE } });
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    expect((await api("/api/session", { cookie })).status).toBe(200);
    const stored = await env.DB.prepare("SELECT token_hash FROM sessions").first();
    expect(cookie).not.toContain(stored.token_hash); // only a hash is stored
    expect((await api("/api/logout", { method: "POST", cookie })).status).toBe(200);
    expect((await api("/api/session", { cookie })).status).toBe(401);
  });

  it("sign out everywhere ends every session", async () => {
    const a = await signIn(), b = await signIn();
    await api("/api/logout-all", { method: "POST", cookie: a });
    expect((await api("/api/session", { cookie: b })).status).toBe(401);
  });

  it("locks sign-in for 15 minutes after 10 wrong passcodes", async () => {
    for (let i = 0; i < 10; i++) await api("/api/login", { method: "POST", body: { passcode: `guess-${i}` } });
    const res = await api("/api/login", { method: "POST", body: { passcode: PASSCODE } });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("refuses cross-origin writes", async () => {
    const cookie = await signIn();
    const res = await api("/api/sync", { method: "POST", cookie, origin: "https://evil.example", body: { deviceId: "dev_aaaaaaaaaaaa", cursor: 0, ops: [] } });
    expect(res.status).toBe(403);
  });

  it("validates uploaded ops", async () => {
    const cookie = await signIn();
    const bad = await api("/api/sync", { method: "POST", cookie, body: { deviceId: "dev_aaaaaaaaaaaa", cursor: 0, ops: [{ id: "nope", entity: "item", key: "k", value: 1, updatedAt: 1 }] } });
    expect(bad.status).toBe(400);
  });
});

describe("sync", () => {
  it("a retried upload is applied once", async () => {
    const cookie = await signIn();
    const op = { entity: "note", key: "2026-11-09", value: "Quiet day", deleted: false, updatedAt: 1000 };
    const body = { deviceId: "dev_aaaaaaaaaaaa", cursor: 0, ops: [{ ...op, id: opId("dev_aaaaaaaaaaaa", op) }] };
    const first = await (await api("/api/sync", { method: "POST", cookie, body })).json();
    const again = await (await api("/api/sync", { method: "POST", cookie, body })).json();
    expect(first.applied).toBe(1);
    expect(again.applied).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(await count("records")).toBe(1);
  });

  it("offline edits queue on the phone and sync when it is back online", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    a.state.days = [day("2026-11-09", [["p1", "Write brief"], ["p2", "Call dentist"]])];
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });
    expect(statusOf(b, "2026-11-09", "p1")).toBe("pending");

    a.online = false;
    await a.edit((s) => { s.days[0].priorities[0].status = "done"; s.days[0].conclusion = "Brief done on the train."; });
    await expect(a.sync()).rejects.toMatchObject({ offline: true });
    expect(a.client.pending).toBe(2); // item + note, still on the phone

    a.online = true;
    await a.sync();
    expect(a.client.pending).toBe(0);
    await b.sync();
    expect(statusOf(b, "2026-11-09", "p1")).toBe("done");
    expect(statusOf(b, "2026-11-09", "p2")).toBe("pending");
    expect(b.state.days[0].conclusion).toBe("Brief done on the train.");
  });

  it("the latest edit wins per item, and the conflict is logged", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    a.state.days = [day("2026-11-09", [["p1", "Write brief"], ["p2", "Call dentist"]])];
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });

    // Both phones change p1 while apart; a also changes p2, b changes nothing else.
    let clock = Date.now();
    a.client.now = () => clock; b.client.now = () => clock;
    clock += 1000; await a.edit((s) => { s.days[0].priorities[0].status = "skipped"; s.days[0].priorities[1].status = "done"; });
    clock += 1000; await b.edit((s) => { s.days[0].priorities[0].status = "done"; });
    await a.sync();
    const result = await b.sync();
    await a.sync();

    for (const p of [a, b]) {
      expect(statusOf(p, "2026-11-09", "p1"), p.name).toBe("done");    // b's later edit
      expect(statusOf(p, "2026-11-09", "p2"), p.name).toBe("done");    // a's edit to a different item survives
    }
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ entity: "item", key: "2026-11-09|priority|p1", kept: { status: "done" }, lost: { status: "skipped" } });

    await b.client.dismissConflicts([result.conflicts[0].id]);
    expect((await a.sync()).conflicts).toHaveLength(0);
  });

  it("a phone whose edit lost is corrected to the winning value", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    a.state.days = [day("2026-11-09", [["p1", "Write brief"]])];
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });
    const clock = Date.now();
    b.client.now = () => clock + 60000;            // b's edit carries a later time
    await b.edit((s) => { s.days[0].priorities[0].status = "done"; });
    await b.sync();
    await a.sync();                                 // a already has b's "done"
    a.client.now = () => clock; a.client.state.offset = 0;
    await a.edit((s) => { s.days[0].priorities[0].status = "skipped"; }); // stamped earlier than b's edit
    await a.sync();                                 // loses; nothing new on the server for a to download
    expect(statusOf(a, "2026-11-09", "p1")).toBe("done");
    expect(a.client.pending).toBe(0);
  });

  it("an older edit does not overwrite a newer one", async () => {
    const cookie = await signIn();
    const newer = { entity: "note", key: "2026-11-09", value: "newer", deleted: false, updatedAt: 2000 };
    const older = { entity: "note", key: "2026-11-09", value: "older", deleted: false, updatedAt: 1000 };
    await api("/api/sync", { method: "POST", cookie, body: { deviceId: "dev_aaaaaaaaaaaa", cursor: 0, ops: [{ ...newer, id: opId("dev_aaaaaaaaaaaa", newer) }] } });
    const res = await (await api("/api/sync", { method: "POST", cookie, body: { deviceId: "dev_bbbbbbbbbbbb", cursor: 0, ops: [{ ...older, id: opId("dev_bbbbbbbbbbbb", older) }] } })).json();
    expect(res.records.find((r) => r.key === "2026-11-09").value).toBe("newer");
  });

  it("an edit not yet queued when a sync starts is still uploaded, not swallowed", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    a.state.days = [day("2026-11-09", [["p1", "Write brief"]])];
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });
    await b.edit((s) => { s.days[0].conclusion = "From b"; });
    await b.sync();
    a.state.days[0].priorities[0].status = "done"; // saved locally, track() not called yet
    await a.sync();                                 // pulls b's note while a's edit is untracked
    await b.sync();
    expect(statusOf(b, "2026-11-09", "p1")).toBe("done");
    expect(a.state.days[0].conclusion).toBe("From b");
  });

  it("deleting an item on one phone removes it on the other", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    a.state.days = [day("2026-11-09", [["p1", "Write brief"], ["p2", "Call dentist"]])];
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });
    await a.edit((s) => { s.days[0].priorities.splice(1, 1); });
    await a.sync(); await b.sync();
    expect(b.state.days[0].priorities.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("first sync", () => {
  const sample = () => ({
    config: { key: "main", name: "Sam", initials: "S", locationLabel: "Toronto", accent: "ice", milestoneEnabled: true, reminder: { enabled: true, time: "20:30" }, moves: [{ id: "walk", label: "Walk", enabled: true, order: 0 }], launchers: [], items: [{ id: "p1", type: "priority", name: "Write brief", createdDate: "2026-11-06", activePeriods: [{ start: "2026-11-06", end: null }], deleted: false }], updatedAt: Date.parse("2026-11-08T12:00:00Z") },
    days: [
      day("2026-11-06", [["p1", "Write brief", "done"]], { moves: [{ id: "walk", label: "Walk", status: "done", enabled: true, order: 0 }], conclusion: "Good day", loggedAt: 5 }),
      day("2026-11-07", [["p1", "Write brief", "skipped"]], { weekend: true, conclusion: "Sat: rest\nSun: hike", focusSessions: [{ id: "f1", date: "2026-11-07", itemType: "priority", itemId: "p1", itemLabel: "Write brief", plannedDuration: 1500, completedAt: "2026-11-07T15:00:00.000Z" }] }),
    ],
  });

  it("uploads the local copy once; running it again changes nothing", async () => {
    const cookie = await signIn();
    const a = phone(cookie);
    await a.client.load();
    a.state = sample();
    const before = stable(a.state);
    await a.client.firstSync(a.get, a.apply);
    const rows = await count("records"), seq = (await env.DB.prepare("SELECT value FROM meta WHERE key='seq'").first()).value;
    expect(rows).toBe(explode(a.state.config, a.state.days).size);

    await a.client.firstSync(a.get, a.apply); // e.g. the user taps "Upload this phone" twice
    expect(await count("records")).toBe(rows);
    expect((await env.DB.prepare("SELECT value FROM meta WHERE key='seq'").first()).value).toBe(seq);
    expect(await count("conflicts")).toBe(0);
    expect(stable(implode(explode(a.state.config, a.state.days), a.state.config, a.state.days).days)).toBe(stable(implode(explode(JSON.parse(before).config, JSON.parse(before).days), JSON.parse(before).config, JSON.parse(before).days).days));
  });

  it("a new phone signs in and downloads everything", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), fresh = phone(cookie, "new");
    await a.client.load(); await fresh.client.load();
    a.state = sample();
    await a.client.firstSync(a.get, a.apply);
    await fresh.client.firstSync(fresh.get, fresh.apply, { fresh: true });
    const strip = (s) => explode(s.config, s.days, { stampZero: true });
    expect(stable([...strip(fresh.state)])).toBe(stable([...strip(a.state)]));
    expect(fresh.state.config.name).toBe("Sam");
    expect(fresh.state.days.find((d) => d.date === "2026-11-07").focusSessions).toHaveLength(1);
  });

  it("a phone whose clock runs a day fast does not block later edits", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "fast"), b = phone(cookie, "b");
    await a.client.load(); await b.client.load();
    const fast = () => Date.now() + 86400000;
    a.client.now = fast;
    await a.client.login(PASSCODE);              // learns the server's clock
    a.state = sample();
    a.state.days.forEach((d) => { d.updatedAt = fast(); });
    await a.client.firstSync(a.get, a.apply);
    await b.client.firstSync(b.get, b.apply, { fresh: true });
    await b.edit((s) => { s.days[0].priorities[0].status = "skipped"; });
    await b.sync();
    await a.sync();
    expect(statusOf(a, "2026-11-06", "p1")).toBe("skipped");
    const newest = await env.DB.prepare("SELECT MAX(updated_at) AS t FROM records").first();
    expect(newest.t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("a new phone's empty defaults never overwrite the server", async () => {
    const cookie = await signIn();
    const a = phone(cookie, "a"), fresh = phone(cookie, "new");
    await a.client.load(); await fresh.client.load();
    a.state = sample();
    await a.client.firstSync(a.get, a.apply);
    fresh.state.config.updatedAt = Date.now(); // looks "newer" than the real settings
    await fresh.client.firstSync(fresh.get, fresh.apply, { fresh: true });
    await a.sync();
    expect(a.state.config.name).toBe("Sam");
    expect(a.state.config.accent).toBe("ice");
  });
});
