# Plex Scripts

Scripts for managing Plex media server, monitoring playback, and automating tasks.

See [main README](../README.md) for repo setup and configuration, and dependency installation.

## `plexmeta.py`

Exports Plex library to CSV and JSON metadata via Tautulli API so you have a backup of what was in Plex if you lose everything (e.g. NAS failure).

**Features:**
- Queries Tautulli for all library sections
- Triggers CSV and JSON exports for each section
- Polls until exports complete
- Downloads exports files to a local folder
- Cleans up server-side exports

**Setup:**
Edit `../config.yml` and configure:
   - `tautulli_url` - Tautulli server URL
   - `tautulli_api_key` - Your Tautulli API key
   - `plexmeta_output_dir` - Folder to save exported CSVs/JSONs

**Usage:**
```bash
python3 plexmeta.py
```


## `plex-playback-monitor.py`

**Features:**

Monitors Plex for playback sessions and pauses/resumes things that can cause buffering. Auto-detaches to run in the background (like `nohup`). Recommend hourly cron entry to re-launch it if the process ever dies.
- **qBittorrent**: when remote sessions are active, pauses torrents, adjusts speed limits, and reduces the active torrent limit. Resumes everything when remote playback stops.
- **Plex library scans**: when any sessions are active (local and remote) disables Plex background library scanning ("Scan my library periodically", "Scan my library automatically", "Run a partial scan when changes are detected"), then re-enables them when playback sessions end.

**Setup:**
Edit `../config.yml` and configure:
   - `plex_url` — Your Plex server address
   - `plex_token` — Your Plex API token *(Plex Web → library item → Get Info → View XML → copy `X-Plex-Token` from URL)*
   - `qbittorrent_host` — qBittorrent server IP
   - `qbittorrent_username` / `password` — Your qBittorrent credentials
   - `qbittorrent_port` — qBittorrent WebUI port (optional, default: `8081`)
   - `qbittorrent_skip_category` — Torrents in this category will not be paused (optional, default: `"force"`)
   - `qbittorrent_polling_interval` — Check interval in seconds (optional, default: `30`)

**Usage (Daemon Mode):**

Add a crontab entry every hour (ensures daemon stays running). 
Edit your crontab using `crontab -e` and add:
```bash
0 * * * * /usr/bin/python3 /path/to/scripts/plex/plex-playback-monitor.py >> /path/to/scripts/plex/plex-playback-monitor.log 2>&1
```

**Usage (Manual):**
```bash
# Run directly (spawns background worker)
python3 plex-playback-monitor.py

# Restart the script (kills any running worker, then starts a new one)
python3 plex-playback-monitor.py --restart

# Stop the running worker without starting a new one
python3 plex-playback-monitor.py --stop
```

Monitor the logs while running
```
tail -f plex-playback-monitor.log
```


## `plex-buffer.sh`

Tautulli notification trigger script for logging buffering events so you can review who buffered, what title, and how many times.

**Config:**
- `LOG` - Log file path inside container (default: script directory)
- `KEEP_LINES` - Maximum number of log lines to keep (default: `500`)


**Note:** The script folder must be the path *inside the docker container*, not the host path. With a `- /host/scripts:/scripts` bind-mount in your docker-compose.yml you would set it to `/scripts/plex`.

**Tautulli Setup:**
1. Go to **Settings → Notification Agents → Add → Script**
2. Set **Script Folder** to this directory and select `plex-buffer.sh`
3. Under **Triggers**, enable **Buffer Warning**
4. Under **Arguments**, enter: `{username} "{title}" {buffer_count}`
5. Under **Conditions**, set **Stream Location** is **wan** to only log remote users
6. Save and restart Tautulli

If the **Script File** dropdown stays empty, it's Tautulli's mount safety gate: it rejects any folder whose path *or any parent* is a mount point (a bind-mount counts). Fix by setting `allow_mounted_folders = 1` in `config.ini` — stop the container first (Tautulli rewrites `config.ini` on exit), then start it again. 

Alternatively, mount the scripts under the data dir (e.g. `:/config/scripts`), which is exempt from the check.

**Example log line:**
```
2026-04-12 23:05:14 AEST | alice | Inception | Count: 3
```

## `plex-chromecast-fix.sh`

Fix Chromecast casting issues on Plex. Run after each Plex update. 

See [plex-chromecast-fix.md](plex-chromecast-fix.md) for more details.

> [!CAUTION]
> This is a dirty hack. Removing `Generic.xml` forces Plex to use a fallback profile that fixes Chromecast but **may break playback for other clients** (e.g. LG TVs). You should test all client devices after running.

**What it does:**
- Renames `/usr/lib/plexmediaserver/Resources/Profiles/Generic.xml` to `Generic.xml.old`
- Restarts Plex media server


**Usage:**
```bash
sudo ./plex-chromecast-fix.sh
```

## `movie-folders.sh`

Organize movie files into individual folders for Plex compatibility.

**Features:**
- Moves video files (mkv, mp4, avi, mpeg4, mpg, divx) into their own folders
- Consolidates companion files (subtitles, nfo, etc.) with each movie
- Removes small/empty folders (< 90MB) once done
- Logs progress to stdout

**Setup:**
1. Edit `movie-folders.sh` and set the `src` variable to your target directory

**Usage:**
```bash
./movie-folders.sh
```

⚠️ **Caution:** This script uses destructive cleanup (`rm -rf`) for empty folders. Use at own risk!
