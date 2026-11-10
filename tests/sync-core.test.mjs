// Unit tests for the shared sync rules. Run with: node --test tests/sync-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diff, explode, implode, opId, stable, wins } from "../sync-core.js";

const sample = JSON.parse(readFileSync(new URL("./fixtures/sample-data.json", import.meta.url), "utf8"));

test("exploding and rebuilding three months of data loses nothing that syncs", () => {
  const records = explode(sample.config, sample.days);
  const rebuilt = implode(records, sample.config, []);
  const content = (c, d) => stable([...explode(c, d, { stampZero: true })]);
  assert.equal(content(rebuilt.config, rebuilt.days), content(sample.config, sample.days));
  assert.equal(rebuilt.days.length, sample.days.length);
});

test("device-only settings never become records", () => {
  const ids = [...explode({ ...sample.config, focusTimer: { running: true }, lastExportAt: "x" }, []).keys()];
  assert.ok(!ids.some((id) => /focusTimer|lastExportAt|lastDate|weekendMigratedAt/.test(id)));
});

test("changing one item produces exactly one op", () => {
  const before = explode(sample.config, sample.days);
  const days = structuredClone(sample.days);
  days[3].priorities[0].status = days[3].priorities[0].status === "done" ? "skipped" : "done";
  const ops = diff(before, explode(sample.config, days), 123);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].entity, "item");
  assert.equal(ops[0].updatedAt, 123);
});

test("removing an item produces a tombstone", () => {
  const before = explode(sample.config, sample.days);
  const days = structuredClone(sample.days);
  const [removed] = days[0].priorities.splice(0, 1);
  const ops = diff(before, explode(sample.config, days), 5);
  assert.ok(ops.some((op) => op.deleted && op.key.endsWith(`|priority|${removed.id}`)));
});

test("op ids are deterministic, so the same upload is recognised twice", () => {
  const op = { entity: "note", key: "2026-11-09", value: "Quiet day", deleted: false, updatedAt: 99 };
  assert.equal(opId("dev_a", op), opId("dev_a", { ...op }));
  assert.notEqual(opId("dev_a", op), opId("dev_a", { ...op, value: "Busy day" }));
  assert.match(opId("dev_a", op), /^[0-9a-f]{16}$/);
});

test("latest edit wins; ties are broken by device id, never randomly", () => {
  assert.equal(wins({ updatedAt: 2, deviceId: "a" }, { updatedAt: 1, deviceId: "z" }), true);
  assert.equal(wins({ updatedAt: 1, deviceId: "z" }, { updatedAt: 2, deviceId: "a" }), false);
  assert.equal(wins({ updatedAt: 1, deviceId: "b" }, { updatedAt: 1, deviceId: "a" }), true);
  assert.equal(wins({ updatedAt: 1, deviceId: "a" }, { updatedAt: 1, deviceId: "a" }), false);
});

test("permanent priorities sync as their own setting and survive a round trip", () => {
  const permanent = [{ id: "perm-plan", text: "Plan the day", order: 0, activeFrom: "2026-11-01", retiredOn: null }];
  const records = explode({ ...sample.config, permanent }, []);
  assert.deepEqual(records.get("setting:permanent").value, permanent);
  assert.deepEqual(implode(records, {}, []).config.permanent, permanent);
});
