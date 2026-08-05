export async function listFlights(db) {
  const { results } = await db
    .prepare('SELECT * FROM flights ORDER BY flight_date DESC, scheduled_dep DESC')
    .all();
  return results;
}

export async function getFlight(db, id) {
  return db.prepare('SELECT * FROM flights WHERE id = ?').bind(id).first();
}

export async function findFlight(db, number, date) {
  return db
    .prepare('SELECT * FROM flights WHERE flight_number = ? AND flight_date = ?')
    .bind(number, date)
    .first();
}

export async function insertFlight(db, f) {
  const cols = Object.keys(f);
  const placeholders = cols.map(() => '?').join(',');
  const stmt = `INSERT INTO flights (${cols.join(',')}) VALUES (${placeholders})`;
  const result = await db
    .prepare(stmt)
    .bind(...cols.map((c) => f[c]))
    .run();
  return result.meta.last_row_id;
}

export async function updateFlight(db, id, patch) {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  const set = cols.map((c) => `${c} = ?`).join(', ');
  await db
    .prepare(`UPDATE flights SET ${set} WHERE id = ?`)
    .bind(...cols.map((c) => patch[c]), id)
    .run();
}

export async function deleteFlight(db, id) {
  await db.prepare('DELETE FROM flights WHERE id = ?').bind(id).run();
}

export async function setLiveTracking(db, id, on) {
  await db
    .prepare('UPDATE flights SET live_tracking = ? WHERE id = ?')
    .bind(on ? 1 : 0, id)
    .run();
}

export async function insertEvent(db, flightId, kind, detail, before, after) {
  await db
    .prepare(
      'INSERT INTO flight_events (flight_id, kind, detail, before_val, after_val) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(flightId, kind, detail || null, before ?? null, after ?? null)
    .run();
}

export async function listEvents(db, flightId, limit = 50) {
  const { results } = await db
    .prepare(
      'SELECT * FROM flight_events WHERE flight_id = ? ORDER BY created_at DESC LIMIT ?'
    )
    .bind(flightId, limit)
    .all();
  return results;
}

export async function insertPosition(db, flightId, p) {
  await db
    .prepare(
      'INSERT INTO positions (flight_id, ts, lat, lon, altitude_m, velocity_ms, heading, on_ground) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      flightId,
      p.ts,
      p.lat,
      p.lon,
      p.altitude_m ?? null,
      p.velocity_ms ?? null,
      p.heading ?? null,
      p.on_ground ? 1 : 0
    )
    .run();
}

export async function listPositions(db, flightId, limit = 500) {
  const { results } = await db
    .prepare(
      'SELECT ts, lat, lon, altitude_m, velocity_ms, heading, on_ground FROM positions WHERE flight_id = ? ORDER BY ts ASC LIMIT ?'
    )
    .bind(flightId, limit)
    .all();
  return results;
}

export async function liveFlights(db) {
  const { results } = await db
    .prepare('SELECT * FROM flights WHERE live_tracking = 1')
    .all();
  return results;
}

export async function upcomingFlights(db, withinHours = 48) {
  // Return anything scheduled within the next N hours whose status is not already 'landed'/'arrived'.
  const now = new Date();
  const soon = new Date(now.getTime() + withinHours * 3600_000);
  const nowIso = now.toISOString();
  const soonIso = soon.toISOString();
  const { results } = await db
    .prepare(
      `SELECT * FROM flights
       WHERE (status IS NULL OR status NOT IN ('landed','arrived','cancelled'))
         AND (scheduled_dep IS NULL OR scheduled_dep <= ?)
         AND (scheduled_arr IS NULL OR scheduled_arr >= ?)`
    )
    .bind(soonIso, nowIso)
    .all();
  return results;
}

export async function listPushSubs(db) {
  const { results } = await db
    .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions')
    .all();
  return results;
}

export async function insertPushSub(db, sub) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)'
    )
    .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth)
    .run();
}

export async function deletePushSub(db, endpoint) {
  await db
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .run();
}

// ---- iOS APNs devices ----

export async function upsertIosDevice(db, deviceToken, deviceName) {
  await db
    .prepare(
      `INSERT INTO ios_devices (device_token, device_name)
       VALUES (?, ?)
       ON CONFLICT(device_token) DO UPDATE SET device_name = excluded.device_name`
    )
    .bind(deviceToken, deviceName || null)
    .run();
  return db
    .prepare('SELECT * FROM ios_devices WHERE device_token = ?')
    .bind(deviceToken)
    .first();
}

export async function listIosDevices(db) {
  const { results } = await db.prepare('SELECT * FROM ios_devices').all();
  return results;
}

export async function deleteIosDevice(db, deviceToken) {
  await db
    .prepare('DELETE FROM ios_devices WHERE device_token = ?')
    .bind(deviceToken)
    .run();
}

// ---- Live Activity tokens ----

export async function upsertLiveActivity(db, flightId, pushToken, deviceId) {
  await db
    .prepare(
      `INSERT INTO live_activities (flight_id, push_token, device_id)
       VALUES (?, ?, ?)
       ON CONFLICT(push_token) DO UPDATE SET flight_id = excluded.flight_id, ended_at = NULL`
    )
    .bind(flightId, pushToken, deviceId || null)
    .run();
}

export async function endLiveActivity(db, pushToken) {
  await db
    .prepare(
      "UPDATE live_activities SET ended_at = datetime('now') WHERE push_token = ?"
    )
    .bind(pushToken)
    .run();
}

export async function activeLiveActivitiesForFlight(db, flightId) {
  const { results } = await db
    .prepare(
      'SELECT * FROM live_activities WHERE flight_id = ? AND ended_at IS NULL'
    )
    .bind(flightId)
    .all();
  return results;
}
