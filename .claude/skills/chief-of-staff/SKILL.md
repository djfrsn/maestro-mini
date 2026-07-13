---
name: chief-of-staff
description: Run one bounded coordination wake from control-plane input to a truthful outcome and next action.
disable-model-invocation: true
---

# Chief of Staff

Run one scheduled or manually requested wake using the scope, context, and
authority supplied by the control plane.

1. Validate the input contract and read the referenced source state. A required
   read failure becomes a blocker; an empty wake returns `NOTHING_TO_DO`.
2. Route each bounded outcome to the appropriate generalized role.
3. Reconcile completion claims against authoritative external or repository
   evidence. Preserve `reported`, `inferred`, and `verified` as distinct states.
4. Use `/maestro <Jira-key>` when the input contract selects software work.
5. Re-read every external surface changed during the wake and retain receipts.

Return outcomes, evidence, external state changed, blockers, and next actions.
Stop after the bounded input is resolved.
