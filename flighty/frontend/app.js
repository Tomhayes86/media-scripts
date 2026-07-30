// Point this at your deployed Worker.
// For local dev with `wrangler dev`, use http://127.0.0.1:8787.
const API =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8787'
    : location.origin.replace(/^https?:\/\//, 'https://api.');
  // ^^ change 'api.' to whatever subdomain you deploy the Worker on,
  // or just hardcode: const API = 'https://flighty.<you>.workers.dev';

const api = {
  list: () => fetch(`${API}/api/flights`).then(r => r.json()),
  add: (flight_number, flight_date) =>
    fetch(`${API}/api/flights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flight_number, flight_date }),
    }).then(async r => (r.ok ? r.json() : Promise.reject(await r.json()))),
  get: id => fetch(`${API}/api/flights/${id}`).then(r => r.json()),
  del: id => fetch(`${API}/api/flights/${id}`, { method: 'DELETE' }),
  refresh: id => fetch(`${API}/api/flights/${id}/refresh`, { method: 'POST' }).then(r => r.json()),
  patch: (id, body) =>
    fetch(`${API}/api/flights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()),
  importEmail: raw =>
    fetch(`${API}/api/import/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    }).then(r => r.json()),
  events: id => fetch(`${API}/api/flights/${id}/events`).then(r => r.json()),
  positions: id => fetch(`${API}/api/flights/${id}/positions`).then(r => r.json()),
  vapid: () => fetch(`${API}/api/push/vapid-public`).then(r => r.json()),
  subscribe: sub =>
    fetch(`${API}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    }),
};

const $ = sel => document.querySelector(sel);
const list = $('#flight-list');
const detail = $('#detail');
const detailBody = $('#detail-body');
const pushBtn = $('#push-btn');

// ---- Flight list ----
async function render() {
  const flights = await api.list();
  list.innerHTML = '';
  if (!flights.length) {
    list.innerHTML = '<li style="color: var(--muted); text-align:center; padding:2rem;">No flights yet. Add one above.</li>';
    return;
  }
  for (const f of flights) list.appendChild(card(f));
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function card(f) {
  const li = document.createElement('li');
  li.className = 'card';
  const status = (f.status || 'scheduled').toLowerCase().replace(/\s+/g, '_');
  li.innerHTML = `
    <div class="row1">
      <span class="num">${f.flight_number}</span>
      <span class="status status-${status}">${status.replace(/_/g, ' ')}</span>
    </div>
    <div class="route">${f.origin_iata || '???'} → ${f.destination_iata || '???'}</div>
    <div class="times"><span>${fmtDate(f.scheduled_dep)}</span><span>${fmtTime(f.estimated_dep || f.scheduled_dep)} – ${fmtTime(f.estimated_arr || f.scheduled_arr)}</span></div>
    <div class="gate">${[f.terminal_dep && `T${f.terminal_dep}`, f.gate_dep && `Gate ${f.gate_dep}`].filter(Boolean).join(' · ') || ''}</div>
  `;
  li.addEventListener('click', () => openDetail(f.id));
  return li;
}

// ---- Add ----
$('#add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const number = $('#flight-number').value.trim().toUpperCase();
  const date = $('#flight-date').value;
  if (!number || !date) return;
  try {
    await api.add(number, date);
    $('#flight-number').value = '';
    render();
  } catch (err) {
    alert(err.error || 'Failed to add flight');
  }
});

// Default date to today.
$('#flight-date').valueAsDate = new Date();

// ---- Import from email ----
const importDlg = $('#import');
const importText = $('#import-text');
const importResult = $('#import-result');

$('#import-btn').addEventListener('click', () => {
  importText.value = '';
  importResult.textContent = '';
  importDlg.showModal();
});
importDlg.addEventListener('click', e => {
  if (e.target === importDlg || e.target.hasAttribute('data-close')) importDlg.close();
});
$('#import-cancel').addEventListener('click', () => importDlg.close());
$('#import-submit').addEventListener('click', async () => {
  const raw = importText.value.trim();
  if (!raw) return;
  importResult.textContent = 'Parsing…';
  try {
    const { added = [], error } = await api.importEmail(raw);
    if (error) { importResult.textContent = `Error: ${error}`; return; }
    if (!added.length) { importResult.textContent = 'No flights found in that email.'; return; }
    importResult.innerHTML = added.map(a =>
      `<div>${a.flight_number} on ${a.flight_date} — ${a.status}${a.error ? ` (${a.error})` : ''}</div>`
    ).join('');
    render();
  } catch (e) {
    importResult.textContent = `Error: ${e.message || e}`;
  }
});

// ---- Detail ----
let mapInstance = null;

async function openDetail(id) {
  detailBody.innerHTML = 'Loading…';
  detail.showModal();
  const [f, events, positions] = await Promise.all([
    api.get(id),
    api.events(id),
    api.positions(id),
  ]);
  renderDetail(f, events, positions);
}

detail.addEventListener('click', e => {
  if (e.target === detail || e.target.hasAttribute('data-close')) {
    detail.close();
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  }
});

function renderDetail(f, events, positions) {
  detailBody.innerHTML = `
    <h2>${f.flight_number} · ${f.airline_name || ''}</h2>
    <div class="meta">${f.origin_name || f.origin_iata} → ${f.destination_name || f.destination_iata}</div>
    <dl class="kv">
      <dt>Scheduled</dt><dd>${fmtTime(f.scheduled_dep)} → ${fmtTime(f.scheduled_arr)}</dd>
      <dt>Estimated</dt><dd>${fmtTime(f.estimated_dep)} → ${fmtTime(f.estimated_arr)}</dd>
      <dt>Actual</dt><dd>${fmtTime(f.actual_dep)} → ${fmtTime(f.actual_arr)}</dd>
      <dt>Status</dt><dd>${f.status || '—'}</dd>
      <dt>Dep gate</dt><dd>${[f.terminal_dep && `T${f.terminal_dep}`, f.gate_dep].filter(Boolean).join(' · ') || '—'}</dd>
      <dt>Arr gate</dt><dd>${[f.terminal_arr && `T${f.terminal_arr}`, f.gate_arr].filter(Boolean).join(' · ') || '—'}</dd>
      <dt>Aircraft</dt><dd>${f.aircraft_reg || '—'} ${f.aircraft_icao24 ? `(${f.aircraft_icao24})` : ''}</dd>
    </dl>

    <div class="toggle">
      <label for="live-toggle">Live tracking <span style="color:var(--muted);font-size:.8rem;display:block">Polls position every 2 min. Off to save battery.</span></label>
      <input type="checkbox" id="live-toggle" ${f.live_tracking ? 'checked' : ''} />
    </div>

    <div id="map"></div>

    <div class="btn-row">
      <button id="refresh-btn">Refresh</button>
      <button id="delete-btn" class="danger">Delete</button>
    </div>

    <h3 style="margin-top:1.5rem;">Recent updates</h3>
    <ul class="events">
      ${events.length
        ? events.map(ev => `<li>${ev.detail || ev.kind}<time>${new Date(ev.created_at).toLocaleString()}</time></li>`).join('')
        : '<li style="color:var(--muted)">No updates yet.</li>'}
    </ul>
  `;

  mountMap(f, positions);

  $('#live-toggle').addEventListener('change', async e => {
    await api.patch(f.id, { live_tracking: e.target.checked });
  });
  $('#refresh-btn').addEventListener('click', async () => {
    $('#refresh-btn').textContent = 'Refreshing…';
    await api.refresh(f.id);
    openDetail(f.id);
    render();
  });
  $('#delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this flight?')) return;
    await api.del(f.id);
    detail.close();
    render();
  });
}

function mountMap(f, positions) {
  const el = $('#map');
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  mapInstance = L.map(el).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 18,
  }).addTo(mapInstance);

  const line = positions.map(p => [p.lat, p.lon]);
  if (line.length) {
    L.polyline(line, { color: '#4c9aff', weight: 3 }).addTo(mapInstance);
    const last = positions[positions.length - 1];
    L.marker([last.lat, last.lon]).addTo(mapInstance);
    mapInstance.fitBounds(line, { padding: [30, 30] });
  }
}

// ---- Push ----
async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  await navigator.serviceWorker.register('sw.js');
  const { key } = await api.vapid().catch(() => ({}));
  if (!key) return; // backend not configured
  pushBtn.hidden = false;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) pushBtn.textContent = 'Alerts on';

  pushBtn.addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
      alert('Notifications are blocked in your browser settings.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key),
    });
    await api.subscribe(sub.toJSON());
    pushBtn.textContent = 'Alerts on';
  });
}

function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ---- Boot ----
render();
initPush();
setInterval(render, 60_000); // gentle auto-refresh of the list
