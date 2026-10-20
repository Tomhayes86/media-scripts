# Flighty-lite

Self-hosted flight tracker. Replaces paid apps like Flighty / App in the Air.

## What it does (MVP)

- Add a flight by number + date (e.g. `BA286` on `2026-08-01`)
- Fetch schedule (origin, destination, times, gate, terminal, status)
- Live position tracking on a map when the flight is airborne
- Live-tracking toggle per flight (off by default to save battery / rate limit)
- Poll for status changes (delays, gate/terminal changes)
- Web Push notifications on change (iOS 16.4+ requires "Add to Home Screen")

## Stack

- **Backend**: Cloudflare Workers + D1 (SQLite)
- **Frontend**: Vanilla PWA + Leaflet for the map
- **Data**:
  - [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) — live positions (free, anonymous OK; auth boosts limits)
  - [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) on RapidAPI — schedules/status (free tier ~500/mo)
  - Optional fallback: [AviationStack](https://aviationstack.com) free tier

## Cost

$0/mo at personal scale (a handful of flights per year, occasional queries).

## Layout

```
flighty/
  backend/           # Cloudflare Worker
    src/
      index.js       # Router
      db.js          # D1 helpers
      providers/     # Flight-data adapters (aerodatabox, opensky, aviationstack)
      push.js        # Web Push (VAPID)
    schema.sql
    wrangler.toml
  frontend/          # Static PWA
    index.html
    app.js
    styles.css
    manifest.json
    sw.js            # Service worker
```

## Deploy (later)

```
cd backend
npx wrangler d1 create flighty
# copy the id into wrangler.toml
npx wrangler d1 execute flighty --file=schema.sql
npx wrangler secret put RAPIDAPI_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy

cd ../frontend
npx wrangler pages deploy .
```
