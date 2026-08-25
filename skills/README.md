# Skills

Skill sources tracked in this repo. Each subdirectory is a self-contained skill: a `SKILL.md` (with YAML frontmatter naming and describing it) plus any support files it references.

## Install into Claude Code

```
python3 install_skill.py --skill <name> --target claude-code
```

This copies `skills/<name>/` into `~/.claude/skills/<name>/`, where Claude Code picks it up on the next session.

## Available

- **remove-ai-marks** — strip telltale AI writing marks (em-dashes as separators, curly quotes, filler transitions, "delve"/"leverage", trailing hedges) from prose without changing what it says.
