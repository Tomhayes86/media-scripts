# Building & running the iOS app

Everything is in `flighty/ios/`. The app talks to the same Cloudflare Worker as the web PWA — no separate backend.

## Prerequisites

- macOS with **Xcode 15+** (iOS 16.4 SDK for Live Activity push tokens)
- Apple Developer account (you have one)
- **XcodeGen**: `brew install xcodegen` — generates the `.xcodeproj` from `project.yml`

## 1. Pick a bundle ID + team

Edit `flighty/ios/project.yml`:

- `settings.base.DEVELOPMENT_TEAM` → your 10-char Team ID (Apple Developer → Membership)
- Replace `com.example.flighty` → your own reverse-DNS bundle ID (three places: main app, `.widget`, `.liveactivity`)
- Replace `group.com.example.flighty` → your App Group ID (Apple Developer → Identifiers → App Groups; create one and use the same ID in all three entitlement plists)

Also edit `flighty/ios/Shared/AppConfig.swift`:

- `apiBaseURL` → your Worker URL (e.g. `https://flighty.you.workers.dev`)
- `appGroup` → the same group ID you used in project.yml

## 2. Generate the Xcode project

```bash
cd flighty/ios
xcodegen generate
open Flighty.xcodeproj
```

In Xcode:

- Select the `Flighty` target → Signing & Capabilities → make sure "Automatically manage signing" is on and your team is selected. Repeat for `FlightyWidget` and `FlightyLiveActivity`.
- The `Push Notifications`, `App Groups`, and `Live Activities` capabilities should already be present via the entitlements plists.

## 3. Set up APNs on the backend

Get an APNs auth key from https://developer.apple.com/account/resources/authkeys/list :

1. Keys → + → check **Apple Push Notifications service (APNs)** → Register
2. Download the `.p8` file. **You only get to download it once — save it.**
3. Note the Key ID (10 chars) and your Team ID.

Then, from `flighty/backend/`:

```bash
wrangler secret put APNS_TEAM_ID       # your Team ID
wrangler secret put APNS_KEY_ID        # the Key ID from step 3
wrangler secret put APNS_KEY_P8        # paste the full contents of AuthKey_XXXXXX.p8
wrangler secret put APNS_BUNDLE_ID     # your app's bundle ID, e.g. com.you.flighty
wrangler secret put APNS_USE_SANDBOX   # "1" for development builds, unset/blank for TestFlight/App Store
wrangler d1 execute flighty --file=migrations/002_apns.sql
wrangler deploy
```

## 4. Run it

- Plug in your iPhone (Live Activities and push do **not** work on the simulator)
- Cmd+R in Xcode
- Grant notification permission when prompted
- Add a flight; open its detail; toggle **Show on Lock Screen** to start a Live Activity
- Backend cron will push updates to it whenever schedule/gate/status changes

## 5. TestFlight / installing without Xcode

Once you're happy, in Xcode: Product → Archive → Distribute App → App Store Connect → Upload → then attach to TestFlight in App Store Connect. TestFlight builds must use **production** APNs, so set `APNS_USE_SANDBOX=""` (blank) and redeploy the Worker before those builds send push.

## What's not built yet

- Real signed `.pkpass` for Apple Wallet — the in-app boarding-pass card is styled to look like a pass, but you can't add it to the Wallet app itself. Doing that requires a Pass Type ID cert and PKCS#7 signing, which is a stretch goal.
- Gmail booking-email import.
- Background CLLocation departure detection (auto-flip live tracking on when you get to the airport).

## Troubleshooting

- **Live Activity toggle throws "disabled in Settings"** → Settings → Face ID & Passcode / Focus → Live Activities → enable.
- **No pushes arriving** → check the Worker logs (`wrangler tail`), verify `APNS_BUNDLE_ID` exactly matches your `PRODUCT_BUNDLE_IDENTIFIER`, and confirm you toggled `APNS_USE_SANDBOX` correctly for dev vs TestFlight.
- **Widget shows "No flights"** → open the app once and view any flight; it writes to the App Group container which the widget reads. If it still fails, verify the App Group ID matches in every entitlements plist.
