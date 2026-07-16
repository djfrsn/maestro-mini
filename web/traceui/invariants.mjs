// Founding-invariant gate (decision-record.md §8). Two rules oxlint cannot
// express directly, checked here as a lint step wired into `go generate`:
//
//   1. Untrusted transcript text reaches the DOM only as text. Assigning
//      innerHTML/outerHTML or calling insertAdjacentHTML is the exact escape
//      hatch that would defeat Preact's auto-escaping, so it is banned in
//      src/. (react/no-danger covers the JSX dangerouslySetInnerHTML prop.)
//   2. Ephemeral scroll and text selection stay uncontrolled — in the DOM,
//      never in a store. A scrollTop/scrollLeft/selection value assigned into
//      a signal()/computed() would pull that state into the reactive graph;
//      banned here.
//
// A hit prints file:line and exits non-zero. An explicit `// invariant-ok:`
// comment on the offending line documents a reviewed exception.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const RULES = [
  {
    name: "no-raw-html",
    re: /\.(innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/,
    why: "untrusted text must reach the DOM as text (textContent / Preact child), never as HTML",
  },
  {
    name: "uncontrolled-scroll",
    re: /\b(signal|computed)\s*\([^)]*\.(scrollTop|scrollLeft|getSelection)\b/,
    why: "ephemeral scroll/selection stay in the DOM, never in a signal store",
  },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

let violations = 0;
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes("invariant-ok:")) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations++;
        console.error(`${file}:${i + 1}: invariant(${rule.name}): ${rule.why}`);
        console.error(`    ${line.trim()}`);
      }
    }
  });
}

if (violations > 0) {
  console.error(`\n${violations} founding-invariant violation(s).`);
  process.exit(1);
}
console.log("invariants: clean (no-raw-html, uncontrolled-scroll)");
