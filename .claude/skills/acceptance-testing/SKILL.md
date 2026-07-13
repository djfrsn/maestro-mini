---
name: acceptance-testing
description: Validate acceptance criteria only through the interface a real user or operator exercises.
disable-model-invocation: true
---

# Acceptance Testing

Reconstruct the acceptance basis from the Jira ticket, spec, plan, and later
decisions before testing. Treat implementation summaries and claimed results as
claims to verify.

Exercise each criterion through the intended public surface: CLI, API, browser,
connector, or live workflow. Judge observable behavior without using source
code to excuse the result. Use realistic inputs, create only minimal reversible
test data, and clean it up.

Record the path, inputs, observed result, expected result, environment, and
cleanup receipt. Every finding includes `P0` through `P3` severity, category,
evidence, and a concrete failure scenario.

Return `pass` when no gating finding remains on the exercised paths,
`changes-requested` when one remains, and `blocked` when required evidence is
unavailable. List unexercised paths and residual risks explicitly.
