-- APNs device tokens for standard alerts.
CREATE TABLE IF NOT EXISTS ios_devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_token TEXT NOT NULL UNIQUE,
  device_name  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Live Activity push tokens. Each Live Activity has its own token,
-- returned by ActivityKit when the activity starts (or updated).
-- flight_id links back to which flight the activity is for so the
-- server-side updater knows which contentState to push.
CREATE TABLE IF NOT EXISTS live_activities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id     INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  push_token    TEXT NOT NULL UNIQUE,
  device_id     INTEGER REFERENCES ios_devices(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_activities_flight ON live_activities (flight_id) WHERE ended_at IS NULL;
