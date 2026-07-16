---
name: planning
description: Turn a multi-step software goal into a bounded, resumable plan with explicit acceptance evidence.
disable-model-invocation: true
---

# Planning

Do the repository and Jira legwork first. Ask one question at a time only for
intent, tradeoffs, or authority that cannot be discovered safely.

Define:

- outcome and business value;
- acceptance basis and verification surface;
- constraints and allowed boundaries;
- dependencies and irreversible seams;
- authority for external writes;
- blocked stop condition;
- residual risks and open decisions.

Split implementation into the fewest coherent vertical slices. Each slice must
produce an independently useful, independently verifiable result with a named
next action. Order hard dependencies first, then expensive-to-change contracts,
then risk-reducing tracer bullets.

Limit each slice's plan to 25 instructions, using the instruction definition in
`$instruction-budget`. When a coherent slice requires more, split it into
smaller vertical slices; preserve necessary instructions instead of compressing
them to meet the limit.

For Jira-driven work, write the spec and plan under the repository's existing
issue convention or `docs/work/<Jira-key>/` by default. Use the Jira ticket as
the work identity; do not create another work item.

Before presenting the plan, walk every dependency and acceptance criterion for
gaps, vague evidence, hidden scope, and capacity assumptions. Return a compact
checklist that another context can resume.
