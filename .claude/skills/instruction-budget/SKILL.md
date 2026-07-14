---
name: instruction-budget
description: Measure instruction and token budgets, then render an HTML report with ranked reduction suggestions.
disable-model-invocation: true
---

# Instruction Budget

Measure each static instruction layer, compare it with the project budgets, and
render one HTML report with ranked suggestions.

Treat a sentence outside code blocks and frontmatter as one instruction and
estimate tokens as characters divided by four. Use these default budgets:

- skill file: target 25 instructions, maximum 30;
- session doctrine: target 30 instructions, maximum 45;
- execution slice: 25 instructions;
- full run: 100–150 instructions before reliability degrades.

Run `python3 <skill>/references/measure.py --root <project> --json <output>`.
Update the role-to-skill and chain maps when the project routes work differently.

Copy `references/report-template.html` to the project's metrics directory,
defaulting to `docs/metrics/instruction-budget/<date>.html`. Add the measurement
data, date, baseline commit, and ranked suggestions. Rank budget breaches first,
near-limit components second, and duplicated rules third; name the concrete edit
and projected savings for each suggestion.

Compare the report with its predecessor and explain meaningful movement. Render
the HTML in a browser and reconcile its tiles, bars, and tables with command
output. Return the report path and the worst session-doctrine ratio.
