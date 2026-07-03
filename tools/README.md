# Tools

Utility scripts for file management and testing. Most should be run manually as needed.

See [main README](../README.md) for repo setup and configuration, and dependency installation.

## `media-extensions.py`

Restores file extensions for photos and videos by analyzing magic bytes.

**Features:**
- Detects file types from binary headers/magic bytes
- Supports images: JPEG, PNG, GIF, BMP, TIFF, HEIC, HEIF, AVIF, WebP
- Supports videos: MP4, M4V, MOV, 3GP, MKV, FLV, MPEG, OGG, AVI, WebM
- Handles equivalent extensions (.jpg/.jpeg, .tiff/.tif, etc.)
- Skips system files (.DS_Store, Thumbs.db, etc.)
- Dry-run mode available for preview

**Usage:**
```bash
# Preview changes without modifying files
python3 media-extensions.py /path/to/files --dry-run

# Execute and rename files (default mode)
python3 media-extensions.py /path/to/files

# Move files with no recognized type to a separate folder
python3 media-extensions.py /path/to/files --move-unknown /path/to/unknown

# Also clean problematic characters from filenames
python3 media-extensions.py /path/to/files --sanitize-names
```

## `strip-subtitles.py`

Strips embedded subtitle tracks from video files with `[4K]` in their filename using ffmpeg.

May help resolve playback issues with 4K videos on Plex client apps.

**Features:**
- Scans a directory recursively or processes a single file
- Only processes files containing `[4K]` in the filename
- Copies video and audio streams unchanged (no re-encode)
- Progress bar per file
- Verifies subtitle removal after processing

**Usage:**
```bash
# Scan a directory
python3 strip-subtitles.py /path/to/media

# Process a single file
python3 strip-subtitles.py /path/to/file.mkv
```

## `find-domain.py`

Not really related to media server but fun and may be useful.

Finds available domains where the prefix + TLD suffix forms an English word (e.g. `mu.ch`, `bea.ch`, `rea.ch`).

**Features:**
- Checks availability via WHOIS with DNS SOA as fallback for unsupported TLDs
- Supports multiple TLD suffixes in one run
- Caches registered domains to skip on reruns (cache expires after 14 days)
- Verbose mode (`-v`) to show all checks, not just available domains
- Integration tests across 20 popular TLDs (`-t`)
- Concurrent checks with a progress bar

> **Note:** Results may not be 100% accurate. WHOIS responses vary by registrar and TLD — some return ambiguous data for unregistered domains, causing the DNS fallback to be used instead. DNS SOA checks can produce false positives if nameservers are unreachable or during propagation delays after registration. Always verify through a registrar before attempting to register.

**Usage:**
```bash
# Single TLD
python3 find-domain.py net 10

# Multiple TLDs, max word length 12
python3 find-domain.py 'com,net,io' 12

# Verbose (show all checks, not just available)
python3 find-domain.py ch 8 -v

# Run integration tests against known domains across 20 popular TLDs
python3 find-domain.py -t
```

Arguments:
- `suffixes` — TLD or comma-separated list of TLDs (without leading dot)
- `max_length` — maximum total word length to consider

## `test-trackers.py`

Filters public lists of BitTorrent trackers for validity and performance.

Suggest running from your actual environment/country as results may vary. Australian users can try the `valid_trackers.txt` as is.

**Features:**
- Fetches tracker lists from multiple public sources
- Tests UDP and HTTP trackers concurrently
- Measures tracker response latency
- Filters out dead/slow trackers
- Saves valid trackers to `valid_trackers.txt`
- Progress bar and logging to `response_log.txt`

**Configuration:**

Optionally configure in `test-trackers.py`:
- `TRACKER_LISTS` - Source URLs to pull potential trackers from
- `OUTPUT_FILE` - Output file for valid trackers
- `LOG_FILE` - Log file for test results

**Usage:**
```bash
python3 test-trackers.py
```

Output files:
- `valid_trackers.txt` - List of working trackers
- `response_log.txt` - Detailed test results

## What's missing? 

Made it this far? Submit an idea to the [Github issues page](https://github.com/swxxii/media-scripts/issues).
