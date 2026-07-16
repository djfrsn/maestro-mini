#!/usr/bin/env python3
"""Measure a project's static instruction and token budgets.

An instruction is a sentence outside code blocks and frontmatter. Tokens are
estimated as characters divided by four.

Usage:
    python3 measure.py [--root <project>] [--json <output.json>]

Update ROLE_SKILLS and CHAINS when project routing changes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SLICE_BUDGET = 25
SKILL_SWEET, SKILL_TARGET, SKILL_MAX = 20, 25, 30
LOAD_SWEET, LOAD_TARGET, LOAD_MAX = 30, 40, 50
RUN_BUDGET_LOW, RUN_BUDGET_HIGH = 100, 150
RATIO_TARGET = round(LOAD_TARGET / SLICE_BUDGET, 2)

ROLE_SKILLS: dict[str, list[list[str]]] = {
    "director": [[]],
    "explorer": [[]],
    "maker": [["engineering"], ["planning"]],
    "checker": [["checking"], ["acceptance-testing"]],
    "dialogue": [["comms"]],
}

CHAINS: dict[str, list[str]] = {
    "delivery": ["director", "maker+engineering", "checker+checking"],
    "planning": ["director", "maker+planning", "checker+checking"],
    "acceptance": ["director", "maker+engineering", "checker+acceptance-testing"],
}


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            return parts[2]
    return text


def instruction_body(path: Path) -> str:
    return strip_frontmatter(path.read_text(encoding="utf-8"))


def count_instructions(body: str) -> int:
    body = re.sub(r"```.*?```", "", body, flags=re.S)
    body = re.sub(r"^#.*$", "", body, flags=re.M)
    sentences = re.split(r"(?<=[.!?])\s+", body)
    return len([sentence for sentence in sentences if len(sentence.strip()) > 2])


def measure_file(path: Path) -> dict[str, int]:
    text = path.read_text(encoding="utf-8")
    return {
        "chars": len(text),
        "tokens": round(len(text) / 4),
        "instructions": count_instructions(instruction_body(path)),
    }


def status(value: int, sweet: int, target: int, maximum: int) -> str:
    if value <= sweet:
        return "great"
    if value <= target:
        return "ok"
    return "near" if value <= maximum else "over"


def discover_files(root: Path) -> dict[str, dict[str, int | str]]:
    files: dict[str, dict[str, int | str]] = {}

    for name in ("AGENTS.md", "CLAUDE.md"):
        path = root / name
        if path.exists():
            files[name] = measure_file(path)

    for path in sorted((root / ".claude" / "agents").glob("*.md")):
        files[f"agent/{path.stem}"] = measure_file(path)

    for path in sorted((root / ".claude" / "skills").glob("*/SKILL.md")):
        measurement: dict[str, int | str] = measure_file(path)
        measurement["status"] = status(
            int(measurement["instructions"]),
            SKILL_SWEET,
            SKILL_TARGET,
            SKILL_MAX,
        )
        files[f"skill/{path.parent.name}"] = measurement

    for path in sorted((root / "heartbeats").rglob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        name = path.relative_to(root / "heartbeats").with_suffix("")
        files[f"heartbeat/{name}"] = measure_file(path)

    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    files = discover_files(root)

    base = [name for name in ("AGENTS.md", "CLAUDE.md") if name in files]

    def combine(parts: list[str]) -> dict[str, object] | None:
        if any(part not in files for part in parts):
            return None
        return {
            "parts": parts,
            "tokens": sum(int(files[part]["tokens"]) for part in parts),
            "instructions": sum(int(files[part]["instructions"]) for part in parts),
        }

    loads: dict[str, dict[str, object]] = {}
    for role, skill_sets in ROLE_SKILLS.items():
        for skills in skill_sets:
            name = role + ("+" + "+".join(skills) if skills else "")
            combined = combine(
                base + [f"agent/{role}"] + [f"skill/{skill}" for skill in skills]
            )
            if combined is None:
                continue
            instructions = int(combined["instructions"])
            combined["status"] = status(
                instructions, LOAD_SWEET, LOAD_TARGET, LOAD_MAX
            )
            combined["headroom"] = RUN_BUDGET_LOW - instructions - SLICE_BUDGET
            combined["ratio"] = (
                round(instructions / SLICE_BUDGET, 2)
                if role in {"director", "maker", "checker"}
                else None
            )
            loads[name] = combined

    chains: dict[str, dict[str, object]] = {}
    for name, hops in CHAINS.items():
        if any(hop not in loads for hop in hops):
            continue
        chains[name] = {
            "hops": hops,
            "tokens": sum(int(loads[hop]["tokens"]) for hop in hops),
            "instructions": sum(int(loads[hop]["instructions"]) for hop in hops),
        }

    report = {
        "budgets": {
            "slice": SLICE_BUDGET,
            "skill": {
                "sweet": SKILL_SWEET,
                "target": SKILL_TARGET,
                "max": SKILL_MAX,
            },
            "load": {
                "sweet": LOAD_SWEET,
                "target": LOAD_TARGET,
                "max": LOAD_MAX,
            },
            "run": {"low": RUN_BUDGET_LOW, "high": RUN_BUDGET_HIGH},
            "ratio_target": RATIO_TARGET,
        },
        "files": files,
        "loads": loads,
        "chains": chains,
    }
    if args.json:
        args.json.write_text(json.dumps(report, indent=1), encoding="utf-8")

    names = list(files) + list(loads) + list(chains)
    width = max((len(name) for name in names), default=8) + 2
    for section, rows in (("FILES", files), ("LOADS", loads), ("CHAINS", chains)):
        print(f"\n{section:{width}}{'~tokens':>9}{'instr':>7}  status")
        for name, row in rows.items():
            flag = row.get("status", "")
            ratio = row.get("ratio")
            extra = f"  ratio {ratio}:1" if ratio is not None else ""
            print(
                f"{name:{width}}{int(row['tokens']):9d}{int(row['instructions']):7d}"
                f"  {flag}{extra}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
