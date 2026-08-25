#!/usr/bin/env python3
"""Install a skill from this repo's `skills/` directory into a target agent.

Currently supported targets:
  * claude-code — installs into ~/.claude/skills/<name>/

Example:
    python3 install_skill.py --skill remove-ai-marks --target claude-code
"""

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SKILLS_DIR = REPO_ROOT / "skills"

TARGETS = {
    "claude-code": Path.home() / ".claude" / "skills",
}


def install(skill_name: str, target: str) -> Path:
    if target not in TARGETS:
        raise SystemExit(
            f"Unknown target {target!r}. Known: {', '.join(sorted(TARGETS))}"
        )

    src = SKILLS_DIR / skill_name
    if not src.is_dir():
        raise SystemExit(f"Skill {skill_name!r} not found at {src}")
    if not (src / "SKILL.md").is_file():
        raise SystemExit(f"{src} is missing SKILL.md")

    dst_root = TARGETS[target]
    dst = dst_root / skill_name
    dst_root.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    return dst


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", required=True, help="Skill name (directory under skills/)")
    parser.add_argument(
        "--target",
        required=True,
        choices=sorted(TARGETS),
        help="Where to install the skill",
    )
    args = parser.parse_args()

    dst = install(args.skill, args.target)
    print(f"Installed {args.skill} -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
