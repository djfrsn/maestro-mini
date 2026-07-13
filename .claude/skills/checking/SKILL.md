---
name: checking
description: Independently review a durable artifact against an explicit acceptance basis and return an evidence-backed gate verdict.
disable-model-invocation: true
---

# Checking

Use a context that produced none of the artifact whenever available. State the
independence boundary in the verdict.

Reconstruct the acceptance basis from the original ask, Jira item, decisions,
repository instructions, and tests before relying on the maker's framing.
Exercise the artifact through its intended interface. Inspect relevant source,
callers, edge cases, dependencies, trust boundaries, configuration, tests, and
documentation in proportion to risk.

Every finding contains:

- `P0` through `P3` severity;
- `outcome blocker`, `likely real-world failure`, or `hardening follow-up`;
- concrete evidence and a reproducible failure scenario;
- expected behavior and disposition.

Use `pass` only when no gating finding remains on the exact reviewed artifact.
Use `changes-requested` when a gating finding remains, and `blocked` when the
required evidence cannot be obtained. Do not author fixes while occupying the
checker role.

Return the acceptance basis, checks run, findings, unchecked surfaces, residual
risks, and verdict.
