---
name: doc-budget
description: Audit project documentation against read-class budgets and render an HTML report with pruning suggestions.
disable-model-invocation: true
---

# Doc Budget

Measure project documentation, classify flagged passages with the doc razor,
and render one HTML report with ranked pruning suggestions.

Assign each document one read class:

- A wake-path: loaded by a skill, agent, or heartbeat; target 1,000 tokens and
  maximum 2,000;
- B basis: supports planning or checking; zero dead references and one owner
  for each rule;
- C archival: carries a scratchpad or source-material marker near the top.

Classify passages as contract, decision record, pointer, duplicate, narrative,
or stale. Keep contracts whole, preserve decision history, keep pointers within
one hop, cut duplicate and narrative text, and fix or cut stale references.

Run `python3 <skill>/references/measure_docs.py --root <project> --json <output>`.
Adjust exclusions and archival markers when the documentation tree changes.

Present a per-document verdict table with `keep`, `cut`, `fix`, `graduate`, or
`archive` and projected word counts before editing documents. Copy
`references/report-template.html` to the project's metrics directory, defaulting
to `docs/metrics/doc-budget/<date>.html`, then add the data, date, baseline commit,
and ranked suggestions.

Compare the report with its predecessor, explain meaningful movement, and render
the HTML in a browser. Reconcile the rendered report with command output and
return the report path plus every unresolved flag.
