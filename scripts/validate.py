#!/usr/bin/env python3
"""Validate the portable Claude Code package without third-party dependencies."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from generate_expansions import ESPANSO_PATH, load_entries, render_espanso


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / ".claude" / "skills"
AGENTS_ROOT = ROOT / ".claude" / "agents"
MANIFEST_PATH = ROOT / "text-replacements" / "manifest.json"
SOURCE_MAP_PATH = ROOT / "migration" / "source-map.json"

REQUIRED_AGENTS = {"director", "maker", "checker", "explorer", "dialogue"}
REQUIRED_HEARTBEATS = {"chief-of-staff.md", "jira-work-pulse.md", "review-pulse.md"}
MANUAL_ONLY_SKILLS = {
    "acceptance-testing",
    "checking",
    "chief-of-staff",
    "comms",
    "doc-budget",
    "engineering",
    "grading",
    "instruction-budget",
    "maestro",
    "planning",
    "simplify-skill",
    "work-pulse",
}
BANNED_PATTERNS = {
    "private absolute workspace path": re.compile(r"__underworld|/Users/[^/]+/"),
    "Codex package coupling": re.compile(r"\.codex/|\.codex\\"),
    "legacy repository coupling": re.compile(r"\./maestro\b"),
    "legacy CLI coupling": re.compile(r"(?<![A-Za-z0-9_-])gb\s+(?:get|inbox|board|trace)\b"),
    "control-plane implementation detail": re.compile(
        r"\b(?:private control plane|inbox(?:es)?|work brief)\b", re.IGNORECASE
    ),
}
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.errors.append(message)


def parse_frontmatter(path: Path, validation: Validation) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    validation.require(bool(lines) and lines[0] == "---", f"{path}: missing frontmatter")
    if not lines or lines[0] != "---":
        return {}

    try:
        end = lines.index("---", 1)
    except ValueError:
        validation.errors.append(f"{path}: unterminated frontmatter")
        return {}

    fields: dict[str, str] = {}
    for line_number, line in enumerate(lines[1:end], start=2):
        if not line.strip():
            continue
        if ":" not in line:
            validation.errors.append(f"{path}:{line_number}: invalid frontmatter line")
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        validation.require(bool(key and value), f"{path}:{line_number}: empty frontmatter field")
        validation.require(key not in fields, f"{path}:{line_number}: duplicate field {key}")
        fields[key] = value

    validation.require(end + 1 < len(lines), f"{path}: empty Markdown body")
    return fields


def validate_skills(validation: Validation) -> dict[str, Path]:
    skills: dict[str, Path] = {}
    for path in sorted(SKILLS_ROOT.glob("*/SKILL.md")):
        fields = parse_frontmatter(path, validation)
        name = fields.get("name", "")
        validation.require(bool(name), f"{path}: missing name")
        validation.require(bool(fields.get("description")), f"{path}: missing description")
        validation.require(name == path.parent.name, f"{path}: name must match directory")
        validation.require(name not in skills, f"{path}: duplicate skill name {name}")
        if name in MANUAL_ONLY_SKILLS:
            validation.require(
                fields.get("disable-model-invocation") == "true",
                f"{path}: manual-only skill must disable model invocation",
            )
        if name:
            skills[name] = path

    validation.require(bool(skills), "no Claude skills found")
    validation.require(
        MANUAL_ONLY_SKILLS <= skills.keys(),
        f"missing manual-only skills: {sorted(MANUAL_ONLY_SKILLS - skills.keys())}",
    )
    return skills


def validate_agents(validation: Validation) -> set[str]:
    found: set[str] = set()
    for path in sorted(AGENTS_ROOT.glob("*.md")):
        fields = parse_frontmatter(path, validation)
        name = fields.get("name", "")
        validation.require(bool(fields.get("description")), f"{path}: missing description")
        validation.require(name == path.stem, f"{path}: name must match filename")
        validation.require(name not in found, f"{path}: duplicate agent name {name}")
        if name:
            found.add(name)
    validation.require(found == REQUIRED_AGENTS, f"agent set mismatch: {sorted(found)}")
    return found


def validate_replacements(validation: Validation) -> None:
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        validation.errors.append(f"{MANIFEST_PATH}: {error}")
        return

    replacements = manifest.get("replacements", [])
    validation.require(isinstance(replacements, list), "replacement manifest must contain a list")
    if not isinstance(replacements, list):
        return

    validation.require(
        len(replacements) == manifest.get("source_count"),
        "replacement count does not match source_count",
    )
    triggers: set[str] = set()
    commands: set[str] = set()
    for index, item in enumerate(replacements):
        prefix = f"replacement[{index}]"
        validation.require(isinstance(item, dict), f"{prefix}: must be an object")
        if not isinstance(item, dict):
            continue
        trigger = item.get("trigger")
        command = item.get("command")
        validation.require(isinstance(trigger, str) and bool(trigger), f"{prefix}: missing trigger")
        validation.require(
            isinstance(item.get("replacement"), str) and bool(item.get("replacement")),
            f"{prefix}: missing replacement text",
        )
        validation.require(isinstance(command, str) and bool(command), f"{prefix}: missing command")
        if not isinstance(trigger, str) or not isinstance(command, str):
            continue
        validation.require(trigger not in triggers, f"{prefix}: duplicate trigger {trigger}")
        validation.require(command not in commands, f"{prefix}: duplicate command {command}")
        triggers.add(trigger)
        commands.add(command)

    expected_adapter = render_espanso(load_entries())
    validation.require(ESPANSO_PATH.exists(), f"missing generated adapter: {ESPANSO_PATH}")
    if ESPANSO_PATH.exists():
        validation.require(
            ESPANSO_PATH.read_text(encoding="utf-8") == expected_adapter,
            f"stale generated adapter: {ESPANSO_PATH}",
        )


def validate_heartbeats(validation: Validation) -> None:
    found = {path.name for path in (ROOT / "heartbeats").glob("*.md") if path.name != "README.md"}
    validation.require(found == REQUIRED_HEARTBEATS, f"heartbeat set mismatch: {sorted(found)}")


def validate_source_map(
    validation: Validation, skills: dict[str, Path], agents: set[str]
) -> None:
    try:
        source_map = json.loads(SOURCE_MAP_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        validation.errors.append(f"{SOURCE_MAP_PATH}: {error}")
        return

    agent_map = source_map.get("agents", {})
    skill_map = source_map.get("skills", {})
    validation.require(isinstance(agent_map, dict), "source agent map must be an object")
    validation.require(isinstance(skill_map, dict), "source skill map must be an object")
    if not isinstance(agent_map, dict) or not isinstance(skill_map, dict):
        return
    validation.require(
        len(agent_map) == source_map.get("source_agent_count"),
        "source agent count does not match source_agent_count",
    )
    validation.require(
        len(skill_map) == source_map.get("source_skill_count"),
        "source skill count does not match source_skill_count",
    )
    for source_name, target_name in agent_map.items():
        validation.require(
            target_name in agents,
            f"source agent {source_name} maps to missing target {target_name}",
        )
    for source_name, target_name in skill_map.items():
        validation.require(
            target_name in skills,
            f"source skill {source_name} maps to missing target {target_name}",
        )


def validate_links_and_private_terms(validation: Validation) -> None:
    for path in sorted(ROOT.rglob("*")):
        if (
            not path.is_file()
            or ".git" in path.parts
            or "node_modules" in path.parts
            or ("web" in path.parts and "traceui" in path.parts and "dist" in path.parts)
        ):
            continue
        if path.resolve() == Path(__file__).resolve():
            continue
        if path.suffix not in {".md", ".json", ".py", ".sh", ""}:
            continue
        text = path.read_text(encoding="utf-8")
        validation.require(bool(text.strip()), f"{path}: empty file")
        for label, pattern in BANNED_PATTERNS.items():
            validation.require(not pattern.search(text), f"{path}: contains {label}")
        if path.suffix != ".md":
            continue
        for target in MARKDOWN_LINK.findall(text):
            if "://" in target or target.startswith("#"):
                continue
            target_path = target.split("#", 1)[0]
            validation.require((path.parent / target_path).exists(), f"{path}: broken link {target}")


def main() -> int:
    validation = Validation()
    skills = validate_skills(validation)
    agents = validate_agents(validation)
    validate_replacements(validation)
    validate_heartbeats(validation)
    validate_source_map(validation, skills, agents)
    validate_links_and_private_terms(validation)

    if validation.errors:
        for error in validation.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"validation failed with {len(validation.errors)} error(s)", file=sys.stderr)
        return 1

    replacement_count = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["source_count"]
    print(
        f"validated {len(skills)} skills, {len(REQUIRED_AGENTS)} agents, "
        f"{len(REQUIRED_HEARTBEATS)} heartbeats, and {replacement_count} commands"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
