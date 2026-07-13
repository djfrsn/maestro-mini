---
name: engineering
description: Make a bounded repository change from observed behavior and prove it through the intended public interface.
disable-model-invocation: true
---

# Engineering

Read the repository instructions and inspect current status before editing.
Preserve unrelated work. Reproduce the behavior or inspect the real flow before
changing it.

Make the smallest coherent change that satisfies the full acceptance basis.
Prefer existing repository code, then standard platform features, then current
dependencies. Add a seam only when a real boundary or second implementation
needs one. Validate inputs early, keep types precise, and include diagnostic
context in errors without exposing sensitive data.

Run formatting, linting, focused tests, and the broader checks warranted by the
blast radius. Exercise non-trivial behavior through its public interface with a
small edge-case battery. Update documentation when operational truth changes.

Return changed paths, behavior before and after, commands and results, skipped
checks, residual risk, and blockers. The final gate belongs to a checker that
did not produce the artifact.
