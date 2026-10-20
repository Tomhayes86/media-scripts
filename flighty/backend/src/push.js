// Minimal Web Push (RFC 8291 / VAPID) implementation for Cloudflare Workers.
// Runs on WebCrypto — no Node crypto, no external libs.
//
// Generate a VAPID keypair once:
//   npx web-push generate-vapid-keys
// Then:
//   wrangler secret put VAPID_PUBLIC_KEY
//   wrangler secret put VAPID_PRIVATE_KEY
//   wrangler secret put VAPID_SUBJECT   # e.g. "mailto:you@example.com"

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
function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

async function importVapidPrivate(b64uPrivate, b64uPublic) {
  const d = b64uToBytes(b64uPrivate);
  const raw = b64uToBytes(b64uPublic); // 65 bytes, uncompressed
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64u(d),
    x: bytesToB64u(x),
    y: bytesToB64u(y),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function signVapidJwt(audience, env) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
  const enc = (obj) =>
    bytesToB64u(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidPrivate(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    )
  );
  return `${signingInput}.${bytesToB64u(sig)}`;
}

// aes128gcm content encoding for Web Push (RFC 8188 + RFC 8291).
async function encryptPayload(payloadStr, uaPublicB64u, authSecretB64u) {
  const payload = new TextEncoder().encode(payloadStr);
  const uaPublic = b64uToBytes(uaPublicB64u); // 65 bytes
  const authSecret = b64uToBytes(authSecretB64u);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Generate ephemeral ECDH keypair (server side).
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const asPublicRaw = concat(
    new Uint8Array([0x04]),
    b64uToBytes(asPublicJwk.x),
    b64uToBytes(asPublicJwk.y)
  );

  const uaPubKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPubKey },
      kp.privateKey,
      256
    )
  );

  const hkdfImport = (bytes) =>
    crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits']);

  // PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info\0<ua_public><as_public>", 32)
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\0'),
    uaPublic,
    asPublicRaw
  );
  const prkKey = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo },
      await hkdfImport(sharedBits),
      256
    )
  );

  // CEK = HKDF(salt, PRK_key, "Content-Encoding: aes128gcm\0", 16)
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
      },
      await hkdfImport(prkKey),
      128
    )
  );

  // NONCE = HKDF(salt, PRK_key, "Content-Encoding: nonce\0", 12)
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode('Content-Encoding: nonce\0'),
      },
      await hkdfImport(prkKey),
      96
    )
  );

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ]);

  // Plaintext = payload || 0x02 (record delimiter, last record).
  const plaintext = concat(payload, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintext)
  );

  // Header block: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concat(header, ciphertext);
}

export async function sendPush(subscription, payload, env) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapidJwt(audience, env);

  const body = await encryptPayload(
    JSON.stringify(payload),
    subscription.p256dh,
    subscription.auth
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });
  return res;
}
