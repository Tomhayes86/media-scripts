# Plex: Casting from iOS to Chromecast fails for some videos

When casting from the Plex iOS app to a Chromecast, some movies fail to play, while others work fine. This readme describes possible causes, how to diagnose it from server logs, and how to fix it (with a dirty hack).

# Table of Contents

- [Symptoms](#symptoms)
- [Root Cause](#root-cause)
- [Diagnosis](#diagnosis)
- [Resolution](#resolution)
- [Verification](#verification)
- [Additional Troubleshooting](#additional-troubleshooting)

# Symptoms

- Some movies fail to cast from iPhone to Chromecast; others in the same library play fine.
- Casting playback buffers then stops immediately.
- Playing the same movie directly on the iPhone works without issue.

## Root Cause

Plex Media Server uses device profiles to determine how to stream content to a client. When a `Generic.xml` profile is present on the server, Plex may incorrectly apply it to Chromecast sessions instead of the correct built-in `Chromecast` or `iOS` profile.

The Generic profile does not correctly specify a container format. This causes the transcode negotiation to fail before the stream starts. Because only certain formats/codecs trigger this code path, most content continues to play normally while a subset fails silently.

## Diagnosis

Search the Plex Media Server log for the following signature:

```bash
grep -i "profile\|transcode\|error" "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log" | tail -50
```

Affected systems will show repeated entries like:

```
ERROR - [Req#.../Transcode] ClientProfileExtra: missing container parameter
WARN  - [Req#.../Transcode] TranscodeUniversalRequest: at least one profile extra directive could not be read
```

These errors appear for every cast attempt, including ones that succeed — they are most likely caused by `Generic.xml` being applied incorrectly. If the errors are present and only some movies are failing, this is the probable cause.

Plex does not log which profile it selected when `Generic.xml` is present. The confirmation that `Generic.xml` was the cause only becomes visible **after** removing it, when the log will show:

```
Unable to find client profile Generic, falling back to traditional profile detection
```

## Resolution

> [!CAUTION]
> This is a dirty hack. Removing `Generic.xml` forces Plex to use a fallback profile that fixes Chromecast but **may break playback for other clients** (e.g. LG TVs). You should test all client devices after running.

### Run the helper script

```bash
sudo /path/to/plex-chromecast-fix.sh
```

The script does the following:

- Renames `/usr/lib/plexmediaserver/Resources/Profiles/Generic.xml` to `Generic.xml.old`
- Restarts `plexmediaserver`

### Configure Client Devices

1. Restart the Plex iOS app
2. Go to **Me → Settings → Video** and confirm both are enabled:
   - **Allow Direct Play**
   - **Allow Direct Stream**
3. Unplug the Chromecast for 20 seconds, then plug it back in.

## Verification

Cast a movie that was previously failing, then run:

```bash
grep -i "profile\|fallback" "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log" | tail -20
```

**You should see this in the logs:**

```
Unable to find client profile Generic, falling back to traditional profile detection
```

This confirms `Generic.xml` has been removed and Plex is now using device profile detection. The previously failing movies should now play successfully.

## Rollback
If you want to undo the changes rename `Generic.xml.old` back to `Generic.xml`

# Troubleshooting

- **Plex updates** can restore the stock `Generic.xml` file. If casting breaks again after an update, run `plex-chromecast-fix.sh` again.


- **DNS:** Chromecast casting has been reported to break when using Cloudflare DNS (`1.1.1.1`). Switch your router or device DNS to Google DNS (`8.8.8.8` / `8.8.4.4`) or your ISP's default DNS and retry.
- **Fixed bitrate:** If a specific title still fails, set cast quality to a fixed bitrate instead of Original in the iOS app (**Me → Settings → Video → Remote Quality**). This forces standard HLS and bypasses profile negotiation.
- **Do not** copy `iOS.xml` or `Chromecast.xml` and rename it to `Generic.xml` — allow Plex to use its built-in profiles.