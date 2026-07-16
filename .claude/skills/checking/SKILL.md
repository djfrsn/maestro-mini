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

Severity describes impact: `P0` fails the purpose or creates serious harm;
`P1` is a material defect with broad impact or no reasonable workaround; `P2`
is a real defect with narrow impact or a workaround; `P3` is polish or
preference.

Category determines disposition. An `outcome blocker` means the acceptance
basis, required evidence, or safe operation fails. A `likely real-world
failure` traces a supported path and realistic preconditions to a violated
acceptance, safety, privacy, durability, or compatibility invariant. Both
categories gate. A `hardening follow-up` covers resilience, polish, or uncommon
edges and does not gate.

Use `pass` only when no gating finding remains on the exact reviewed artifact.
Use `changes-requested` when a gating finding remains, and `blocked` when the
required evidence cannot be obtained. Do not author fixes while occupying the
checker role.

Return the acceptance basis, checks run, findings, unchecked surfaces, residual
risks, and verdict.
