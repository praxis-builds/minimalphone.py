-- Minimal sync database (Cloudflare D1). Single user.
-- Every synced piece of data is one row in `records`, keyed by (entity, key):
--   item     "<date>|<priority|planned|move>|<itemId>"  one item on one day
--   day      "<date>"                                    day flags (loggedAt, weekend, rollover…)
--   note     "<date>"                                    the day's conclusion
--   focus    "<sessionId>"                               one completed focus session
--   setting  "<name>"                                    profile, accent, moves, launchers, reminder…
--   registry "<itemId>"                                  item identity used by Patterns
-- The latest edit wins per row (updated_at, then device_id). `seq` is the server's change counter.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('schema_version', 1), ('seq', 0);

CREATE TABLE records (
  entity     TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value_json TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  device_id  TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  PRIMARY KEY (entity, key)
);
CREATE INDEX records_seq ON records (seq);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- One global counter (no IP addresses are stored).
CREATE TABLE login_lock (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  failures     INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
INSERT INTO login_lock (id, failures, window_start) VALUES (1, 0, 0);

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  last_sync_at INTEGER NOT NULL
);

-- Makes retried uploads harmless.
CREATE TABLE applied_ops (
  op_id      TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Both sides changed the same row since the uploading device last synced.
CREATE TABLE conflicts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT    NOT NULL,
  key         TEXT    NOT NULL,
  kept_json   TEXT,
  lost_json   TEXT,
  kept_device TEXT    NOT NULL,
  lost_device TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  seen_at     INTEGER
);

-- Used by the evening reminder (M3).
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  keys_json  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE reminder_log (
  local_date TEXT PRIMARY KEY,
  sent_at    INTEGER NOT NULL
);
