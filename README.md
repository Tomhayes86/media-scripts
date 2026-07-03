# media-scripts

Utility scripts for Plex media servers, backup automation, and file management.

Each folder has its own README.

```
scripts/
├── plex/              # Plex-related scripts
├── system/            # System maintenance scripts
├── tools/             # Utility tools
├── config.example.yml # Example config file
└── config.yml         # Your config file (gitignored, not in repo)
```

## Installation

Clone the repository to your media server. Assumes plex, *arr, qBittorrent on same server.

```bash
git clone <repo-url> ~/scripts
cd ~/scripts
```

## Setup 

Create `config.yml`

```bash
cp config.example.yml config.yml
```

Open `config.yml` and fill in your values:

**Plex:**

- `plex_token` — From Plex Web: library → item → Get Info → View XML → copy `X-Plex-Token` from URL
- `plex_url` — Your Plex server address (e.g., `http://YOUR_SERVER_IP:32400`)

**Tautulli:**

- `tautulli_api_key` — From Tautulli: Settings → API
- `tautulli_url` — Your Tautulli server address

**qBittorrent:**

- `qbittorrent_username` — Your qBittorrent WebUI username
- `qbittorrent_password` — Your qBittorrent WebUI password
- `qbittorrent_host` — Your qBittorrent server IP
- `qbittorrent_port` — Your qBittorrent WebUI port (optional, default: `8081`)
- `qbittorrent_skip_category` — Category to skip pausing (optional, default: `"force"`)
- `qbittorrent_polling_interval` — Interval in seconds to check Plex sessions (optional, default: `30`)

**Paths:**

- `plexmeta_output_dir` — Where plexmeta exports library metadata
- `docker_base_dir` — Where your Docker compose projects/container data live
- `scripts_dir` — The path to this scripts directory (`/path/to/scripts`)
- `backup_dest_dir` — Where `backuparr.sh` saves the compressed `.tgz` archives
- `qbittorrent_conf` — Path to your `qBittorrent.conf` configuration file

## Install Dependencies

Before running the scripts, make sure to install the required system utilities and Python dependencies.

### 1. Python Packages

Install all required Python dependencies via `pip` from the scripts folder

```bash
pip install requests pyyaml qbittorrent-api tqdm python-whois dnspython english-words rich
```

### 2. System Utilities

Some tools (like subtitle stripping) require external command line utilities:

```bash
sudo apt install ffmpeg mediainfo
```


## Scheduling Scripts

For scripts you want to run automatically via cron.

### 1. User Crontab

Edit your user crontab - scripts not requiring root privileges

```bash
crontab -e
```

Copy and paste these lines (replace `/path/to/scripts`):

```bash
# 2AM DAILY - Export Plex metadata via Tautulli
0 2 * * * /usr/bin/python3 /path/to/scripts/plex/plexmeta.py >> /path/to/scripts/plex/plexmeta.log 2>&1

# HOURLY - Ensure plex-playback-monitor daemon is running
0 * * * * /usr/bin/python3 /path/to/scripts/plex/plex-playback-monitor.py >> /path/to/scripts/plex/plex-playback-monitor.log 2>&1
```

### 2. Root Crontab

Edit the root crontab - scripts needing root privileges.

```bash
sudo crontab -e
```

Copy and paste these lines (replace `/path/to/scripts`):

```bash
# 3AM SUNDAY - Backup script
0 3 * * 0 /path/to/scripts/system/backuparr.sh
```

## License

MIT License. See [LICENSE](LICENSE) for details.