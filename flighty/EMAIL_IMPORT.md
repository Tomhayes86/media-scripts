# Email import

Two ways to get a flight into the app from a booking confirmation. Both work with **any** airline or email provider — no OAuth, no Gmail-specific integration.

## 1. Paste (works everywhere, zero setup)

- **iOS app**: tap the tray-arrow icon top-left → "Paste from clipboard" (or type/paste manually) → Import.
- **Web PWA**: tap the ✉︎ button next to Add → paste the email → Import.

Copy the full email body from your mail client (headers optional, but they don't hurt). The parser handles:

- Multipart MIME with quoted-printable / base64 encodings
- `text/calendar` (`.ics`) attachments — highest confidence when present
- Airline-specific templates (BA, easyJet, Ryanair, Lufthansa, United, Delta) and a generic IATA-pattern fallback

Response shows one row per detected flight:

| status | meaning |
|---|---|
| `added` | Successfully added to your list |
| `exists` | Already in your list |
| `not_found` | Parser saw a flight number + date, but the schedule provider couldn't find that flight |
| `error` | Something else went wrong (message included) |

## 2. Auto-import via email forwarding (Cloudflare Email Routing)

Requires a domain on Cloudflare (any domain — free plan is fine).

1. Cloudflare dashboard → your domain → **Email → Email Routing** → enable
2. **Email Workers** tab → **Create route** → destination = `flighty` Worker → address = anything, e.g. `flights@yourdomain.com`
3. In your email provider (Gmail, Outlook, iCloud, Fastmail…) set up a filter that forwards messages matching "flight confirmation OR itinerary OR booking reference" (or `from:noreply@britishairways.com`, etc.) to that address.

That's it — booking emails your provider forwards get parsed and added automatically, and you'll get an APNs / Web Push notification for any subsequent schedule change.

Because the Worker's `email()` handler is bound at the routing layer, there's no shared secret, no credentials to store, and no polling.

## API (for scripts or other clients)

```
POST /api/import/email
Content-Type: application/json

{ "raw": "<the full email text or MIME>" }
```

Response:
```json
{
  "added": [
    { "flight_number": "BA286", "flight_date": "2026-08-15", "status": "added", "id": 42 }
  ]
}
```

## Notes on limits & accuracy

- The parser errs on the side of **recall** — it'll happily surface flight-number-shaped tokens even from marketing footers. Anything it can't confirm via the schedule provider comes back as `not_found` rather than silently succeeding.
- Multi-leg itineraries produce one candidate per leg.
- Currencies like `USD400` and codes like `PO1234` are filtered out of the generic fallback.
- If a specific airline's confirmation format isn't matching, drop a sample email into `backend/src/email/parser.js` under `AIRLINE_TEMPLATES` and add a template — takes about ten lines.
