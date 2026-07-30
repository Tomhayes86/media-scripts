// Provider-agnostic booking-email → flight extractor.
// Input: raw MIME string OR plain text OR just an .ics blob.
// Output: array of { flight_number, flight_date } candidates.
//
// Order of confidence, best to worst:
//   1. iCal VEVENT with a SUMMARY that looks like a flight, or an X-FLIGHT prop
//   2. Airline-specific text extractor (per-airline templates in ./airlines/)
//   3. Generic regex fallback over the whole text body
//
// We only produce the *identity* of the flight (number + date). All schedule
// details, gates, times, etc. come from the AeroDataBox schedule lookup once
// the flight is added — so the parser stays tiny and forgiving.

const IATA_FLIGHT_RE = /\b([A-Z0-9]{2})\s?(\d{1,4})\b/g;
// Common date shapes seen in booking emails.
const DATE_RES = [
  /\b(\d{4})-(\d{2})-(\d{2})\b/,                                // 2026-08-15
  /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/,                     // 15/08/2026 or 08/15/2026
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
];
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

export function parseEmail(raw) {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');

  // If it *looks* like MIME (has RFC 5322 headers followed by parts), walk it.
  const looksLikeMime = /\r?\n\r?\n/.test(text) && /^(From|Subject|Content-Type):/im.test(text);
  const parts = looksLikeMime ? walkMime(text) : [{ mime: 'text/plain', body: text, headers: {} }];

  const found = [];
  const seen = new Set();
  const add = (n, d, source) => {
    if (!n || !d) return;
    const key = `${n}|${d}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ flight_number: n, flight_date: d, source });
  };

  // 1. Prefer any ICS parts — they're the most structured.
  for (const p of parts) {
    if (p.mime === 'text/calendar' || p.mime === 'application/ics' || /BEGIN:VCALENDAR/i.test(p.body)) {
      for (const c of parseIcs(p.body)) add(c.flight_number, c.flight_date, 'ics');
    }
  }
  if (found.length) return found;

  // 2. Airline templates over the largest text/html or text/plain part.
  const body = pickBestBody(parts);
  for (const tpl of AIRLINE_TEMPLATES) {
    for (const c of tpl.extract(body)) add(c.flight_number, c.flight_date, tpl.name);
  }
  if (found.length) return found;

  // 3. Generic fallback — for each flight-like token in the body, find the
  // nearest date and pair them.
  for (const c of genericExtract(body)) add(c.flight_number, c.flight_date, 'generic');
  return found;
}

// ------- MIME walking (RFC 2045) -------

function walkMime(raw) {
  const parts = [];
  const [headerBlock, ...rest] = raw.split(/\r?\n\r?\n/);
  const body = rest.join('\n\n');
  const headers = parseHeaders(headerBlock);
  const ct = headers['content-type'] || 'text/plain';
  if (/^multipart\//i.test(ct)) {
    const boundary = (ct.match(/boundary="?([^";]+)"?/i) || [])[1];
    if (!boundary) return [{ mime: 'text/plain', body, headers }];
    const chunks = body.split(new RegExp(`--${escapeRe(boundary)}(?:--)?`, 'g'))
      .map((c) => c.trim())
      .filter(Boolean);
    for (const chunk of chunks) parts.push(...walkMime(chunk));
  } else {
    const mime = (ct.split(';')[0] || 'text/plain').trim().toLowerCase();
    const enc = (headers['content-transfer-encoding'] || '7bit').toLowerCase();
    let decoded = body;
    if (enc === 'quoted-printable') decoded = decodeQP(body);
    else if (enc === 'base64') decoded = decodeB64(body.replace(/\s+/g, ''));
    if (mime === 'text/html') decoded = stripHtml(decoded);
    parts.push({ mime, body: decoded, headers });
  }
  return parts;
}

function parseHeaders(block) {
  const out = {};
  const lines = block.split(/\r?\n/);
  let curKey = null, curVal = '';
  const flush = () => { if (curKey) out[curKey.toLowerCase()] = curVal.trim(); };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && curKey) { curVal += ' ' + line.trim(); continue; }
    flush();
    const idx = line.indexOf(':');
    if (idx < 0) { curKey = null; continue; }
    curKey = line.slice(0, idx);
    curVal = line.slice(idx + 1);
  }
  flush();
  return out;
}

function decodeQP(s) {
  return s
    .replace(/=(?:\r\n|\n)/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function decodeB64(s) {
  try {
    const bin = atob(s);
    // Best-effort UTF-8 decode
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch { return s; }
}
function stripHtml(s) {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function pickBestBody(parts) {
  const text = parts.filter((p) => p.mime === 'text/plain').map((p) => p.body).join('\n');
  if (text.trim().length > 100) return text;
  return parts.map((p) => p.body).join('\n');
}

// ------- iCal parsing -------

function parseIcs(ics) {
  const out = [];
  const events = ics.split(/BEGIN:VEVENT/i).slice(1);
  for (const ev of events) {
    const chunk = ev.split(/END:VEVENT/i)[0];
    const unfolded = chunk.replace(/\r?\n[ \t]/g, '');
    const get = (k) => {
      const m = unfolded.match(new RegExp(`^${k}(?:;[^:]*)?:(.*)$`, 'im'));
      return m ? m[1].trim() : null;
    };
    const summary = get('SUMMARY') || '';
    const dtstart = get('DTSTART') || get('DTSTART;VALUE=DATE') || '';
    const description = get('DESCRIPTION') || '';
    const xflight = get('X-FLIGHT-NUMBER') || get('X-FLIGHTNUMBER');

    const number = xflight || firstFlightNumber(summary) || firstFlightNumber(description);
    const date = icsDate(dtstart);
    if (number && date) out.push({ flight_number: number, flight_date: date });
  }
  return out;
}

function icsDate(v) {
  if (!v) return null;
  // Handles 20260815T120000Z, 20260815T120000, 20260815, 2026-08-15
  const m = v.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function firstFlightNumber(s) {
  IATA_FLIGHT_RE.lastIndex = 0;
  const m = IATA_FLIGHT_RE.exec(s || '');
  if (!m) return null;
  const code = m[1];
  // Reject things that clearly aren't flight numbers
  if (/^(ID|PO|IN|BY|OF|TO|AT|IS|MR|AM|PM|OK|CO|USD|GBP|EUR)$/.test(code)) return null;
  return `${code}${m[2]}`;
}

// ------- Airline templates -------

const AIRLINE_TEMPLATES = [
  {
    name: 'ba',
    // British Airways: "Your booking BA286 on 15 Aug 2026"
    extract(body) {
      const out = [];
      const re = /\b(BA\d{2,4})\b[\s\S]{0,120}?\b(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1], flight_date: d });
      }
      return out;
    },
  },
  {
    name: 'easyjet',
    extract(body) {
      const out = [];
      const re = /\b(U2\s?\d{3,4}|EZY\d{3,4})\b[\s\S]{0,120}?\b(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|\d{4}-\d{2}-\d{2})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1].replace(/\s+/g, ''), flight_date: d });
      }
      return out;
    },
  },
  {
    name: 'ryanair',
    extract(body) {
      const out = [];
      const re = /\b(FR\d{3,4})\b[\s\S]{0,120}?\b(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1], flight_date: d });
      }
      return out;
    },
  },
  {
    name: 'lufthansa',
    extract(body) {
      const out = [];
      const re = /\b(LH\s?\d{2,4})\b[\s\S]{0,120}?\b(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|\d{4}-\d{2}-\d{2})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1].replace(/\s+/g, ''), flight_date: d });
      }
      return out;
    },
  },
  {
    name: 'ual',
    extract(body) {
      const out = [];
      const re = /\b(UA\s?\d{1,4})\b[\s\S]{0,120}?\b([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1].replace(/\s+/g, ''), flight_date: d });
      }
      return out;
    },
  },
  {
    name: 'delta',
    extract(body) {
      const out = [];
      const re = /\b(DL\s?\d{1,4})\b[\s\S]{0,120}?\b([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/g;
      let m;
      while ((m = re.exec(body))) {
        const d = normalizeDate(m[2]);
        if (d) out.push({ flight_number: m[1].replace(/\s+/g, ''), flight_date: d });
      }
      return out;
    },
  },
];

// ------- Generic fallback -------

function genericExtract(body) {
  const out = [];
  const flightMatches = [];
  IATA_FLIGHT_RE.lastIndex = 0;
  let m;
  while ((m = IATA_FLIGHT_RE.exec(body))) {
    const code = m[1];
    if (/^(ID|PO|IN|BY|OF|TO|AT|IS|MR|AM|PM|OK|CO|USD|GBP|EUR|USDT|VAT)$/.test(code)) continue;
    // Ignore boarding-time-esque tokens where the "number" is really a room/gate
    flightMatches.push({ idx: m.index, num: `${code}${m[2]}` });
  }

  const dateMatches = [];
  for (const re of DATE_RES) {
    const g = new RegExp(re.source, 'gi');
    let dm;
    while ((dm = g.exec(body))) {
      const d = normalizeDateMatch(dm);
      if (d) dateMatches.push({ idx: dm.index, date: d });
    }
  }
  if (!dateMatches.length) return out;

  for (const f of flightMatches) {
    // Nearest date within 500 chars.
    let best = null, bestDist = Infinity;
    for (const d of dateMatches) {
      const dist = Math.abs(d.idx - f.idx);
      if (dist < bestDist && dist < 500) { bestDist = dist; best = d; }
    }
    if (best) out.push({ flight_number: f.num, flight_date: best.date });
  }
  return out;
}

function normalizeDate(s) {
  if (!s) return null;
  for (const re of DATE_RES) {
    const m = s.match(new RegExp(re.source, 'i'));
    if (m) return normalizeDateMatch(m);
  }
  return null;
}

function normalizeDateMatch(m) {
  // m[0] is the raw match. We inspect m to figure out ordering.
  const raw = m[0];
  // yyyy-mm-dd
  let x = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (x) return `${x[1]}-${x[2]}-${x[3]}`;
  // dd/mm/yyyy or mm/dd/yyyy — assume dd/mm/yyyy if day>12
  x = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (x) {
    const [_, a, b, y] = x;
    const A = Number(a), B = Number(b);
    const day = A > 12 ? A : (B > 12 ? B : A);
    const mon = A > 12 ? B : (B > 12 ? A : B);
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // "15 Aug 2026"
  x = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (x) {
    const mon = MONTHS[x[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    return `${x[3]}-${String(mon).padStart(2, '0')}-${String(x[1]).padStart(2, '0')}`;
  }
  // "August 15, 2026"
  x = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (x) {
    const mon = MONTHS[x[1].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    return `${x[3]}-${String(mon).padStart(2, '0')}-${String(x[2]).padStart(2, '0')}`;
  }
  return null;
}
