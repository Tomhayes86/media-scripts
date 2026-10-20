# Apple Wallet passes (optional)

Enables the **Add to Apple Wallet** button so your flights appear as real boarding-pass–style passes in the iPhone Wallet app, complete with the lock-screen suggestion when you're near the airport.

Requires an Apple Developer account. If you already have one for the native iOS build (which you do), you're most of the way there.

## 1. Create a Pass Type ID

1. https://developer.apple.com/account/resources/identifiers/list/passTypeId → **+**
2. Description: `Flighty Boarding Pass` · Identifier: `pass.com.<yourdomain>.flighty`
3. Register.

## 2. Create a signing certificate for the Pass Type ID

On any Mac (borrow one for 10 min if you have to):

1. Keychain Access → Certificate Assistant → **Request a Certificate From a Certificate Authority…** → email, common name `Flighty Pass`, **Saved to disk**. Produces `CertificateSigningRequest.certSigningRequest`.
2. Back in the developer portal → your Pass Type ID → **Create Certificate** → upload the CSR → download `pass.cer`.
3. In Keychain Access, double-click `pass.cer` to install it. Find the new key/cert pair, right-click → **Export 2 items** → save as `pass.p12` with a passphrase.

## 3. Convert to PEM and drop into the Beelink

On your Beelink (openssl comes with Ubuntu):

```bash
mkdir -p ~/media-scripts/flighty/selfhosted/data/passkit
cd ~/media-scripts/flighty/selfhosted/data/passkit

# Copy pass.p12 here from the Mac (scp), then:
openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
openssl pkcs12 -in pass.p12 -nocerts     -out signerKey.pem  -legacy
# Enter the passphrase you set in step 2.

# Write the passphrase to a file the server reads:
echo -n "your-passphrase" > passphrase.txt
chmod 600 passphrase.txt signerKey.pem

# Apple WWDR G4 intermediate cert:
curl -o wwdr.cer https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in wwdr.cer -out wwdr.pem
rm wwdr.cer
```

You should now have:

```
data/passkit/
  wwdr.pem
  signerCert.pem
  signerKey.pem
  passphrase.txt
```

## 4. Configure `.env`

```
PASS_TYPE_ID=pass.com.yourdomain.flighty     # exactly what you registered
TEAM_ID=ABCDE12345                            # your 10-char Team ID
ORG_NAME=Flighty
```

## 5. Restart the container

```bash
cd ~/media-scripts/flighty/selfhosted
docker compose up -d
```

## 6. Test

- **From the web PWA**: open a flight's detail page and hit `https://<your-url>/api/flights/<id>/pkpass` directly. iOS Safari will download the file and prompt "Add to Wallet".
- **From the native iOS app** (if you've built it): open a flight → tap **Add to Apple Wallet** at the top.

## Troubleshooting

- **"Wallet passes aren't configured on the server yet"** — `PASS_TYPE_ID` or `TEAM_ID` isn't set, or `data/passkit/` files missing.
- **"Failed to load pass"** in Wallet — usually a cert mismatch (`PASS_TYPE_ID` doesn't match the cert's Common Name). Verify with `openssl x509 -in signerCert.pem -noout -subject`.
- **Pass shows the wrong colors / no logo** — you can drop `icon.png` (29×29), `icon@2x.png` (58×58), and `logo.png` into a bundled model instead of the in-memory one; edit `pkpass.js` to include them.
- **Passes don't auto-update** — this MVP doesn't run a `webServiceURL`. To enable push updates to the pass itself (Wallet re-fetches on gate changes), you need to implement Apple's pass web service endpoints — a substantial follow-up.
