---
name: grading
description: Grade a completed agent run from session and artifact evidence against a source-backed quality rubric.
disable-model-invocation: true
---

# Grading

Grade a completed run independently from its own summary. Read the full
available root and descendant session evidence, original contract, governing
skills, exact artifact, checker verdict, and external receipts before forming
an opinion.

Score each dimension as `pass`, `fail`, or `n/a` with a citation:

- `right_work`: the run addressed the user-selected Jira ticket and current
  acceptance basis;
- `fanout_matched_work`: delegation depth matched independence and risk;
- `right_skills`: each role used the procedure named by its contract;
- `checker_ran`: an independent checker evaluated the exact final artifact;
- `checking_matched_risk`: exercised surfaces matched blast radius;
- `done_is_done`: every acceptance criterion has authoritative evidence;
- `external_state_matches`: Jira, pull request, and reported receipts agree;
- `handoff_reflects_reality`: unresolved risks and next actions remain visible.

For blinded prompt comparisons, withhold prompt version, branch name, and
change description from the grader. Return one JSON object containing the Jira
key, artifact identity, per-dimension result and evidence, overall result, and
gating notes. Overall fails when any mechanical gate fails or a judgment
failure makes the completion claim unsafe to trust.
