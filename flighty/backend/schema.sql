CREATE TABLE IF NOT EXISTS flights (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_number     TEXT NOT NULL,
  flight_date       TEXT NOT NULL,
  airline_iata      TEXT,
  airline_name      TEXT,
  origin_iata       TEXT,
  origin_name       TEXT,
  destination_iata  TEXT,
  destination_name  TEXT,
  scheduled_dep     TEXT,
  scheduled_arr     TEXT,
  estimated_dep     TEXT,
  estimated_arr     TEXT,
  actual_dep        TEXT,
  actual_arr        TEXT,
  status            TEXT,
  gate_dep          TEXT,
  gate_arr          TEXT,
  terminal_dep      TEXT,
  terminal_arr      TEXT,
  aircraft_reg      TEXT,
  aircraft_icao24   TEXT,
  live_tracking     INTEGER NOT NULL DEFAULT 0,
  last_synced       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (flight_number, flight_date)
);

CREATE INDEX IF NOT EXISTS idx_flights_date ON flights (flight_date);
CREATE INDEX IF NOT EXISTS idx_flights_live ON flights (live_tracking) WHERE live_tracking = 1;

CREATE TABLE IF NOT EXISTS flight_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id    INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,           -- 'delay', 'gate_change', 'status', 'position'
  detail       TEXT,                    -- freeform message
  before_val   TEXT,
  after_val    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_flight ON flight_events (flight_id, created_at DESC);

CREATE TABLE IF NOT EXISTS positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id    INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  ts           TEXT NOT NULL,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  altitude_m   REAL,
  velocity_ms  REAL,
  heading      REAL,
  on_ground    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_positions_flight_ts ON positions (flight_id, ts);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
