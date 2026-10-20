// APNs (Apple Push Notification service) sender for Cloudflare Workers.
// Uses token-based auth (.p8 key, ES256 JWT) — no cert wrangling.
//
// Secrets to set with `wrangler secret put`:
//   APNS_TEAM_ID       — 10-char Team ID from your Apple Developer account
//   APNS_KEY_ID        — 10-char Key ID for the .p8 auth key
//   APNS_KEY_P8        — the FULL contents of AuthKey_XXXXXX.p8, including BEGIN/END lines
//   APNS_BUNDLE_ID     — e.g. com.you.flighty
//   APNS_USE_SANDBOX   — "1" for the dev push env (api.sandbox.push.apple.com), else prod
//
// Cache the signed JWT in module scope; APNs accepts a token for up to 60 min
// but requires a fresh one at least every 20 min. We refresh every 45 min.

let cachedJwt = null;
let cachedJwtExp = 0;

function b64uToBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Parse a PEM PKCS#8 EC private key (P-256) into a CryptoKey.
async function importP8(p8Pem) {
  const body = p8Pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function getJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now < cachedJwtExp - 60) return cachedJwt;

  const header = { alg: 'ES256', kid: env.APNS_KEY_ID, typ: 'JWT' };
  const payload = { iss: env.APNS_TEAM_ID, iat: now };
  const enc = (o) =>
    bytesToB64u(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const key = await importP8(env.APNS_KEY_P8);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    )
  );

  cachedJwt = `${signingInput}.${bytesToB64u(sig)}`;
  cachedJwtExp = now + 45 * 60;
  return cachedJwt;
}

function host(env) {
  return env.APNS_USE_SANDBOX === '1'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
}

// Send a standard push (alert or background) to a device token.
// pushType: 'alert' | 'background' | 'liveactivity'
export async function sendApns(env, deviceToken, aps, extra = {}, opts = {}) {
  if (!env.APNS_TEAM_ID || !env.APNS_KEY_ID || !env.APNS_KEY_P8) return null;
  const jwt = await getJwt(env);
  const pushType = opts.pushType || 'alert';
  const topic =
    pushType === 'liveactivity'
      ? `${env.APNS_BUNDLE_ID}.push-type.liveactivity`
      : env.APNS_BUNDLE_ID;

  const body = JSON.stringify({ aps, ...extra });
  const headers = {
    Authorization: `bearer ${jwt}`,
    'apns-topic': topic,
    'apns-push-type': pushType,
    'Content-Type': 'application/json',
  };
  if (opts.priority) headers['apns-priority'] = String(opts.priority);
  if (opts.expiration != null) headers['apns-expiration'] = String(opts.expiration);
  if (opts.collapseId) headers['apns-collapse-id'] = opts.collapseId;

  const res = await fetch(`${host(env)}/3/device/${deviceToken}`, {
    method: 'POST',
    headers,
    body,
  });
  return res;
}

// Convenience: alert notification.
export function sendAlert(env, deviceToken, { title, body, data, threadId, collapseId }) {
  const aps = {
    alert: { title, body },
    sound: 'default',
    'thread-id': threadId,
    'mutable-content': 1,
  };
  return sendApns(env, deviceToken, aps, data || {}, {
    pushType: 'alert',
    priority: 10,
    collapseId,
  });
}

// Convenience: background/silent push, e.g. to nudge the app to refresh.
export function sendBackground(env, deviceToken, data = {}) {
  return sendApns(env, deviceToken, { 'content-available': 1 }, data, {
    pushType: 'background',
    priority: 5,
  });
}

// Live Activity update. `contentState` mirrors your ActivityAttributes.ContentState.
// `event` is 'update' or 'end'. `staleDate` and `dismissalDate` are unix seconds.
export function sendLiveActivity(env, pushToken, contentState, opts = {}) {
  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event: opts.event || 'update',
    'content-state': contentState,
  };
  if (opts.staleDate) aps['stale-date'] = opts.staleDate;
  if (opts.dismissalDate) aps['dismissal-date'] = opts.dismissalDate;
  if (opts.alert) aps.alert = opts.alert;
  return sendApns(env, pushToken, aps, {}, {
    pushType: 'liveactivity',
    priority: opts.priority || 10,
  });
}
