// The overview summary reports dataset-wide session, token, and spawned-agent
// counts from API totals while busiest remains derived from loaded rows.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { RootSummary } from "./contract.gen.ts";
import { datasetTotals, rows, summary } from "./store.ts";

function mkRow(id: string, tokens: number, nodeCount = 1): RootSummary {
  return {
    provider: "claude",
    session_id: id,
    started_at: null,
    ended_at: null,
    status: "completed",
    model: "",
    usage: {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: tokens,
    },
    node_count: nodeCount,
    source_path: "",
    confidence: "full",
  };
}

beforeEach(() => {
  rows.value = [];
  datasetTotals.value = null;
});

test("summary reports dataset totals while busiest uses loaded rows", () => {
  rows.value = [mkRow("A", 30, 2), mkRow("B", 20, 4)];
  datasetTotals.value = {
    sessions: 1508,
    agents: 4096,
    total_tokens: 11_409_727_198,
  };

  assert.equal(summary.value.count, 1508);
  assert.equal(summary.value.tokens, 11_409_727_198);
  assert.equal(summary.value.agents, 4096);
  assert.equal(summary.value.busiest?.session_id, "A");
});

test("summary falls back to loaded rows when totals are absent", () => {
  rows.value = [mkRow("A", 10, 2), mkRow("B", 20, 4)];
  datasetTotals.value = null;

  assert.equal(summary.value.count, 2);
  assert.equal(summary.value.tokens, 30);
  assert.equal(summary.value.agents, 4);
  assert.equal(summary.value.busiest?.session_id, "B");
});
