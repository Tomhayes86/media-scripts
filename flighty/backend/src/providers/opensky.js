// OpenSky Network REST API — free.
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// Two useful endpoints:
//   /states/all?icao24={hex}        — current state of one aircraft by ICAO24
//   /flights/aircraft?icao24=...    — recent flights for an aircraft
//
// Anonymous is rate-limited to a handful of requests/minute; with a free account
// (OPENSKY_USERNAME/OPENSKY_PASSWORD) limits are much higher and older data is
// available.

const BASE = 'https://opensky-network.org/api';

function authHeader(env) {
  if (!env.OPENSKY_USERNAME || !env.OPENSKY_PASSWORD) return {};
  const token = btoa(`${env.OPENSKY_USERNAME}:${env.OPENSKY_PASSWORD}`);
  return { Authorization: `Basic ${token}` };
}

// Returns the current state vector for a single aircraft, or null.
// icao24 must be the 6-hex-digit ICAO 24-bit transponder address, lowercase.
export async function currentState(icao24, env) {
  if (!icao24) return null;
  const res = await fetch(
    `${BASE}/states/all?icao24=${encodeURIComponent(icao24.toLowerCase())}`,
    { headers: authHeader(env) }
  );
  if (!res.ok) throw new Error(`OpenSky ${res.status}`);
  const data = await res.json();
  const s = data?.states?.[0];
  if (!s) return null;
  // See https://openskynetwork.github.io/opensky-api/rest.html#state-vectors
  return {
    ts: new Date((s[3] || s[4] || Date.now() / 1000) * 1000).toISOString(),
    callsign: (s[1] || '').trim() || null,
    lon: s[5],
    lat: s[6],
    altitude_m: s[7],
    on_ground: !!s[8],
    velocity_ms: s[9],
    heading: s[10],
  };
}
