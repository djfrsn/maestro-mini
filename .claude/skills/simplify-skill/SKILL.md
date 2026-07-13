---
name: simplify-skill
description: Distill one prompt or skill to the words that change agent behavior without losing ownership of a rule.
argument-hint: <skill or prompt path>
disable-model-invocation: true
---

# Simplify Skill

Treat `$ARGUMENTS` as the target. If it is missing, ask for one and stop.

Classify each instruction outside code examples and frontmatter:

- **trained prior:** reliably supplied by the model; remove;
- **duplicate:** owned elsewhere; keep one canonical owner;
- **router:** selection already supplied by a parent contract; remove;
- **parameter:** varies per task; move into contract data;
- **calibration:** ordered scales, thresholds, or decision menus; preserve;
- **house rule:** pressure-resistant behavior the model otherwise skips;
  preserve concisely.

Before editing, present a line-by-line keep, cut, or move table with the reason
and projected size. After approval, rewrite the target, update every reference,
and record removed rules in the repository's existing decision or removal log
when one exists. Validate package discovery and all affected tests. Report the
before and after size, rule ownership changes, commands and results, and any
unresolved risk. Commit only under repository policy or explicit authority.
