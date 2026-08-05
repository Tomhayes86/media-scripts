# Deploying Flighty-lite

All the free tiers you need. Assumes you have Node ≥18 and a Cloudflare account.

## 1. Get API keys

- **AeroDataBox** on RapidAPI: sign up at https://rapidapi.com/aedbx-aedbx/api/aerodatabox → subscribe to the **BASIC** (free) plan → copy your X-RapidAPI-Key.
- **OpenSky Network** (optional but recommended): create an account at https://opensky-network.org/index.php?option=com_users&view=registration. Anonymous works, but authenticated calls have much higher rate limits.
- **VAPID keypair** for Web Push:
  ```
  npx web-push generate-vapid-keys
  ```

## 2. Backend (Cloudflare Worker + D1)

```bash
cd flighty/backend
npm i -g wrangler
wrangler login

wrangler d1 create flighty
# copy the "database_id" from the output into wrangler.toml
wrangler d1 execute flighty --file=schema.sql

wrangler secret put RAPIDAPI_KEY
wrangler secret put OPENSKY_USERNAME   # optional
wrangler secret put OPENSKY_PASSWORD   # optional
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT      # e.g. mailto:you@example.com

wrangler deploy
```

Note the deployed URL, e.g. `https://flighty.<you>.workers.dev`.

## 3. Frontend (Cloudflare Pages)

Edit `frontend/app.js` and set `API` to your Worker URL:
```js
const API = 'https://flighty.<you>.workers.dev';
```

Add two PNG icons (192×192 and 512×512) named `icon-192.png` / `icon-512.png` in `frontend/`. Any square logo works.

Deploy:
```bash
cd flighty/frontend
wrangler pages deploy .
```

## 4. Install on iPhone

1. Open the Pages URL in **Safari** (not Chrome — iOS push only works from Safari-installed PWAs).
2. Share → **Add to Home Screen**.
3. Open the icon from your home screen.
4. Tap **Enable alerts**.
5. Add a flight. Toggle live tracking on when you want position updates.

## 5. Local dev

```bash
cd flighty/backend
wrangler dev              # runs on http://127.0.0.1:8787

cd flighty/frontend
python3 -m http.server 8080
# open http://localhost:8080
```

## Known limits on the free path

- **AeroDataBox free** = ~500 calls/month. The hourly cron polls only flights inside a 48h window and stops once status is `landed`/`cancelled`, so a handful of trips per month fits comfortably. If you exceed it, either upgrade the plan or reduce the cron cadence.
- **OpenSky anonymous** = tight rate limits; only track a couple of flights at once. An account raises the limits and lets you track history.
- **iOS Web Push** requires **iOS 16.4+** *and* the PWA must be installed via Add to Home Screen — regular Safari tabs cannot receive push.
