# Flighty — self-hosted on a Beelink (or any Linux/Windows mini-PC)

The iPhone build that **needs zero Apple approval and no Mac to build**: a PWA served from your Beelink, installed on your iPhone via Safari → Add to Home Screen. Runs full-screen like a native app, gets push notifications for gate/delay changes, works offline.

## Requirements

- Beelink (or any x86/ARM box) with Docker + Docker Compose
- Domain or Tailscale/Cloudflare Tunnel — see [HTTPS](#https-why-and-how)
- iPhone on iOS 16.4+ (for push notifications on the installed PWA)
- **No macOS. No Xcode. No Apple Developer account. No App Store submission.**

## Quick start

```bash
cd flighty/selfhosted
cp .env.example .env

# 1. Get an AeroDataBox API key from https://rapidapi.com/aedbx-aedbx/api/aerodatabox
#    Subscribe to BASIC (free). Paste it into .env as RAPIDAPI_KEY.

# 2. Generate a VAPID keypair for Web Push:
docker compose run --rm flighty npm run gen-vapid
#    Paste publicKey → VAPID_PUBLIC_KEY, privateKey → VAPID_PRIVATE_KEY in .env.

# 3. Start:
docker compose up -d
```

That's it. The container:
- Serves the PWA at `http://beelink-ip:8080`
- Runs a SQLite database in `./data/flighty.db` (persisted across restarts)
- Runs cron internally: polls upcoming flights hourly + live-tracked flights every 2 min
- Sends Web Push whenever anything changes

Check it's healthy:
```bash
docker compose logs -f
curl http://localhost:8080/api/flights   # should return []
```

## HTTPS — why and how

**iOS refuses to install a PWA over plain HTTP**, and Web Push only works from an HTTPS origin. You have three good free options — pick one:

### Option A — Tailscale (recommended for personal use)

Zero-config, private mesh VPN. Your Beelink and iPhone are both on the same tailnet; you get a real HTTPS certificate via `<hostname>.<your-tailnet>.ts.net`.

```bash
# On the Beelink:
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale cert flighty.<your-tailnet>.ts.net       # provisions the cert
sudo tailscale serve --https=443 http://localhost:8080  # reverse-proxies to the container
```

Install the Tailscale app on your iPhone, sign in, and open `https://flighty.<your-tailnet>.ts.net` in Safari.

**Best-fit choice** — private to your devices, no domain needed, no port forwarding, HTTPS handled.

### Option B — Cloudflare Tunnel (public URL, still free)

Exposes the Beelink over a real domain without opening ports. Requires a domain on Cloudflare (free plan is fine).

```bash
# On the Beelink:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared tunnel login
cloudflared tunnel create flighty
cloudflared tunnel route dns flighty flighty.yourdomain.com
cloudflared tunnel --url http://localhost:8080 run flighty
```

### Option C — Local self-signed cert (WiFi-only)

Least good — iOS Safari will complain and Web Push may not work at all. Only useful for a quick throwaway test on your home WiFi.

## Install on iPhone

1. On your iPhone, open the HTTPS URL from step above in **Safari** (not Chrome — iOS PWAs must be installed from Safari).
2. Tap the **Share** button → **Add to Home Screen**.
3. Open the new home-screen icon. It launches full-screen, no browser chrome.
4. Tap **Enable alerts** in the top-right → grant notification permission.
5. Tap **+** to add a flight (e.g. `BA286` on today's date), or ✉︎ to paste a booking confirmation email.

Whenever anything changes on that flight — gate, terminal, delay, status — your phone gets a push notification even when the app is closed.

## Updating

```bash
cd flighty
git pull
cd selfhosted
docker compose build --pull
docker compose up -d
```

Your SQLite data in `./data/` is preserved.

## Troubleshooting

- **`Enable alerts` button doesn't appear on iPhone** → the PWA isn't served over HTTPS, or VAPID keys aren't set. Check `docker compose logs` for warnings.
- **"Flight not found" on add** → `RAPIDAPI_KEY` missing/invalid, or you've burned through the ~500/mo free tier.
- **No live position on the map** → the aircraft's `icao24` transponder isn't known yet (comes from AeroDataBox after the first schedule fetch), or OpenSky rate-limited an anonymous request. Add `OPENSKY_USERNAME`/`PASSWORD` in `.env` and restart.
- **Notifications stop arriving** → iOS silently drops Web Push if the origin's cert becomes invalid or the domain changes. Reinstall the PWA (delete home-screen icon → re-add).

## What this build does NOT include

The self-hosted PWA is the strict subset of what runs without Apple. If you later want any of these, you're back to the SwiftUI build in `flighty/ios/`, which requires macOS + Xcode + your Apple Developer account:

- Live Activity / Dynamic Island cards on the Lock Screen
- Home Screen widgets
- Apple Wallet `.pkpass` integration
- Real background APNs (silent pushes when the app isn't running — Web Push on iOS is best-effort)

Everything else — flight tracking, live map, gate/delay diffs, notifications, email import, offline shell — works identically to the native build.
