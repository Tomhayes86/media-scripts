#!/bin/bash
# =============================================================================
# backuparr.sh
# =============================================================================
# Description  : Backs up Docker container data folders, qBittorrent config,
#                and scripts folder as compressed .tgz archives in a
#                cloud-synced directory. Containers are stopped before backup
#                and restarted after. Logs are written to backuparr.log next to
#                the script (truncated each run).
#
# Usage        : Edit paths and the backup_containers list in config.yml.
#                Run this script daily or weekly via scheduled cron job.
#
# =============================================================================
# CONFIG - customize as needed
# =============================================================================

# Per-container archive excludes (relative to the container's data folder).
# Space-separate to exclude more than one path.
declare -A EXCLUDES=(
    ["radarr"]="config/MediaCover"
    ["sonarr"]="config/MediaCover"
    ["tautulli"]="cache"
    ["homelab-docs"]="site repo"   # built HTML + git clone, both rebuilt on deploy (~10 MB)
)

# Read paths from config.yml
_CONFIG="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../config.yml"
read -r DOCKER_BASE_DIR SCRIPTS_DIR DESTDIR QBITTORRENT_CONF < <(python3 -c "import yaml; c=yaml.safe_load(open('$_CONFIG')); print(c['docker_base_dir'], c['scripts_dir'], c['backup_dest_dir'], c['qbittorrent_conf'])")

# List of containers to stop/start and back up (from config.yml)
mapfile -t CONTAINERS < <(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$_CONFIG'))['backup_containers']))")

# Plex database dir (optional) — newest nightly snapshot is copied out for watch-history preservation
PLEX_DB_DIR="$(python3 -c "import yaml; print(yaml.safe_load(open('$_CONFIG')).get('plex_db_dir',''))")"

# Log everything to backuparr.log next to this script (overwrite)
set -euo pipefail
LOGFILE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/backuparr.log"
: >"$LOGFILE"

# Log output to logfile only
exec >>"$LOGFILE" 2>&1

# =============================================================================
section() {
    echo
    echo '------------------------------------------------------------'
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo '------------------------------------------------------------'
}

# Create a .tgz archive of a source folder/file with optional extra tar args
tar_job() {
    local src="$1" dest_tgz="$2"
    shift 2
    local extra=("$@")
    echo "Backing up $(basename "$dest_tgz")..."
    mkdir -p "$(dirname "$dest_tgz")"
    tar -czf "$dest_tgz" "${extra[@]}" \
        -C "$(dirname "${src%/}")" "$(basename "${src%/}")"
}

# =============================================================================
# FOLDER BACKUPS - archive qBittorrent and scripts
# =============================================================================
section "Performing folder backups"

mkdir -p "$DESTDIR"

tar_job "$QBITTORRENT_CONF" "$DESTDIR/qbittorrent.tgz"
tar_job "$SCRIPTS_DIR/" "$DESTDIR/scripts.tgz" --exclude='pyenv' --exclude='.git'

# =============================================================================
# DOCKER BACKUPS - stop containers, archive data folders, start containers
# =============================================================================
if [ ${#CONTAINERS[@]} -gt 0 ]; then
    section "Stopping Docker containers"
    for c in "${CONTAINERS[@]}"; do
        echo "Stopping $c..."
        docker compose -f "$DOCKER_BASE_DIR/$c/docker-compose.yml" stop
    done

    # Wait for all containers to stop
    echo "Waiting for containers to stop..."
    for c in "${CONTAINERS[@]}"; do
        timeout 30 bash -c "while docker compose -f \"$DOCKER_BASE_DIR/$c/docker-compose.yml\" ps --services --filter status=running | grep -q .; do sleep 0.5; done"
    done

    section "Backing up Docker containers"

    # Archive each container's data folder into a .tgz
    for c in "${CONTAINERS[@]}"; do
        if [ -n "${EXCLUDES[$c]:-}" ]; then
            # Values are space-separated; build one --exclude per path.
            read -ra _paths <<< "${EXCLUDES[$c]}"
            _exclude_args=()
            for _p in "${_paths[@]}"; do
                _exclude_args+=(--exclude="$_p")
            done
            tar_job "$DOCKER_BASE_DIR/$c/" "$DESTDIR/$c.tgz" "${_exclude_args[@]}"
        else
            tar_job "$DOCKER_BASE_DIR/$c/" "$DESTDIR/$c.tgz"
        fi
    done

    section "Starting Docker containers"
    for c in "${CONTAINERS[@]}"; do
        echo "Starting $c..."
        docker compose -f "$DOCKER_BASE_DIR/$c/docker-compose.yml" start
    done

    # Wait for all containers to start
    echo "Waiting for containers to start..."
    for c in "${CONTAINERS[@]}"; do
        timeout 30 bash -c "while ! docker compose -f \"$DOCKER_BASE_DIR/$c/docker-compose.yml\" ps --services --filter status=running | grep -q .; do sleep 0.5; done"
    done
fi

# =============================================================================
# PLEX DB BACKUP - copy Plex's newest nightly database snapshot
# =============================================================================
# Plex writes its own dated DB snapshots nightly (com.plexapp.plugins.library.db-YYYY-MM-DD).
# These are consistent and world-readable, so no need to stop Plex - just copy the
# most recent one out to the cloud-synced dest. This is the ONLY copy of watch history
# (the rest of the Plex library is rebuildable from the media files). Keeps the 3 newest.
if [ -n "$PLEX_DB_DIR" ] && [ -d "$PLEX_DB_DIR" ]; then
    section "Backing up Plex database (newest nightly snapshot)"
    newest_plex_db="$(ls -1t "$PLEX_DB_DIR"/com.plexapp.plugins.library.db-20* 2>/dev/null | head -1 || true)"
    if [ -n "$newest_plex_db" ]; then
        mkdir -p "$DESTDIR/plex"
        echo "Copying $(basename "$newest_plex_db")..."
        # NB: no -p — the OneDrive FUSE dest can't set mtime (utime → EPERM),
        # which under `set -e` would abort the whole backup. The snapshot's date
        # is in its filename, so preserving timestamps isn't needed.
        cp "$newest_plex_db" "$DESTDIR/plex/"
        # retain only the 3 most recent snapshots
        ls -1t "$DESTDIR/plex/"com.plexapp.plugins.library.db-* 2>/dev/null | tail -n +4 | xargs -r rm -f
    else
        echo "WARNING: no Plex nightly DB snapshot found under $PLEX_DB_DIR"
    fi
fi

# =============================================================================
# FINALIZE and print backup size
# =============================================================================

size=$(du -sh "$DESTDIR" | cut -f1)
section "Backup complete: $size"
