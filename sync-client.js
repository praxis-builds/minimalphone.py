// Phone-side sync engine for Minimal. No DOM access: storage, fetch and the
// app's state are passed in, so the same code runs in the browser and in tests.
//
// How it works
// - Every local save calls track(): the new state is compared with the last
//   known state and each changed record becomes an op in the outbox.
// - sync() uploads the outbox, then downloads what changed on the server since
//   the last cursor and merges it, keeping any local edit that is still queued.
// - firstSync() uploads the whole local copy once (with the records' own
//   timestamps, so older local data cannot overwrite newer server data).
//   Op ids are derived from the data, so running it again changes nothing.
import { diff, explode, implode, opId, recordId, stable } from "./sync-core.js";

const MAX_BATCH = 500;

export class SignedOutError extends Error {
  constructor() { super("Sign in to sync."); this.name = "SignedOutError"; }
}

export class SyncClient {
  /**
   * @param {object} o
   * @param {(path: string, init: RequestInit) => Promise<Response>} o.fetch  same-origin fetch
   * @param {{get(): Promise<object|null>, set(v: object): Promise<void>}} o.store  persistent sync state
   * @param {() => number} [o.now]
   */
  constructor({ fetch, store, now = () => Date.now() }) {
    this.fetch = fetch;
    this.store = store;
    this.now = now;
    this.base = new Map();
    this.state = null;
    this.running = null;
  }

  async load() {
    const saved = (await this.store.get()) || {};
    this.state = {
      deviceId: saved.deviceId || newDeviceId(),
      cursor: saved.cursor || 0,
      outbox: Array.isArray(saved.outbox) ? saved.outbox : [],
      offset: saved.offset || 0,
      uploadStartedAt: saved.uploadStartedAt || null,
      firstSyncAt: saved.firstSyncAt || null,
      lastSyncAt: saved.lastSyncAt || null,
      signedIn: Boolean(saved.signedIn),
      conflicts: Array.isArray(saved.conflicts) ? saved.conflicts : [],
    };
    await this.save();
    return this.state;
  }

  save() { return this.store.set(this.state); }
  serverNow() { return Math.round(this.now() + (this.state?.offset || 0)); }
  get pending() { return this.state?.outbox.length || 0; }

  /** Remember the current local state without queueing anything. */
  setBase(config, days) { this.base = explode(config, days); }

  /** Queue what changed since the last call. Returns the new ops. */
  async track(config, days) {
    const next = explode(config, days);
    if (!this.state.uploadStartedAt) { this.base = next; return []; }
    const ops = diff(this.base, next, this.serverNow());
    this.base = next;
    if (ops.length) { this.enqueue(ops); await this.save(); }
    return ops;
  }

  enqueue(ops) {
    const index = new Map(this.state.outbox.map((op, i) => [recordId(op.entity, op.key), i]));
    for (const op of ops) {
      const full = { ...op, id: opId(this.state.deviceId, op) };
      const at = index.get(recordId(op.entity, op.key));
      // Only the latest queued edit per record needs to reach the server.
      if (at !== undefined && this.state.outbox[at].updatedAt <= full.updatedAt) this.state.outbox[at] = full;
      else if (at === undefined) { index.set(recordId(op.entity, op.key), this.state.outbox.length); this.state.outbox.push(full); }
    }
  }

  async request(path, body) {
    let res;
    try {
      res = await this.fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), credentials: "same-origin" });
    } catch {
      const e = new Error("Offline. Changes are saved on this phone and will sync later."); e.offline = true; throw e;
    }
    if (res.status === 401) {
      if (this.state.signedIn) { this.state.signedIn = false; await this.save(); }
      throw new SignedOutError();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `Sync failed (${res.status}).`); e.status = res.status; throw e; }
    return data;
  }

  async login(passcode) {
    const sentAt = this.now();
    const data = await this.request("/api/login", { passcode });
    // Learn the server's clock before the first upload stamps anything.
    if (Number.isFinite(data.serverTime)) this.state.offset = Math.round(data.serverTime - (sentAt + this.now()) / 2);
    this.state.signedIn = true;
    await this.save();
  }

  async logout(everywhere = false) {
    try { await this.request(everywhere ? "/api/logout-all" : "/api/logout"); } catch (e) { if (!(e instanceof SignedOutError)) throw e; }
    this.state.signedIn = false;
    await this.save();
  }

  /**
   * Upload the whole local copy once, then sync. `fresh` (a new phone with no
   * records) uploads nothing and only downloads. Safe to run more than once.
   */
  async firstSync(getState, applyState, { fresh = false } = {}) {
    if (!this.state.uploadStartedAt) {
      this.state.uploadStartedAt = this.serverNow();
      this.state.cursor = 0;
    }
    const { config, days } = getState();
    const records = explode(config, days);
    // Local timestamps are in this phone's clock: shift them to server time and
    // never past "now", so an edit made right after the upload always wins.
    const cap = this.serverNow();
    const stamp = (at) => Math.max(0, Math.min(Math.round(at + (this.state.offset || 0)), cap));
    if (!fresh) this.enqueue([...records.values()].map((r) => ({ entity: r.entity, key: r.key, value: r.value, deleted: false, updatedAt: stamp(r.updatedAt) })));
    // Everything on the phone now is either queued or (on a new phone) deliberately not uploaded.
    this.base = records;
    await this.save();
    const result = await this.sync(getState, applyState);
    this.state.firstSyncAt = this.state.firstSyncAt || this.serverNow();
    await this.save();
    return result;
  }

  /** Upload the outbox and merge server changes. One run at a time. */
  sync(getState, applyState) {
    if (!this.running) this.running = this.#run(getState, applyState).finally(() => { this.running = null; });
    return this.running;
  }

  async #run(getState, applyState) {
    let applied = 0, rounds = 0;
    do {
      // Queue any local edit not tracked yet, so it is uploaded now and protected from the merge below.
      { const { config, days } = getState(); await this.track(config, days); }
      const batch = this.state.outbox.slice(0, MAX_BATCH);
      const sentAt = this.now();
      const data = await this.request("/api/sync", { deviceId: this.state.deviceId, cursor: this.state.cursor, ops: batch });
      const receivedAt = this.now();
      this.state.offset = Math.round(data.serverTime - (sentAt + receivedAt) / 2);
      const sent = new Set(batch.map((op) => op.id));
      this.state.outbox = this.state.outbox.filter((op) => !sent.has(op.id));

      if (data.records.length) {
        const { config, days } = getState();
        await this.track(config, days);
        const map = explode(config, days);
        const queued = new Map(this.state.outbox.map((op) => [recordId(op.entity, op.key), op]));
        let changed = false;
        for (const rec of data.records) {
          const id = recordId(rec.entity, rec.key);
          const mine = queued.get(id);
          if (mine && mine.updatedAt >= rec.updatedAt) continue; // our newer edit is still on its way up
          if (rec.deleted) { changed = map.delete(id) || changed; continue; }
          const current = map.get(id);
          if (current && stable(current.value) === stable(rec.value)) continue; // already have it (often our own edit)
          map.set(id, { entity: rec.entity, key: rec.key, value: rec.value, updatedAt: rec.updatedAt });
          changed = true;
        }
        if (changed) {
          const next = implode(map, config, days);
          const final = (await applyState(next)) || next;
          this.base = explode(final.config, final.days);
          applied += data.records.length;
        }
      }
      this.state.cursor = data.cursor;
      this.state.conflicts = data.openConflicts || [];
      this.state.lastSyncAt = this.serverNow();
      this.state.signedIn = true;
      await this.save();
      if (++rounds > 100) break;
      if (!data.more && !this.state.outbox.length) break;
    } while (true);
    return { applied, pending: this.state.outbox.length, conflicts: this.state.conflicts };
  }

  async dismissConflicts(ids) {
    await this.request("/api/conflicts/seen", { ids });
    this.state.conflicts = this.state.conflicts.filter((c) => !ids.includes(c.id));
    await this.save();
  }

  /** Forget everything sync-related on this device (used by "Clear all data"). */
  async reset() {
    this.base = new Map();
    this.state = { deviceId: newDeviceId(), cursor: 0, outbox: [], offset: 0, uploadStartedAt: null, firstSyncAt: null, lastSyncAt: null, signedIn: false, conflicts: [] };
    await this.save();
  }
}

function newDeviceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "dev_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

if (typeof window !== "undefined") window.MinimalSyncClient = { SyncClient, SignedOutError };
