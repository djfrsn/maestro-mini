// The overview summary reports dataset-wide Sessions and token counts from the
// API totals, so it stays correct while only the first pages are loaded. Before
// this wiring the summary summed the loaded rows and undercounted every dataset
// larger than one page.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { RootSummary } from "./contract.gen.ts";
import { datasetTotals, rows, summary } from "./store.ts";

function mkRow(id: string, tokens: number): RootSummary {
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
    node_count: 1,
    source_path: "",
    confidence: "full",
  };
}

beforeEach(() => {
  rows.value = [];
  datasetTotals.value = null;
});

test("summary reports dataset totals, not the loaded page", () => {
  rows.value = [mkRow("A", 10), mkRow("B", 20)];
  datasetTotals.value = {
    sessions: 1508,
    active: 102,
    total_tokens: 11_409_727_198,
  };

  assert.equal(summary.value.count, 1508);
  assert.equal(summary.value.tokens, 11_409_727_198);
});

test("summary falls back to loaded rows when totals are absent", () => {
  rows.value = [mkRow("A", 10), mkRow("B", 20)];
  datasetTotals.value = null;

  assert.equal(summary.value.count, 2);
  assert.equal(summary.value.tokens, 30);
});
