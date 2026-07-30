import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import cron from 'node-cron';
import webpush from 'web-push';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import * as db from './db.js';
import { fetchFlight as aeroFetch } from './providers/aerodatabox.js';
import { currentState as openskyState } from './providers/opensky.js';
import { parseEmail } from './email/parser.js';
import { parseBulk } from './bulkImport.js';
import { generatePass } from './pkpass.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Env / config ----
const env = {
  DB_PATH: process.env.DB_PATH || './data/flighty.db',
  PORT: Number(process.env.PORT || 8080),
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  OPENSKY_USERNAME: process.env.OPENSKY_USERNAME,
  OPENSKY_PASSWORD: process.env.OPENSKY_PASSWORD,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  FRONTEND_DIR: process.env.FRONTEND_DIR || resolve(__dirname, '../frontend'),
  PASSKIT_DIR: process.env.PASSKIT_DIR || '/app/data/passkit',
  PASS_TYPE_ID: process.env.PASS_TYPE_ID,
  TEAM_ID: process.env.TEAM_ID,
  ORG_NAME: process.env.ORG_NAME || 'Flighty',
};

if (!env.RAPIDAPI_KEY) {
  console.warn('⚠  RAPIDAPI_KEY not set — flight lookups will fail. See README.');
}
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
} else {
  console.warn('⚠  VAPID keys not set — push notifications disabled. Run `npm run gen-vapid`.');
}

const D = db.openDb(env.DB_PATH);
console.log(`→ SQLite: ${env.DB_PATH}`);

const app = new Hono();
app.use('/api/*', cors());

// ---- API ----

app.get('/api/flights', (c) => c.json(db.listFlights(D)));

app.post('/api/flights', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const number = String(body.flight_number || '').toUpperCase().replace(/\s+/g, '');
  const date = body.flight_date;
  if (!number || !date) return c.json({ error: 'flight_number and flight_date required' }, 400);
  const existing = db.findFlight(D, number, date);
  if (existing) return c.json(existing);
  const fetched = await aeroFetch(number, date, env);
  if (!fetched) return c.json({ error: 'Flight not found' }, 404);
  const id = db.insertFlight(D, { ...fetched, last_synced: new Date().toISOString() });
  return c.json(db.getFlight(D, id));
});

app.get('/api/flights/:id', (c) => {
  const f = db.getFlight(D, Number(c.req.param('id')));
  return f ? c.json(f) : c.json({ error: 'Not found' }, 404);
});

app.delete('/api/flights/:id', (c) => {
  db.deleteFlight(D, Number(c.req.param('id')));
  return c.json({ ok: true });
});

app.patch('/api/flights/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  if (typeof body.live_tracking === 'boolean') db.setLiveTracking(D, id, body.live_tracking);
  return c.json(db.getFlight(D, id));
});

app.post('/api/flights/:id/refresh', async (c) => {
  const id = Number(c.req.param('id'));
  const f = db.getFlight(D, id);
  if (!f) return c.json({ error: 'Not found' }, 404);
  await refreshFlight(f);
  return c.json(db.getFlight(D, id));
});

app.get('/api/flights/:id/events', (c) => c.json(db.listEvents(D, Number(c.req.param('id')))));
app.get('/api/flights/:id/positions', (c) => c.json(db.listPositions(D, Number(c.req.param('id')))));

app.get('/api/flights/:id/pkpass', async (c) => {
  const f = db.getFlight(D, Number(c.req.param('id')));
  if (!f) return c.json({ error: 'Not found' }, 404);
  if (!env.PASS_TYPE_ID || !env.TEAM_ID) return c.json({ error: 'Wallet passes not configured' }, 501);
  try {
    const buf = await generatePass(f, env);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename=${f.flight_number}.pkpass`,
      },
    });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/import/bulk', async (c) => {
  const ct = c.req.header('Content-Type') || '';
  let text = '';
  if (ct.includes('application/json')) {
    const body = await c.req.json();
    text = body?.raw || body?.text || '';
  } else {
    text = await c.req.text();
  }
  if (!text.trim()) return c.json({ error: 'empty body' }, 400);
  const added = await ingestBulk(text);
  return c.json({ added });
});

app.post('/api/import/email', async (c) => {
  const ct = c.req.header('Content-Type') || '';
  let text = '';
  if (ct.includes('application/json')) {
    const body = await c.req.json();
    text = body?.raw || body?.text || '';
  } else {
    text = await c.req.text();
  }
  if (!text.trim()) return c.json({ error: 'empty body' }, 400);
  const added = await ingestEmail(text);
  return c.json({ added });
});

// ---- Web Push ----

app.get('/api/push/vapid-public', (c) => c.json({ key: env.VAPID_PUBLIC_KEY || null }));

app.post('/api/push/subscribe', async (c) => {
  const body = await c.req.json();
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return c.json({ error: 'invalid subscription' }, 400);
  }
  db.insertPushSub(D, body);
  return c.json({ ok: true });
});

app.post('/api/push/unsubscribe', async (c) => {
  const body = await c.req.json();
  if (body?.endpoint) db.deletePushSub(D, body.endpoint);
  return c.json({ ok: true });
});

app.post('/api/push/test', async (c) => {
  const subs = db.listPushSubs(D);
  await notify(subs, { title: 'Flighty', body: 'Push works!' });
  return c.json({ ok: true, sent: subs.length });
});

// ---- Static frontend ----

app.use('/*', serveStatic({ root: env.FRONTEND_DIR }));
app.get('/', serveStatic({ path: join(env.FRONTEND_DIR, 'index.html') }));

// ---- Core logic (shared with the Worker path) ----

async function refreshFlight(f) {
  const fresh = await aeroFetch(f.flight_number, f.flight_date, env);
  if (!fresh) return;
  const diffs = diffFlight(f, fresh);
  db.updateFlight(D, f.id, { ...fresh, last_synced: new Date().toISOString() });
  if (diffs.length) {
    for (const d of diffs) db.insertEvent(D, f.id, d.kind, d.detail, d.before, d.after);
    const subs = db.listPushSubs(D);
    await notify(subs, {
      title: `${f.flight_number} update`,
      body: diffs.map((d) => d.detail).join(' · '),
      data: { flightId: f.id },
    });
  }
}

async function pollLive(f) {
  if (!f.aircraft_icao24) return;
  try {
    const state = await openskyState(f.aircraft_icao24, env);
    if (!state || state.lat == null || state.lon == null) return;
    db.insertPosition(D, f.id, state);
  } catch (_) {}
}

async function ingestBulk(raw) {
  const candidates = parseBulk(raw);
  const added = [];
  for (const c of candidates) {
    try {
      const existing = db.findFlight(D, c.flight_number, c.flight_date);
      if (existing) { added.push({ flight_number: c.flight_number, flight_date: c.flight_date, status: 'exists', id: existing.id }); continue; }
      const fetched = await aeroFetch(c.flight_number, c.flight_date, env).catch(() => null);
      const payload = fetched
        ? { ...fetched, last_synced: new Date().toISOString() }
        : bareFlight(c);
      const id = db.insertFlight(D, payload);
      added.push({
        flight_number: c.flight_number,
        flight_date: c.flight_date,
        status: fetched ? 'added' : 'added_manual',
        id,
      });
    } catch (e) {
      added.push({ flight_number: c.flight_number, flight_date: c.flight_date, status: 'error', error: e.message });
    }
  }
  return added;
}

function bareFlight(c) {
  const out = { flight_number: c.flight_number, flight_date: c.flight_date };
  for (const k of ['origin_iata','origin_name','destination_iata','destination_name',
                   'airline_iata','airline_name','aircraft_reg',
                   'scheduled_dep','scheduled_arr','actual_dep','actual_arr','status']) {
    if (c[k]) out[k] = c[k];
  }
  return out;
}

async function ingestEmail(raw) {
  const candidates = parseEmail(raw);
  const added = [];
  for (const c of candidates) {
    try {
      const existing = db.findFlight(D, c.flight_number, c.flight_date);
      if (existing) { added.push({ ...c, status: 'exists', id: existing.id }); continue; }
      const fetched = await aeroFetch(c.flight_number, c.flight_date, env);
      if (!fetched) { added.push({ ...c, status: 'not_found' }); continue; }
      const id = db.insertFlight(D, { ...fetched, last_synced: new Date().toISOString() });
      added.push({ ...c, status: 'added', id });
    } catch (e) {
      added.push({ ...c, status: 'error', error: e.message });
    }
  }
  return added;
}

function diffFlight(a, b) {
  const out = [];
  const check = (field, kind, label) => {
    const before = a[field], after = b[field];
    if (before && after && before !== after)
      out.push({ kind, detail: `${label}: ${before} → ${after}`, before, after });
    else if (!before && after)
      out.push({ kind, detail: `${label} set: ${after}`, before: null, after });
  };
  check('gate_dep', 'gate_change', 'Departure gate');
  check('gate_arr', 'gate_change', 'Arrival gate');
  check('terminal_dep', 'gate_change', 'Departure terminal');
  check('terminal_arr', 'gate_change', 'Arrival terminal');
  check('status', 'status', 'Status');
  const drift = (x, y) => Math.abs(new Date(x) - new Date(y)) > 5 * 60_000;
  if (a.estimated_dep && b.estimated_dep && drift(a.estimated_dep, b.estimated_dep))
    out.push({ kind: 'delay', detail: `Departure now ${b.estimated_dep}`, before: a.estimated_dep, after: b.estimated_dep });
  if (a.estimated_arr && b.estimated_arr && drift(a.estimated_arr, b.estimated_arr))
    out.push({ kind: 'delay', detail: `Arrival now ${b.estimated_arr}`, before: a.estimated_arr, after: b.estimated_arr });
  return out;
}

async function notify(subs, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) db.deletePushSub(D, s.endpoint);
    }
  }
}

// ---- Cron ----

// Every 2 minutes: poll live-tracked flights' positions.
cron.schedule('*/2 * * * *', async () => {
  for (const f of db.liveFlights(D)) await pollLive(f);
});
// Hourly: refresh schedules of anything upcoming.
cron.schedule('0 * * * *', async () => {
  for (const f of db.upcomingFlights(D, 48)) await refreshFlight(f);
});

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`✈  Flighty ready on http://0.0.0.0:${info.port}`);
});
