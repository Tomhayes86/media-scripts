import * as db from './db.js';
import { fetchFlight as aeroFetch } from './providers/aerodatabox.js';
import { currentState as openskyState } from './providers/opensky.js';
import { sendPush } from './push.js';
import { sendAlert as apnsAlert, sendLiveActivity as apnsLiveActivity } from './apns.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

const err = (msg, status = 400) => json({ error: msg }, status);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '');

    try {
      if (p === '/api/flights' && request.method === 'GET') {
        return json(await db.listFlights(env.DB));
      }

      if (p === '/api/flights' && request.method === 'POST') {
        const body = await request.json();
        const number = (body.flight_number || '').toUpperCase().replace(/\s+/g, '');
        const date = body.flight_date;
        if (!number || !date) return err('flight_number and flight_date required');

        const existing = await db.findFlight(env.DB, number, date);
        if (existing) return json(existing);

        const fetched = await aeroFetch(number, date, env);
        if (!fetched) return err('Flight not found', 404);
        const id = await db.insertFlight(env.DB, { ...fetched, last_synced: new Date().toISOString() });
        return json(await db.getFlight(env.DB, id));
      }

      const flightMatch = p.match(/^\/api\/flights\/(\d+)$/);
      if (flightMatch) {
        const id = Number(flightMatch[1]);
        if (request.method === 'GET') {
          const f = await db.getFlight(env.DB, id);
          return f ? json(f) : err('Not found', 404);
        }
        if (request.method === 'DELETE') {
          await db.deleteFlight(env.DB, id);
          return json({ ok: true });
        }
        if (request.method === 'PATCH') {
          const body = await request.json();
          if (typeof body.live_tracking === 'boolean') {
            await db.setLiveTracking(env.DB, id, body.live_tracking);
          }
          return json(await db.getFlight(env.DB, id));
        }
      }

      const refreshMatch = p.match(/^\/api\/flights\/(\d+)\/refresh$/);
      if (refreshMatch && request.method === 'POST') {
        const id = Number(refreshMatch[1]);
        const f = await db.getFlight(env.DB, id);
        if (!f) return err('Not found', 404);
        await refreshFlight(env, f);
        return json(await db.getFlight(env.DB, id));
      }

      const eventsMatch = p.match(/^\/api\/flights\/(\d+)\/events$/);
      if (eventsMatch && request.method === 'GET') {
        return json(await db.listEvents(env.DB, Number(eventsMatch[1])));
      }

      const posMatch = p.match(/^\/api\/flights\/(\d+)\/positions$/);
      if (posMatch && request.method === 'GET') {
        return json(await db.listPositions(env.DB, Number(posMatch[1])));
      }

      if (p === '/api/push/vapid-public' && request.method === 'GET') {
        return json({ key: env.VAPID_PUBLIC_KEY || null });
      }

      if (p === '/api/push/subscribe' && request.method === 'POST') {
        const body = await request.json();
        if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
          return err('invalid subscription');
        }
        await db.insertPushSub(env.DB, body);
        return json({ ok: true });
      }

      if (p === '/api/push/unsubscribe' && request.method === 'POST') {
        const body = await request.json();
        if (body?.endpoint) await db.deletePushSub(env.DB, body.endpoint);
        return json({ ok: true });
      }

      if (p === '/api/push/test' && request.method === 'POST') {
        const subs = await db.listPushSubs(env.DB);
        await notify(env, subs, { title: 'Flighty-lite', body: 'Push works!' });
        return json({ ok: true, sent: subs.length });
      }

      // ---- iOS APNs ----
      if (p === '/api/ios/register' && request.method === 'POST') {
        const body = await request.json();
        if (!body?.device_token) return err('device_token required');
        const dev = await db.upsertIosDevice(env.DB, body.device_token, body.device_name);
        return json(dev);
      }

      if (p === '/api/ios/unregister' && request.method === 'POST') {
        const body = await request.json();
        if (body?.device_token) await db.deleteIosDevice(env.DB, body.device_token);
        return json({ ok: true });
      }

      if (p === '/api/ios/test' && request.method === 'POST') {
        const devices = await db.listIosDevices(env.DB);
        for (const d of devices) {
          await apnsAlert(env, d.device_token, {
            title: 'Flighty-lite',
            body: 'APNs works!',
          });
        }
        return json({ ok: true, sent: devices.length });
      }

      // ---- Live Activity registration ----
      const laStart = p.match(/^\/api\/flights\/(\d+)\/live-activity$/);
      if (laStart && request.method === 'POST') {
        const flightId = Number(laStart[1]);
        const body = await request.json();
        if (!body?.push_token) return err('push_token required');
        await db.upsertLiveActivity(env.DB, flightId, body.push_token, body.device_id || null);
        return json({ ok: true });
      }
      if (laStart && request.method === 'DELETE') {
        const body = await request.json();
        if (body?.push_token) await db.endLiveActivity(env.DB, body.push_token);
        return json({ ok: true });
      }

      return err('Not found', 404);
    } catch (e) {
      return err(e.message || String(e), 500);
    }
  },

  async scheduled(event, env, ctx) {
    // Fires on cron. Poll live-tracked flights every run;
    // refresh schedules of upcoming flights on hourly runs only.
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    ctx.waitUntil(
      (async () => {
        const live = await db.liveFlights(env.DB);
        for (const f of live) await pollLive(env, f);
        if (minute === 0) {
          const upcoming = await db.upcomingFlights(env.DB, 48);
          for (const f of upcoming) await refreshFlight(env, f);
        }
      })()
    );
  },
};

async function refreshFlight(env, f) {
  const fresh = await aeroFetch(f.flight_number, f.flight_date, env);
  if (!fresh) return;

  const diffs = diffFlight(f, fresh);
  const patch = { ...fresh, last_synced: new Date().toISOString() };
  await db.updateFlight(env.DB, f.id, patch);
  const merged = { ...f, ...patch };

  if (diffs.length) {
    for (const d of diffs) {
      await db.insertEvent(env.DB, f.id, d.kind, d.detail, d.before, d.after);
    }
    const title = `${f.flight_number} update`;
    const body = diffs.map((d) => d.detail).join(' · ');

    // Web Push (browsers / PWA)
    const subs = await db.listPushSubs(env.DB);
    await notify(env, subs, { title, body, data: { flightId: f.id } });

    // APNs (native iOS)
    const devices = await db.listIosDevices(env.DB);
    for (const dev of devices) {
      try {
        const res = await apnsAlert(env, dev.device_token, {
          title,
          body,
          data: { flightId: f.id },
          threadId: `flight-${f.id}`,
          collapseId: `flight-${f.id}`,
        });
        if (res && (res.status === 400 || res.status === 410)) {
          await db.deleteIosDevice(env.DB, dev.device_token);
        }
      } catch (_) {}
    }
  }

  // Always push a Live Activity update if any are running for this flight.
  const activities = await db.activeLiveActivitiesForFlight(env.DB, f.id);
  if (activities.length) {
    const state = liveActivityState(merged);
    const isFinal =
      merged.status && ['landed', 'arrived', 'cancelled'].includes(merged.status.toLowerCase());
    for (const a of activities) {
      try {
        const res = await apnsLiveActivity(env, a.push_token, state, {
          event: isFinal ? 'end' : 'update',
          staleDate: Math.floor(Date.now() / 1000) + 15 * 60,
          dismissalDate: isFinal ? Math.floor(Date.now() / 1000) + 3600 : undefined,
          alert: diffs.length
            ? { title: `${f.flight_number}`, body: diffs.map((d) => d.detail).join(' · ') }
            : undefined,
        });
        if (isFinal) await db.endLiveActivity(env.DB, a.push_token);
        if (res && (res.status === 400 || res.status === 410)) {
          await db.endLiveActivity(env.DB, a.push_token);
        }
      } catch (_) {}
    }
  }
}

function liveActivityState(f) {
  return {
    status: f.status || 'scheduled',
    scheduledDep: f.scheduled_dep,
    scheduledArr: f.scheduled_arr,
    estimatedDep: f.estimated_dep,
    estimatedArr: f.estimated_arr,
    gateDep: f.gate_dep,
    gateArr: f.gate_arr,
    terminalDep: f.terminal_dep,
    terminalArr: f.terminal_arr,
    originIata: f.origin_iata,
    destinationIata: f.destination_iata,
  };
}

async function pollLive(env, f) {
  if (!f.aircraft_icao24) return; // no tail to track
  try {
    const state = await openskyState(f.aircraft_icao24, env);
    if (!state || state.lat == null || state.lon == null) return;
    await db.insertPosition(env.DB, f.id, state);
  } catch (_) {
    // Rate-limited or transient — swallow, next tick will retry.
  }
}

function diffFlight(a, b) {
  const out = [];
  const check = (field, kind, label) => {
    const before = a[field];
    const after = b[field];
    if (before && after && before !== after) {
      out.push({ kind, detail: `${label}: ${before} → ${after}`, before, after });
    } else if (!before && after) {
      out.push({ kind, detail: `${label} set: ${after}`, before: null, after });
    }
  };
  check('gate_dep', 'gate_change', 'Departure gate');
  check('gate_arr', 'gate_change', 'Arrival gate');
  check('terminal_dep', 'gate_change', 'Departure terminal');
  check('terminal_arr', 'gate_change', 'Arrival terminal');
  check('status', 'status', 'Status');
  if (
    a.estimated_dep &&
    b.estimated_dep &&
    Math.abs(new Date(b.estimated_dep) - new Date(a.estimated_dep)) > 5 * 60_000
  ) {
    out.push({
      kind: 'delay',
      detail: `Departure now ${b.estimated_dep}`,
      before: a.estimated_dep,
      after: b.estimated_dep,
    });
  }
  if (
    a.estimated_arr &&
    b.estimated_arr &&
    Math.abs(new Date(b.estimated_arr) - new Date(a.estimated_arr)) > 5 * 60_000
  ) {
    out.push({
      kind: 'delay',
      detail: `Arrival now ${b.estimated_arr}`,
      before: a.estimated_arr,
      after: b.estimated_arr,
    });
  }
  return out;
}

async function notify(env, subs, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  for (const s of subs) {
    try {
      const res = await sendPush(s, payload, env);
      if (res.status === 404 || res.status === 410) {
        await db.deletePushSub(env.DB, s.endpoint);
      }
    } catch (_) {
      // best-effort
    }
  }
}
