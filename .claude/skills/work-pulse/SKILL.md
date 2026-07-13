---
name: work-pulse
description: Evaluate one control-plane-selected Jira work scope and return verified state and next actions.
disable-model-invocation: true
---

# Work Pulse

Run one bounded wake when explicitly scheduled. Use the existing Atlassian MCP
and repository tools to inspect only the scope supplied by the control plane.

Prioritize decisions, failures, blockers, and review-ready outcomes. Separate
observed facts from inference and never upgrade a maker's completion claim to a
verified result.

Default to a read-only result. Perform a Jira comment, transition, pull-request
mutation, merge, or outbound message only when the scheduled task carries
standing authority for that exact action. Re-read external state after writes
and retain receipts.

When nothing requires attention, return exactly `NOTHING_TO_DO`. Otherwise
report each item as: Jira key, current state, evidence, authority needed, and
next action. Render selected software work as `/maestro <Jira-key>`. Do not
expand the supplied scope.
