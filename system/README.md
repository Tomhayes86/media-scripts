# System Scripts

Scripts for system maintenance, backup automation, and file management.

See [main README](../README.md) for repo setup and configuration, and dependency installation.

## `backuparr.sh`

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

## `recreate-docker.sh`

Recreates Docker Compose services in bulk — discovers every service under a directory of per-service Compose projects and takes each one `down` then `up -d`.

**Why this is needed:**

Some settings (e.g. log rotation via `log-opts` in `/etc/docker/daemon.json`) only apply to containers created *after* the change — `docker compose restart` and even a daemon restart leave existing ones untouched. This script can quickly recreate all containers, skipping ones if needed.

⚠️ **Caution:** each service has a few seconds of downtime — this is not an in-place restart.

**Setup:**

Edit the config block at the top of the script:
- `DOCKER_DIR` - Directory holding one subdirectory per service (each with a compose file)
- `SKIP` - Container names to not recreate when running without args. Useful if you have containers that aren't always running and you want to stay down.

Note: When you give a service on the command line this container will always recreated (even if in the skip list) by design.

**Usage:**
```bash
./recreate-docker.sh                 # recreate all discovered services (minus skip list)
./recreate-docker.sh radarr sonarr   # recreate only the named services
```


## What's missing? 

Made it this far? Submit an idea to the [Github issues page](https://github.com/swxxii/media-scripts/issues).
