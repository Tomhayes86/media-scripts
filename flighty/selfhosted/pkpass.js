// Server-side .pkpass generator using passkit-generator.
//
// Required secrets in /app/data/passkit/ (mounted from ./data/passkit):
//   wwdr.pem                — Apple WWDR G4 intermediate cert (download once from
//                             https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer,
//                             convert to PEM: openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem)
//   signerCert.pem          — your Pass Type ID cert, PEM format
//   signerKey.pem           — matching private key, PEM format
//   passphrase.txt          — private-key passphrase (single line, or empty file if unset)
//
// Set env:
//   PASS_TYPE_ID   pass.<reverse-dns>       (must match the cert)
//   TEAM_ID        your 10-char Team ID
//   ORG_NAME       "Flighty" (or whatever you like)

import { PKPass } from 'passkit-generator';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let cachedCerts = null;

function loadCerts() {
  if (cachedCerts) return cachedCerts;
  const dir = process.env.PASSKIT_DIR || '/app/data/passkit';
  const req = (name) => {
    const p = join(dir, name);
    if (!existsSync(p)) throw new Error(`Missing pass cert file: ${p}`);
    return readFileSync(p);
  };
  cachedCerts = {
    wwdr: req('wwdr.pem'),
    signerCert: req('signerCert.pem'),
    signerKey: req('signerKey.pem'),
    signerKeyPassphrase: existsSync(join(dir, 'passphrase.txt'))
      ? readFileSync(join(dir, 'passphrase.txt'), 'utf8').trim()
      : '',
  };
  return cachedCerts;
}

// Build the pass.json body from a flight row.
function passJson(f, env) {
  const passTypeId = env.PASS_TYPE_ID;
  const teamId = env.TEAM_ID;
  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    serialNumber: String(f.id),
    organizationName: env.ORG_NAME || 'Flighty',
    description: `${f.flight_number} ${f.origin_iata ?? '???'} → ${f.destination_iata ?? '???'}`,
    logoText: f.airline_name || 'Flighty',
    foregroundColor: 'rgb(255,255,255)',
    backgroundColor: 'rgb(28,107,255)',
    labelColor: 'rgb(220,232,255)',
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: `${f.flight_number}|${f.flight_date}|${f.id}`,
        messageEncoding: 'iso-8859-1',
      },
    ],
    relevantDate: f.estimated_dep || f.scheduled_dep,
    locations: f.origin_lat && f.origin_lon ? [{
      latitude: f.origin_lat, longitude: f.origin_lon,
      relevantText: `Departure from ${f.origin_iata}`,
    }] : undefined,
    boardingPass: {
      transitType: 'PKTransitTypeAir',
      headerFields: [
        { key: 'gate', label: 'GATE', value: f.gate_dep || '—' },
      ],
      primaryFields: [
        { key: 'from', label: 'FROM', value: f.origin_iata || '???' },
        { key: 'to',   label: 'TO',   value: f.destination_iata || '???' },
      ],
      secondaryFields: [
        { key: 'depart', label: 'DEPARTS', value: (f.estimated_dep || f.scheduled_dep || '').slice(11, 16) },
        { key: 'arrive', label: 'ARRIVES', value: (f.estimated_arr || f.scheduled_arr || '').slice(11, 16), textAlignment: 'PKTextAlignmentRight' },
      ],
      auxiliaryFields: [
        { key: 'term',   label: 'TERMINAL', value: f.terminal_dep || '—' },
        { key: 'flight', label: 'FLIGHT',   value: f.flight_number },
        { key: 'status', label: 'STATUS',   value: (f.status || 'scheduled').toUpperCase(), textAlignment: 'PKTextAlignmentRight' },
      ],
      backFields: [
        { key: 'airline',  label: 'Airline',      value: f.airline_name || '' },
        { key: 'aircraft', label: 'Aircraft',     value: f.aircraft_reg || '' },
        { key: 'origin',   label: 'From',         value: f.origin_name || '' },
        { key: 'dest',     label: 'To',           value: f.destination_name || '' },
      ],
    },
  };
}

export async function generatePass(flight, env) {
  const certs = loadCerts();
  const pass = new PKPass(
    // In-memory model with just the pass.json — no logo/icon assets bundled.
    // For a fully-conforming pass, drop icon.png (29x29) and icon@2x.png (58x58)
    // into your passkit dir and pass them here; iOS shows the pass without them
    // in most cases but Wallet's stricter modes will complain.
    { 'pass.json': Buffer.from(JSON.stringify(passJson(flight, env))) },
    certs
  );
  return pass.getAsBuffer();
}
