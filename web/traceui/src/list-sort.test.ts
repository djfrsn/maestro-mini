// Unit tests for the list-UX derivations: runtime-sort ordering (live rows
// measured against a fixed "now") and the Active/Completed section split that
// feeds the virtualizer. Pure functions, no DOM — run via `npm test`.
import assert from "node:assert/strict";
import test from "node:test";
import type { RootSummary } from "./contract.gen.ts";
import { fmtSpan, rowRuntimeMs } from "./format.ts";
import { groupIntoSections, type ListRow, rowComparator } from "./store.ts";

// row builds a minimal RootSummary; only the fields the sorts and split read
// need to be meaningful.
function row(over: Partial<RootSummary>): RootSummary {
  return {
    provider: "claude",
    session_id: "s",
    started_at: null,
    ended_at: null,
    status: "completed",
    model: "",
    usage: null,
    node_count: 1,
    source_path: "",
    confidence: "high",
    ...over,
  };
}

const NOW = Date.parse("2026-07-15T12:00:00Z");

test("fmtSpan includes the end day only when the local calendar day changes", () => {
  const start = new Date(2026, 6, 12, 16, 38, 2);
  const sameDayEnd = new Date(2026, 6, 12, 16, 56, 48);
  const nextDayEnd = new Date(2026, 6, 13, 16, 56, 48);

  assert.equal(
    fmtSpan(
      row({
        started_at: start.toISOString(),
        ended_at: sameDayEnd.toISOString(),
      }),
    ),
    "Jul 12 16:38:02 → 16:56:48",
  );
  assert.equal(
    fmtSpan(
      row({
        started_at: start.toISOString(),
        ended_at: nextDayEnd.toISOString(),
      }),
    ),
    "Jul 12 16:38:02 → Jul 13 16:56:48",
  );
});

test("rowRuntimeMs uses ended_at for finished rows and now for active ones", () => {
  const finished = row({
    started_at: "2026-07-15T11:00:00Z",
    ended_at: "2026-07-15T11:30:00Z",
  });
  assert.equal(rowRuntimeMs(finished, NOW), 30 * 60 * 1000);

  const active = row({ status: "active", started_at: "2026-07-15T11:45:00Z" });
  assert.equal(rowRuntimeMs(active, NOW), 15 * 60 * 1000);

  assert.equal(rowRuntimeMs(row({}), NOW), -Infinity);
});

test("runtime sort orders longest-running first, mixing live and finished", () => {
  const short = row({
    session_id: "short",
    started_at: "2026-07-15T11:50:00Z",
    ended_at: "2026-07-15T11:55:00Z", // 5m
  });
  const live = row({
    session_id: "live",
    status: "active",
    started_at: "2026-07-15T11:20:00Z", // 40m against NOW
  });
  const long = row({
    session_id: "long",
    started_at: "2026-07-15T09:00:00Z",
    ended_at: "2026-07-15T11:00:00Z", // 2h
  });
  const sorted = [short, live, long]
    .toSorted(rowComparator("runtime", NOW))
    .map((s) => s.session_id);
  assert.deepEqual(sorted, ["long", "live", "short"]);
});

// sectionSessionIds walks the grouped rows and returns, per section header, the
// ordered session ids beneath it.
function sectionSessionIds(rows: ListRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current = "";
  for (const r of rows) {
    if (r.kind === "header") {
      current = r.section;
      out[current] = [];
    } else {
      out[current]?.push(r.session.session_id);
    }
  }
  return out;
}

test("grouping splits Active above the rest and preserves incoming order", () => {
  // Pre-sorted as visibleRows would deliver: a global order the split must keep
  // within each section.
  const visible = [
    row({ session_id: "a1", status: "active" }),
    row({ session_id: "c1", status: "completed" }),
    row({ session_id: "a2", status: "active" }),
    row({ session_id: "c2", status: "aborted" }),
    row({ session_id: "c3", status: "malformed" }),
  ];
  const grouped = groupIntoSections(visible);

  // Header order: Active section before Completed section.
  const headers = grouped.filter((r) => r.kind === "header");
  assert.deepEqual(
    headers.map((h) => (h.kind === "header" ? h.section : "")),
    ["active", "completed"],
  );
  assert.deepEqual(
    headers.map((h) => (h.kind === "header" ? h.count : -1)),
    [2, 3],
  );

  const bySection = sectionSessionIds(grouped);
  assert.deepEqual(bySection["active"], ["a1", "a2"]);
  assert.deepEqual(bySection["completed"], ["c1", "c2", "c3"]);
});

test("grouping omits an empty section entirely", () => {
  const allDone = groupIntoSections([
    row({ session_id: "c1", status: "completed" }),
    row({ session_id: "c2", status: "aborted" }),
  ]);
  const sections = allDone
    .filter((r) => r.kind === "header")
    .map((r) => (r.kind === "header" ? r.section : ""));
  assert.deepEqual(sections, ["completed"]);
  assert.equal(allDone[0]?.kind, "header");
});
