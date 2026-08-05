// Bulk history import — CSV, TSV, or one-flight-per-line plain text.
//
// Designed to be forgiving. Real-world exports contain metadata banners,
// repeated header rows, summary/total rows, blank separators, PNR columns
// that look like flight numbers, and currency codes. We do a header-based
// pass first, then a cell-scanning fallback for any row that didn't produce
// a candidate, and always report a `skipped` count so the UI can show it.
//
// Returns: { flights: [{flight_number, flight_date, ...optional}], skipped, totalRows }

const HEADER_ALIASES = {
  flight_number: ['flight_number','flight','number','flightnumber','flightno','no','flt','flightnr'],
  flight_date:   ['flight_date','date','departure_date','dep_date','flightdate','depdate'],
  origin_iata:      ['origin','from','origin_iata','from_iata','origincode','fromcode','departureairport','departureiata'],
  destination_iata: ['destination','to','destination_iata','to_iata','destcode','tocode','arrivalairport','arrivaliata'],
  origin_name:      ['origin_name','from_name','departure','departureairportname'],
  destination_name: ['destination_name','to_name','arrival','arrivalairportname'],
  airline_name:  ['airline','airline_name','carrier','operator'],
  airline_iata:  ['airline_iata','airlinecode','iata'],
  aircraft_reg:  ['registration','reg','tail','aircraft_registration','tailnumber'],
  scheduled_dep: ['scheduled_dep','departure_time','dep_time','std','sdt','depart'],
  scheduled_arr: ['scheduled_arr','arrival_time','arr_time','sta','sat','arrive'],
  actual_dep:    ['actual_dep','atd','departed'],
  actual_arr:    ['actual_arr','ata','arrived'],
  status:        ['status'],
};

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// Currency ISO 4217 codes we should never mistake for airline codes.
const CURRENCIES = new Set([
  'USD','GBP','EUR','JPY','CHF','CAD','AUD','CNY','INR','ZAR','HKD','SGD',
  'NZD','KRW','THB','MXN','BRL','SEK','NOK','DKK','PLN','ISK','RUB','TRY',
  'ILS','AED','SAR','EGP','HUF','CZK','RON','MYR','IDR','PHP','VND','ARS',
]);

// Two-char words that show up in body text and would false-match as an airline.
const CODE_BLACKLIST = new Set([
  'ID','PO','IN','BY','OF','TO','AT','IS','MR','AM','PM','OK','CO','NO','ON',
  'DR','MS','JR','SR','II','LT','SO','ME','GO','WE','US','UK',
]);

// A flight number token: 2-char alphanumeric prefix (must contain a letter),
// then 1-4 digits. Anchored at word boundaries.
const FLIGHT_RE = /\b([A-Z0-9]{2})\s?(\d{1,4})\b/g;

// Preamble/summary rows we skip outright.
const SKIP_ROW_RE = /^(?:total|summary|exported|generated|report|updated|created|source|filter|from:|to:|note[s]?:|passenger[s]?:|user:|account:)/i;

export function parseBulk(input) {
  const text = normalize(input);
  if (!text) return { flights: [], skipped: 0, totalRows: 0 };

  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  if (/[,\t]/.test(firstLine)) return parseTabular(text);
  return parsePlain(text);
}

// ---------- normalization ----------

function normalize(s) {
  let t = String(s ?? '');
  // Strip UTF-8 BOM
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  // Non-breaking spaces → regular
  t = t.replace(/ /g, ' ');
  // Smart quotes / dashes → ASCII (helps date parsing)
  t = t.replace(/[‘’]/g, "'")
       .replace(/[“”]/g, '"')
       .replace(/[–—−]/g, '-');
  return t;
}

// ---------- plain-text (line-based) ----------

function parsePlain(text) {
  const flights = [];
  let total = 0, skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    total++;
    if (line.startsWith('#') || SKIP_ROW_RE.test(line)) { skipped++; continue; }
    const rec = extractFromCells([line]);
    if (rec) flights.push(rec);
    else skipped++;
  }
  return { flights, skipped, totalRows: total };
}

// ---------- CSV / TSV ----------

function parseTabular(text) {
  const rows = csvRows(text);
  const nonEmpty = rows.filter((r) => r.some((c) => c && c.trim()));
  const total = nonEmpty.length;
  let skipped = 0;
  const flights = [];
  const seen = new Set();

  // Find header rows by looking for a row where ≥ 2 cells match known aliases.
  let colMap = null; // Map<colIndex, canonicalField>
  let headerRowIdx = -1;

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => !c || !c.trim())) continue;

    // A row of pure metadata/preamble
    const joined = cells.join(' ').trim();
    if (SKIP_ROW_RE.test(joined)) { skipped++; continue; }
    if (joined.startsWith('#')) { skipped++; continue; }

    // Attempt header detection on every non-empty row — some exports repeat
    // headers per year/section.
    const maybeMap = tryHeaderMap(cells);
    if (maybeMap && maybeMap.size >= 2) {
      colMap = maybeMap;
      headerRowIdx = r;
      continue;
    }

    // Data row: use current colMap if any, otherwise fall through to scan.
    let rec = null;
    if (colMap) rec = extractFromMappedRow(cells, colMap);
    if (!rec) rec = extractFromCells(cells);
    if (!rec) { skipped++; continue; }

    const key = `${rec.flight_number}|${rec.flight_date}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    flights.push(rec);
  }

  // If we never found a header, headerRowIdx stays -1 and we relied entirely
  // on the fallback scan — that's fine and expected for messy inputs.
  void headerRowIdx;
  return { flights, skipped, totalRows: total };
}

function tryHeaderMap(cells) {
  const map = new Map();
  for (let i = 0; i < cells.length; i++) {
    const h = (cells[i] ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!h) continue;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => a.replace(/[^a-z0-9]+/g, '') === h)) {
        // Don't overwrite an existing mapping — the first matching column wins.
        if (!map.has(i)) map.set(i, field);
        break;
      }
    }
  }
  return map;
}

function extractFromMappedRow(cells, colMap) {
  const rec = {};
  for (const [i, field] of colMap) {
    const raw = (cells[i] ?? '').trim();
    if (!raw) continue;
    if (field === 'flight_number')      rec[field] = normalizeFlightNumber(raw);
    else if (field === 'flight_date')   rec[field] = normalizeDate(raw);
    else if (field.endsWith('_iata'))   rec[field] = raw.toUpperCase().slice(0, 3);
    else                                 rec[field] = raw;
  }
  // If the flight_number cell was a PNR-shaped false-positive, or was empty,
  // let extractFromCells try harder over all cells for the flight number.
  if (!rec.flight_number || !rec.flight_date) {
    const scanned = extractFromCells(cells);
    if (!scanned) return null;
    rec.flight_number ||= scanned.flight_number;
    rec.flight_date   ||= scanned.flight_date;
  }
  if (!rec.flight_number || !rec.flight_date) return null;
  return rec;
}

// Cell-scanning fallback: hunt for the first plausible flight number
// AND the first plausible date across all cells of the row.
function extractFromCells(cells) {
  let number = null, date = null;
  for (const raw of cells) {
    const cell = String(raw ?? '').trim();
    if (!cell) continue;
    if (!number) number = normalizeFlightNumber(cell);
    if (!date)   date   = normalizeDate(cell);
    if (number && date) break;
  }
  // If we found neither by scanning cells whole, try scanning inside each cell
  // (helps rows like "BA286 dep 10:35 → 14:35 · 15 Mar 2024").
  if (!number || !date) {
    for (const raw of cells) {
      const cell = String(raw ?? '');
      if (!number) {
        FLIGHT_RE.lastIndex = 0;
        let m;
        while ((m = FLIGHT_RE.exec(cell.toUpperCase()))) {
          const code = m[1];
          if (isValidAirlineCode(code)) { number = `${code}${m[2]}`; break; }
        }
      }
      if (!date) date = findDateIn(cell);
      if (number && date) break;
    }
  }
  return (number && date) ? { flight_number: number, flight_date: date } : null;
}

// ---------- CSV row splitter ----------

// Handles quoted fields, doubled quotes, embedded newlines, and picks the
// separator (comma or tab) from the input.
function csvRows(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  const isTab = text.indexOf('\t') !== -1 && text.indexOf(',') === -1;
  const sep = isTab ? '\t' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === sep) { cur.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// ---------- token normalizers ----------

function normalizeFlightNumber(s) {
  const t = String(s).toUpperCase().trim();
  // Require the whole cell to be a flight number, not part of a longer string,
  // when using this path — full-cell match keeps PNRs at bay.
  const m = t.match(/^([A-Z0-9]{2})\s?(\d{1,4})$/);
  if (!m) return null;
  return isValidAirlineCode(m[1]) ? `${m[1]}${m[2]}` : null;
}

function isValidAirlineCode(code) {
  if (!/^[A-Z0-9]{2}$/.test(code)) return false;
  if (!/[A-Z]/.test(code)) return false;                // must contain a letter
  if (CURRENCIES.has(code)) return false;
  if (CODE_BLACKLIST.has(code)) return false;
  return true;
}

function normalizeDate(s) {
  const t = String(s).trim();
  if (!t) return null;
  // Whole-cell date first (stricter, avoids grabbing part of a longer string).
  const whole = tryDate(t);
  if (whole) return whole;
  return findDateIn(t);
}

function tryDate(t) {
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))
    return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/))) {
    const [_, a, b, y] = m;
    const A = +a, B = +b;
    const day = A > 12 ? A : (B > 12 ? B : A);
    const mon = A > 12 ? B : (B > 12 ? A : B);
    return `${y}-${pad(mon)}-${pad(day)}`;
  }
  if ((m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[1])}`;
  }
  if ((m = t.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[2])}`;
  }
  return null;
}

function findDateIn(s) {
  const patterns = [
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return tryDate(m[0]);
  }
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }
