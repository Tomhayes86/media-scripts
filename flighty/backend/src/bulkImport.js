// Bulk history import — CSV or one-flight-per-line plain text.
//
// Output: array of { flight_number, flight_date, ...optional prefilled fields }.
// The row's own fields are passed through so callers can insert them verbatim
// when the schedule provider has no data for the (usually old) date.

const HEADER_ALIASES = {
  flight_number: ['flight_number', 'flight', 'number', 'flightnumber', 'flightno', 'no', 'no.', 'flt', 'flightnr'],
  flight_date:   ['flight_date', 'date', 'departure_date', 'dep_date', 'flightdate', 'depdate'],
  origin_iata:      ['origin', 'from', 'origin_iata', 'from_iata', 'origincode', 'fromcode', 'departureairport', 'departureiata'],
  destination_iata: ['destination', 'to', 'destination_iata', 'to_iata', 'destcode', 'tocode', 'arrivalairport', 'arrivaliata'],
  origin_name:      ['origin_name', 'from_name', 'departure', 'departureairportname'],
  destination_name: ['destination_name', 'to_name', 'arrival', 'arrivalairportname'],
  airline_name:  ['airline', 'airline_name', 'carrier', 'operator'],
  airline_iata:  ['airline_iata', 'airlinecode', 'iata'],
  aircraft_reg:  ['registration', 'reg', 'tail', 'aircraft_registration', 'tailnumber'],
  scheduled_dep: ['scheduled_dep', 'departure_time', 'dep_time', 'std', 'sdt', 'depart'],
  scheduled_arr: ['scheduled_arr', 'arrival_time', 'arr_time', 'sta', 'sat', 'arrive'],
  actual_dep:    ['actual_dep', 'atd', 'departed'],
  actual_arr:    ['actual_arr', 'ata', 'arrived'],
  status:        ['status'],
};

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

export function parseBulk(input) {
  const text = String(input || '').trim();
  if (!text) return [];

  // If it contains commas or tabs in the first line AND has more than one field,
  // treat as CSV/TSV. Otherwise fall back to plain-text parser.
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,\t]/.test(firstLine)) return parseCsv(text);
  return parsePlain(text);
}

// One-flight-per-line: `BA286 2024-03-15`  |  `BA286,2024-03-15`  |  `BA286 15 Mar 2024`
function parsePlain(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const tokens = line.split(/[\s,;]+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const number = normalizeFlightNumber(tokens[0]);
    const date = normalizeDate(tokens.slice(1).join(' '));
    if (number && date) out.push({ flight_number: number, flight_date: date });
  }
  return out;
}

function parseCsv(text) {
  const rows = csvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));
  // Map each CSV column index to a canonical field, if any.
  const colToField = new Map();
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => a.replace(/[^a-z0-9]+/g, '') === h)) {
        colToField.set(i, field);
        break;
      }
    }
  }

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => !c || !c.trim())) continue;
    const rec = {};
    for (const [i, field] of colToField) {
      const raw = (cells[i] ?? '').trim();
      if (!raw) continue;
      if (field === 'flight_number')      rec[field] = normalizeFlightNumber(raw);
      else if (field === 'flight_date')   rec[field] = normalizeDate(raw);
      else if (field.endsWith('_iata'))   rec[field] = raw.toUpperCase().slice(0, 3);
      else                                 rec[field] = raw;
    }
    if (rec.flight_number && rec.flight_date) out.push(rec);
  }
  return out;
}

// Minimal RFC-ish CSV row splitter — supports quoted fields with embedded commas
// and doubled quotes. Also handles TSV (tab-separated).
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
      } else {
        field += ch;
      }
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

function normalizeFlightNumber(s) {
  const m = String(s).toUpperCase().match(/([A-Z0-9]{2})\s?(\d{1,4})/);
  return m ? `${m[1]}${m[2]}` : null;
}

// Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, "15 Mar 2024", "March 15, 2024".
function normalizeDate(s) {
  const t = String(s).trim();
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

function pad(n) { return String(n).padStart(2, '0'); }
