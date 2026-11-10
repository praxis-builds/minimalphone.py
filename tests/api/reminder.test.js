// Evening reminder: runs inside the Workers runtime against a local D1 database.
import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { reminderDecision, runReminder, torontoParts, webPushSender } from "../../api/reminder.js";

const BASE = "https://minimal.test";
const PASSCODE = "correct horse battery staple";
// Monday 16 Nov 2026 in Toronto (EST, UTC-5). The latest loggable unit is the Weekend of 14 Nov.
const at = (localTime, date = "2026-11-16", offset = "-05:00") => new Date(`${date}T${localTime}:00${offset}`);
const SUB = { endpoint: "https://push.example/sub/1", keys: { p256dh: "BPfake", auth: "authfake" } };

async function put(entity, key, value) {
  await env.DB.prepare("INSERT OR REPLACE INTO records (entity, key, value_json, deleted, updated_at, device_id, seq) VALUES (?, ?, ?, 0, 1, 'dev_test', 1)")
    .bind(entity, key, JSON.stringify(value)).run();
}
function recorder(status = 201) {
  const calls = [];
  const send = async (subscription, message) => { calls.push({ subscription, message }); return status; };
  return { calls, send };
}

beforeEach(async () => {
  await env.DB.batch(["records", "push_subscriptions", "reminder_log", "sessions"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  await put("setting", "reminder", { enabled: true, time: "20:30" });
  await env.DB.prepare("INSERT INTO push_subscriptions (endpoint, keys_json, created_at) VALUES (?, ?, 1)").bind(SUB.endpoint, JSON.stringify(SUB.keys)).run();
});

describe("evening reminder", () => {
  it("fires after the check-in time when the latest unit is not logged", async () => {
    const r = recorder();
    const result = await runReminder(env, at("20:45"), r.send);
    expect(result.unit).toBe("2026-11-14");
    expect(result.sent).toBe(1);
    expect(r.calls[0].message.title).toBe("The Weekend isn't logged yet");
    expect(r.calls[0].subscription.endpoint).toBe(SUB.endpoint);
  });

  it("sends at most one notice per Toronto day", async () => {
    const r = recorder();
    await runReminder(env, at("20:45"), r.send);
    await runReminder(env, at("21:00"), r.send);
    await runReminder(env, at("23:45"), r.send);
    expect(r.calls).toHaveLength(1);
  });

  it("does not fire when the unit is logged", async () => {
    await put("item", "2026-11-14|priority|p1", { text: "Laundry", status: "done", position: 0 });
    const r = recorder();
    const result = await runReminder(env, at("20:45"), r.send);
    expect(result.reason).toBe("already logged");
    expect(r.calls).toHaveLength(0);
  });

  it("counts a note or a skipped item as logged too", async () => {
    await put("note", "2026-11-14", "Rested.");
    expect((await reminderDecision(env.DB, at("20:45"))).send).toBe(false);
  });

  it("does not fire before the check-in time, or when check-in is off", async () => {
    const r = recorder();
    expect((await runReminder(env, at("20:15"), r.send)).reason).toBe("before 20:30");
    await put("setting", "reminder", { enabled: false, time: "20:30" });
    expect((await runReminder(env, at("22:00"), r.send)).reason).toBe("check-in is off");
    expect(r.calls).toHaveLength(0);
  });

  it("on a weekday it reminds about yesterday", async () => {
    const r = recorder();
    const result = await runReminder(env, at("20:45", "2026-11-18"), r.send);
    expect(result.unit).toBe("2026-11-17");
    expect(r.calls[0].message.title).toBe("Yesterday isn't logged yet");
  });

  it("uses Toronto time across daylight saving (EDT in summer)", async () => {
    // 20:45 EDT on 15 July is 00:45 UTC on 16 July: still the 15th in Toronto.
    expect(torontoParts(new Date("2026-07-16T00:45:00Z"))).toEqual({ date: "2026-07-15", time: "20:45" });
    const result = await reminderDecision(env.DB, at("20:45", "2026-07-15", "-04:00"));
    expect(result.local.date).toBe("2026-07-15");
    expect(result.unit).toBe("2026-07-14");
  });

  it("removes a subscription the push service says is gone", async () => {
    const r = recorder(410);
    await runReminder(env, at("20:45"), r.send);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first()).n).toBe(0);
  });

  it("does not claim the day when no phone has notifications on", async () => {
    await env.DB.prepare("DELETE FROM push_subscriptions").run();
    const result = await runReminder(env, at("20:45"), recorder().send);
    expect(result.reason).toBe("no phone has notifications on");
    expect(await env.DB.prepare("SELECT 1 FROM reminder_log").first()).toBeNull();
  });

  it("builds a real encrypted Web Push request in the Workers runtime", async () => {
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const vapidPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const vapidPublic = b64(await crypto.subtle.exportKey("raw", vapidPair.publicKey));
    const vapidPrivate = (await crypto.subtle.exportKey("jwk", vapidPair.privateKey)).d;
    const phone = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const subscription = { endpoint: "https://push.example/real", expirationTime: null, keys: { p256dh: b64(await crypto.subtle.exportKey("raw", phone.publicKey)), auth: b64(crypto.getRandomValues(new Uint8Array(16))) } };
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 201 }); };
    try {
      const status = await webPushSender({ VAPID_SUBJECT: "https://minimal.test", VAPID_PUBLIC_KEY: vapidPublic, VAPID_PRIVATE_KEY: vapidPrivate })(subscription, { title: "t", body: "b" });
      expect(status).toBe(201);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(seen[0].url).toBe("https://push.example/real");
    expect(seen[0].init.headers["content-encoding"]).toBe("aes128gcm");
    expect(seen[0].init.headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(seen[0].init.body.byteLength).toBeGreaterThan(100);
  });
});

describe("push API", () => {
  it("needs a session", async () => {
    for (const [path, method] of [["/api/push/key", "GET"], ["/api/push/subscribe", "POST"], ["/api/push/unsubscribe", "POST"], ["/api/push/test", "POST"]]) {
      const res = await SELF.fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(SUB) : undefined });
      expect(res.status, path).toBe(401);
    }
  });

  it("stores and removes a phone's subscription; rejects bad ones", async () => {
    await env.DB.prepare("DELETE FROM push_subscriptions").run();
    const login = await SELF.fetch(BASE + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: PASSCODE }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const post = (path, body) => SELF.fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
    expect((await post("/api/push/subscribe", { endpoint: "http://insecure.example", keys: SUB.keys })).status).toBe(400);
    expect((await post("/api/push/subscribe", { endpoint: SUB.endpoint, keys: { p256dh: "<script>", auth: "x" } })).status).toBe(400);
    expect((await post("/api/push/subscribe", SUB)).status).toBe(200);
    expect((await post("/api/push/subscribe", SUB)).status).toBe(200); // same phone again: still one row
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first()).n).toBe(1);
    expect((await post("/api/push/unsubscribe", { endpoint: SUB.endpoint })).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first()).n).toBe(0);
  });
});

describe("before the push keys are set", () => {
  it("does nothing and does not claim the day", async () => {
    const result = await runReminder({ DB: env.DB }, at("20:45"));
    expect(result.reason).toBe("push keys are not set up");
    expect(await env.DB.prepare("SELECT 1 FROM reminder_log").first()).toBeNull();
  });
});
