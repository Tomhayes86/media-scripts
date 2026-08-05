# Importing flight history

Bulk-add past (or future) flights from a CSV, TSV, or plain-text list. Works with:

- **Flighty** trip export
- **App in the Air** history export
- Any spreadsheet you've kept manually
- One-flight-per-line paste from any source

## How to use

- **iPhone (PWA installed)**: tap the tray-arrow icon top-left → **Flight history (CSV)** → choose a file or paste.
- **Web**: tap the 📚 button next to the ✉︎ email import.
- **iOS native app**: tray-arrow → **Flight history (CSV)** → choose file or paste.
- **API** (for scripts):
  ```
  POST /api/import/bulk
  Content-Type: application/json
  { "raw": "<the full CSV or plain text>" }
  ```
  Response: `{ added: [...], skipped: N, totalRows: N }` — one row per parsed
  flight in `added`, plus how many input rows were skipped (metadata, blank
  separators, junk) and how many rows the parser saw in total.

## What counts as an accepted row

Every row needs a **flight number** and a **date**. Everything else is optional and used to prefill fields the schedule provider can't fetch for old flights.

### Minimum

```csv
flight_number,flight_date
BA286,2024-03-15
UA924,2024-04-22
```

### Recommended (works even when AeroDataBox has no historical data)

```csv
flight_number,flight_date,origin,destination,airline
BA286,2024-03-15,LHR,SFO,British Airways
UA924,2024-04-22,SFO,LHR,United Airlines
LH441,2023-11-04,FRA,IAH,Lufthansa
```

### Full Flighty-style export

```csv
Flight,Date,From,To,Airline,Aircraft,Registration,Departure,Arrival
BA286,2024-03-15,LHR,SFO,British Airways,Boeing 787-9,G-ZBKM,10:35,14:35
```

### Plain-text bulk paste (no header row)

```
BA286 2024-03-15
UA924 2024-04-22
LH441 15 Nov 2023
FR8351,12/11/2024
```

## Column-name matching (case-insensitive, punctuation-ignored)

| Field | Recognised header names |
|---|---|
| flight_number | `flight_number`, `flight`, `number`, `no.`, `flt` |
| flight_date | `flight_date`, `date`, `departure_date`, `dep_date` |
| origin_iata | `origin`, `from`, `origin_iata`, `departureairport` |
| destination_iata | `destination`, `to`, `destination_iata`, `arrivalairport` |
| airline_name | `airline`, `carrier`, `operator` |
| aircraft_reg | `registration`, `reg`, `tail` |
| scheduled_dep | `scheduled_dep`, `departure_time`, `dep_time`, `std`, `depart` |
| scheduled_arr | `scheduled_arr`, `arrival_time`, `arr_time`, `sta`, `arrive` |
| status | `status` |

## Date formats recognised

- `2024-03-15` (ISO)
- `15/03/2024`, `15-03-2024`, `15.03.2024` (UK/EU)
- `03/15/2024` (US — inferred when day > 12)
- `15 Mar 2024`, `15 March 2024`
- `March 15, 2024`, `Mar 15 2024`

## What each result row means

| status | meaning |
|---|---|
| `added` | Live schedule fetch succeeded; flight is fully hydrated |
| `added_manual` | Schedule provider had no data (usually historical) — inserted with just the columns you provided |
| `exists` | Already in your list; skipped |
| `not_found` | Line failed to parse into a `flight_number` + `date` pair |
| `error` | Something else went wrong (message shown) |

## Messy files are fine

The parser is deliberately forgiving. It'll cope with:

- Preamble rows: `Exported from Flighty on 2024-08-30`, `Total flights: 47`, `User: you@…`
- Blank rows and separator rows
- **Header rows repeated inside the file** (e.g. one per trip or per year)
- Rows with `Trip 1,,,,,` group labels
- PNRs / booking references in a `PNR` column (they won't be mistaken for a flight)
- Currency codes like `GBP450`, `USD1200` (won't be mistaken for a flight)
- Smart quotes, non-breaking spaces, en-dashes copied from a PDF
- Non-tabular junk lines like `Some note about my trip`
- UTF-8 BOM prefix from Windows-generated files

Each unrecognised row is silently skipped and counted; the response tells you
how many were skipped out of the total so you can spot-check if a number
looks off.

## Practical notes

- AeroDataBox BASIC's historical window is roughly the current + last 30 days for schedule data. Anything older comes back as `added_manual` — you'll get the flight row with whatever you provided, but no live status, gates, or aircraft.
- **Large imports** — the endpoint calls the schedule API once per flight. 200 rows is fine; 5,000 will exhaust your free tier. Cull to the flights you actually care about first.
- **Deduplication** is by `(flight_number, flight_date)`. Re-importing the same file is a no-op.
- Rows are inserted one at a time; a bad row in the middle doesn't stop the rest.
