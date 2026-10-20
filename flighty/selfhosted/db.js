import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

// ---- Flights ----

export function listFlights(db) {
  return db.prepare('SELECT * FROM flights ORDER BY flight_date DESC, scheduled_dep DESC').all();
}
export function getFlight(db, id) {
  return db.prepare('SELECT * FROM flights WHERE id = ?').get(id);
}
export function findFlight(db, number, date) {
  return db.prepare('SELECT * FROM flights WHERE flight_number = ? AND flight_date = ?').get(number, date);
}
export function insertFlight(db, f) {
  const cols = Object.keys(f);
  const placeholders = cols.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT INTO flights (${cols.join(',')}) VALUES (${placeholders})`);
  const info = stmt.run(...cols.map((c) => f[c]));
  return info.lastInsertRowid;
}
export function updateFlight(db, id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const set = cols.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE flights SET ${set} WHERE id = ?`).run(...cols.map((c) => patch[c]), id);
}
export function deleteFlight(db, id) {
  db.prepare('DELETE FROM flights WHERE id = ?').run(id);
}
export function setLiveTracking(db, id, on) {
  db.prepare('UPDATE flights SET live_tracking = ? WHERE id = ?').run(on ? 1 : 0, id);
}
export function liveFlights(db) {
  return db.prepare('SELECT * FROM flights WHERE live_tracking = 1').all();
}
export function upcomingFlights(db, withinHours = 48) {
  const now = new Date();
  const soon = new Date(now.getTime() + withinHours * 3600_000);
  return db.prepare(`
    SELECT * FROM flights
     WHERE (status IS NULL OR status NOT IN ('landed','arrived','cancelled'))
       AND (scheduled_dep IS NULL OR scheduled_dep <= ?)
       AND (scheduled_arr IS NULL OR scheduled_arr >= ?)
  `).all(soon.toISOString(), now.toISOString());
}

// ---- Events ----

export function insertEvent(db, flightId, kind, detail, before, after) {
  db.prepare(
    'INSERT INTO flight_events (flight_id, kind, detail, before_val, after_val) VALUES (?, ?, ?, ?, ?)'
  ).run(flightId, kind, detail || null, before ?? null, after ?? null);
}
export function listEvents(db, flightId, limit = 50) {
  return db.prepare(
    'SELECT * FROM flight_events WHERE flight_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(flightId, limit);
}

// ---- Positions ----

export function insertPosition(db, flightId, p) {
  db.prepare(
    'INSERT INTO positions (flight_id, ts, lat, lon, altitude_m, velocity_ms, heading, on_ground) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    flightId,
    p.ts,
    p.lat,
    p.lon,
    p.altitude_m ?? null,
    p.velocity_ms ?? null,
    p.heading ?? null,
    p.on_ground ? 1 : 0
  );
}
export function listPositions(db, flightId, limit = 500) {
  return db.prepare(
    'SELECT ts, lat, lon, altitude_m, velocity_ms, heading, on_ground FROM positions WHERE flight_id = ? ORDER BY ts ASC LIMIT ?'
  ).all(flightId, limit);
}

// ---- Push subs ----

export function listPushSubs(db) {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all();
}
export function insertPushSub(db, sub) {
  db.prepare(
    'INSERT OR IGNORE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)'
  ).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}
export function deletePushSub(db, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}
