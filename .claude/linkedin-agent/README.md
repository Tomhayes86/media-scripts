# linkedin-agent

Vendored from https://github.com/Jakeschincariol/linkedin-agent-skill
at commit `add2c23882fe79180737d242ff80a5da205eda6a` (MIT, see `LICENSE`).

The eleven `li-*` skills live in `../skills/`. They only draft text; nothing
posts to LinkedIn.

Before first use, copy `voice.md` to `~/.claude/linkedin/voice.md` and fill it
in (or paste three of your own posts and ask Claude to write it). The skills
also read and write `plan.md` and `log.md` in that same folder.

To update, re-copy `skills/li-*` from the upstream repo and bump the commit
above.
