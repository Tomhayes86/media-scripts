# System Scripts

Scripts for system maintenance, backup automation, and file management.

See [main README](../README.md) for general setup and configuration, and dependency installation.

## Scripts

### `backuparr.sh`

Automated backup for Docker containers including Arr services (Sonarr, Radarr, Prowlarr), Bazarr, and other services, plus qBittorrent configuration and scripts folder.

**Features:**
- Writes each backup as a compressed `.tgz` archive into a cloud-synced directory (Google Drive, etc.)
- Docker container data folders (stops and restarts containers around the backup)
- qBittorrent configuration
- Scripts directory (excludes `pyenv` and `.git`)
- Per-container archive excludes (e.g. `MediaCover`, `cache`) to keep archives small
- Verbose logging to `backuparr.log` (truncated each run)

**Setup:**

Edit `../config.yml` and configure:
- `docker_base_dir` - Where your Docker container data/compose files live
- `scripts_dir` - Location of the scripts folder to back up
- `backup_dest_dir` - Where the `.tgz` archives are saved (should be a cloud-synced folder)
- `qbittorrent_conf` - Location of `qBittorrent.conf`

Edit `backuparr.sh` and configure the lists at the top if needed:
- `CONTAINERS` - The list of Docker containers to stop and back up
- `EXCLUDES` - Optional per-container paths to leave out of the archive

**Usage:**
```bash
./backuparr.sh
```

**Cron:** Weekly Sunday at 3 AM

---

### `check-mounts.sh`

Checks that configured mount points are healthy and remounts them if they are stale or unresponsive.

**Features:**
- Tests each mount point with a short `touch` probe (5 second timeout)
- Lazily unmounts and remounts stale/dead mounts automatically
- Cleans up test files on success

**Setup:**

Edit `check-mounts.sh` and set the `MOUNTS` array to list your mount points:
```bash
MOUNTS=("/mnt/media" "/mnt/sync")
```

**Usage:**
```bash
./check-mounts.sh
```

**Cron:** Every 5 minutes

---

### `permissions.sh`

Configures standard user and group ownership (`media` GID `1001`, `docker` GID `1003`) and read/write/execute permissions (e.g. `775` or `777`) across downloads, Plex media, Plex logs, and Docker container subdirectories under `/home/simon/docker/`. It also cleans up macOS-generated metadata files (`.DS_Store`, `._*`) from media mounts.

**Usage:**
```bash
sudo ./permissions.sh
```

---

### `recreate-docker.sh`

Recreates Docker Compose services in bulk — discovers every service under a directory of per-service Compose projects and takes each one `down` then `up -d`.

**Why this is needed:**

Some settings (e.g. log rotation via `log-opts` in `/etc/docker/daemon.json`) only apply to containers created *after* the change — `docker compose restart` and even a daemon restart leave existing ones untouched. Only a recreate picks them up. This sweeps the whole stack instead of doing it dir-by-dir, with a skip list for services to leave alone.

**Setup:**

Edit the config block at the top of the script:
- `DOCKER_DIR` - directory holding one subdirectory per service (each with a compose file)
- `SKIP` - service names to exclude from the recreate-all run (services named explicitly on the command line are always recreated)

**Usage:**
```bash
./recreate-docker.sh                 # recreate all discovered services (minus skip list)
./recreate-docker.sh radarr sonarr   # recreate only the named services
```

> Note: this recreates containers (`down` + `up -d`), so each service has a few seconds of downtime — it is not an in-place restart.

---

## Scheduling

All scripts are configured to run automatically via cron. Edit your crontab using `crontab -e` and add:

```bash
# Weekly backup (Sunday 3 AM)
0 3 * * 0 /path/to/scripts/system/backuparr.sh

# Mount checks (every 5 minutes)
*/5 * * * * /path/to/scripts/system/check-mounts.sh
```
