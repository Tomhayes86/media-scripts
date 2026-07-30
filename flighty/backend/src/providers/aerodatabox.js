// AeroDataBox via RapidAPI. Free plan: BASIC (~500 requests/month).
// Docs: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
//
// GET /flights/number/{flightNumber}/{date}
//   flightNumber: e.g. "BA286"
//   date:         "YYYY-MM-DD" (local departure date)

const BASE = 'https://aerodatabox.p.rapidapi.com';

export async function fetchFlight(flightNumber, dateYmd, env) {
  if (!env.RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set');
  const url = `${BASE}/flights/number/${encodeURIComponent(
    flightNumber
  )}/${dateYmd}?withAircraftImage=false&withLocation=false`;

  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
    },
  });

  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`AeroDataBox ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return null;
  return normalize(arr[0], flightNumber, dateYmd);
}

function normalize(raw, flightNumber, dateYmd) {
  const dep = raw.departure || {};
  const arr = raw.arrival || {};
  const aircraft = raw.aircraft || {};
  const airline = raw.airline || {};

  return {
    flight_number: (raw.number || flightNumber).replace(/\s+/g, ''),
    flight_date: dateYmd,
    airline_iata: airline.iata || null,
    airline_name: airline.name || null,
    origin_iata: dep.airport?.iata || null,
    origin_name: dep.airport?.name || null,
    destination_iata: arr.airport?.iata || null,
    destination_name: arr.airport?.name || null,
    scheduled_dep: dep.scheduledTime?.utc || null,
    scheduled_arr: arr.scheduledTime?.utc || null,
    estimated_dep: dep.predictedTime?.utc || dep.revisedTime?.utc || null,
    estimated_arr: arr.predictedTime?.utc || arr.revisedTime?.utc || null,
    actual_dep: dep.actualTime?.utc || null,
    actual_arr: arr.actualTime?.utc || null,
    status: (raw.status || '').toLowerCase() || null,
    gate_dep: dep.gate || null,
    gate_arr: arr.gate || null,
    terminal_dep: dep.terminal || null,
    terminal_arr: arr.terminal || null,
    aircraft_reg: aircraft.reg || null,
    aircraft_icao24: (aircraft.modeS || '').toLowerCase() || null,
  };
}
