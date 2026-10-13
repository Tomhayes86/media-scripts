---
name: skin
description: Set or show the terminal color skin for this device's media-scripts (the `skin:` key in config.yml). Use when the user runs /skin or asks to change, list or preview script color themes.
argument-hint: "[skin-name | list]"
---

# /skin

Sets the color skin for scripts with colored output (currently `tools/test-trackers.py`) on **this device** by writing `skin:` to the repo's `config.yml`. That file is gitignored, so the choice stays on this device.

Arguments: `$ARGUMENTS`

## Valid skins

The source of truth is the `SKINS` dict in `tools/test-trackers.py` (the `PALETTES` keys plus `classic` and `none`). Read it rather than trusting this list, which may be stale:
`tokyo-night` (default), `tokyo-night-day`, `dracula`, `catppuccin-mocha`, `gruvbox`, `classic`, `none`.

## Steps

1. **No argument or `list`**: run `python3 tools/test-trackers.py --list-skins` from the repo root to preview every skin (`*` marks the current one). If `rich` isn't installed, read the current `skin:` from `config.yml` and list the names instead. Stop there.

2. **A skin name**: normalize it (lowercase, spaces to hyphens). If it isn't a valid skin, say so, list the valid ones, suggest the closest match, and stop without editing anything.

3. **Write it to `config.yml`** in the repo root:
   - If `config.yml` has a `skin:` line, replace that line's value only.
   - If it exists without one, append a blank line and `skin: <name>`.
   - If it doesn't exist, don't create it silently: other scripts need the full config. Tell the user, and offer to run `cp config.example.yml config.yml` and set `skin:` there (they still need to fill in the other values).
   - Edit only the `skin:` line. Never print, reformat or rewrite other values: the file holds tokens and passwords.

4. **Confirm**: show the `skin:` line now in `config.yml`, and if `rich` is available run `python3 tools/test-trackers.py --list-skins` so the user sees the new skin marked with `*`.

5. Mention that the `TEST_TRACKERS_SKIN` environment variable and `--skin` flag override `config.yml`, if either could be in effect (for example, `TEST_TRACKERS_SKIN` is set in the current shell).
