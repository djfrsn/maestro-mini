#!/usr/bin/env python3
"""Measure a project's documentation budgets.

Assign each document a read class, then score size, dead references, fact
density, and cross-file duplication. The skill applies its passage-level
doc razor to the mechanical results.

Usage:
    python3 measure_docs.py [--root <project>] [--json <output.json>]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_EXCLUDE_PARTS = {"metrics"}
TIER_A_TARGET, TIER_A_MAX = 1000, 2000

ARCHIVAL_MARKERS = (
    "scratchpad",
    "source material",
    "intentionally deferred",
    "preserved as source",
)

PATH_REF = re.compile(
    r"`([\w./-]+/[\w./-]+)`|\((?:\.\./)*"
    r"((?:docs|src|internal|config|prompts|\.claude|scripts|heartbeats)/[\w./-]+)\)"
)
REF_PREFIXES = (
    "docs/",
    "src/",
    "internal/",
    "config/",
    "prompts/",
    ".claude/",
    "scripts/",
    "heartbeats/",
)
FACT = re.compile(
    r"`[^`]+`|\b\d+\b|\b(?:git|go|python3|npm|make)\s+\w+|"
    r"--[\w-]+|\.(?:md|py|go|ts|yaml|toml|json|html)\b"
)


def sentences(text: str) -> list[str]:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"^#.*$", "", text, flags=re.M)
    parts = re.split(r"(?<=[.!?])\s+|\n\n", text)
    return [part.strip() for part in parts if len(part.strip()) > 2]


def normalize(sentence: str) -> str:
    return re.sub(r"\W+", " ", sentence.lower()).strip()


def dead_refs(text: str, root: Path) -> list[str]:
    dead: list[str] = []
    for match in PATH_REF.finditer(text):
        ref = match.group(1) or match.group(2)
        if not ref or " " in ref or "<" in ref or "*" in ref:
            continue
        if ref.startswith(REF_PREFIXES) and not (root / ref).exists():
            dead.append(ref)
    return sorted(set(dead))


def read_class(doc: Path, root: Path, wake_path_docs: set[str]) -> str:
    head = doc.read_text(encoding="utf-8")[:600].lower()
    if any(marker in head for marker in ARCHIVAL_MARKERS):
        return "C"
    if str(doc.relative_to(root)) in wake_path_docs:
        return "A"
    return "B"


def wake_path_references(root: Path) -> set[str]:
    refs: set[str] = set()
    sources = (
        list((root / ".claude" / "skills").glob("*/SKILL.md"))
        + list((root / ".claude" / "agents").glob("*.md"))
        + list((root / "heartbeats").rglob("*.md"))
    )
    for source in sources:
        for match in re.finditer(r"docs/[\w./-]+\.md", source.read_text(encoding="utf-8")):
            refs.add(match.group(0))
    return refs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--json", type=Path)
    parser.add_argument(
        "--exclude-part",
        action="append",
        default=[],
        help="exclude docs whose relative path contains this component",
    )
    args = parser.parse_args()
    root = args.root.resolve()
    excluded = DEFAULT_EXCLUDE_PARTS | set(args.exclude_part)

    docs = sorted(
        path
        for path in (root / "docs").rglob("*.md")
        if not excluded.intersection(path.relative_to(root).parts)
    )
    wake_docs = wake_path_references(root)

    corpus: dict[str, str] = {}
    skill_files = list((root / ".claude" / "skills").glob("*/SKILL.md"))
    for path in docs + skill_files:
        for sentence in sentences(path.read_text(encoding="utf-8")):
            key = normalize(sentence)
            if len(key.split()) >= 6 and key not in corpus:
                corpus[key] = str(path.relative_to(root))

    results: dict[str, dict[str, object]] = {}
    for doc in docs:
        rel = str(doc.relative_to(root))
        text = doc.read_text(encoding="utf-8")
        doc_sentences = sentences(text)
        facts = sum(1 for sentence in doc_sentences if FACT.search(sentence))
        duplicates = [
            corpus[normalize(sentence)]
            for sentence in doc_sentences
            if len(normalize(sentence).split()) >= 6
            and corpus.get(normalize(sentence), rel) != rel
        ]
        tokens = round(len(text) / 4)
        tier = read_class(doc, root, wake_docs)
        entry: dict[str, object] = {
            "tier": tier,
            "words": len(text.split()),
            "tokens": tokens,
            "sentences": len(doc_sentences),
            "fact_density": round(facts / len(doc_sentences), 2)
            if doc_sentences
            else 0,
            "dead_refs": dead_refs(text, root),
            "duplicated_in": sorted(set(duplicates)),
        }
        flags: list[str] = []
        if tier == "A" and tokens > TIER_A_MAX:
            flags.append("over-token-max")
        elif tier == "A" and tokens > TIER_A_TARGET:
            flags.append("over-token-target")
        if entry["dead_refs"] and tier != "C":
            flags.append("stale")
        if entry["duplicated_in"] and tier != "C":
            flags.append("duplication")
        entry["flags"] = flags
        results[rel] = entry

    report = {
        "budgets": {
            "tier_a_tokens": {"target": TIER_A_TARGET, "max": TIER_A_MAX},
            "stale_refs": 0,
        },
        "wake_path_docs": sorted(wake_docs),
        "docs": results,
    }
    if args.json:
        args.json.write_text(json.dumps(report, indent=1), encoding="utf-8")

    width = max((len(name) for name in results), default=3) + 2
    print(
        f"{'doc':{width}}{'tier':>5}{'words':>7}{'~tok':>6}"
        f"{'dens':>6}{'dead':>5}{'dup':>4}  flags"
    )
    order = sorted(
        results.items(), key=lambda item: (str(item[1]["tier"]), -int(item[1]["tokens"]))
    )
    for rel, result in order:
        print(
            f"{rel:{width}}{str(result['tier']):>5}{int(result['words']):7d}"
            f"{int(result['tokens']):6d}{float(result['fact_density']):6.2f}"
            f"{len(result['dead_refs']):5d}{len(result['duplicated_in']):4d}"
            f"  {','.join(result['flags'])}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
