// Regression coverage for pagination-preserving SSE reconciliation. Refreshes
// merge page one into the loaded cursor chain; active rows absent from page one
// are removed only after their tree authoritatively returns 404.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { RootSummary, Totals } from "./contract.gen.ts";
import {
  datasetTotals,
  loadMore,
  markSessionGone,
  nextCursor,
  refreshTop,
  resetAndReload,
  rows,
} from "./store.ts";

let page: RootSummary[] = [];
let pageCursor: string | null = null;
let pageTotals: Totals = { sessions: 0, agents: 0, total_tokens: 0 };
const cursorPages = new Map<
  string,
  { sessions: RootSummary[]; next_cursor: string | null }
>();
const pendingCursorPages = new Map<string, Promise<Response>>();
let pendingTopResponse: Promise<Response> | null = null;
const treeStatuses = new Map<string, number>();
const pendingTreeResponses = new Map<string, Promise<Response>>();
const treeRequested = new Map<string, () => void>();

globalThis.fetch = (async (input) => {
  const requestURL =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(requestURL, "http://traceui.test");
  const tree = url.pathname.match(/\/api\/v1\/sessions\/([^/]+)\/tree$/);
  if (tree) {
    const id = decodeURIComponent(tree[1] ?? "");
    treeRequested.get(id)?.();
    const pending = pendingTreeResponses.get(id);
    if (pending) return pending;
    const status = treeStatuses.get(id) ?? 200;
    return new Response(
      JSON.stringify(
        status === 200
          ? { as_of: AS_OF, document: {} }
          : { error: status === 404 ? "unknown session" : "unavailable" },
      ),
      { status },
    );
  }

  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    const pending = pendingCursorPages.get(cursor);
    if (pending) return pending;
  }
  const response = cursor
    ? cursorPages.get(cursor)
    : { sessions: page, next_cursor: pageCursor };
  if (!cursor && pendingTopResponse) return pendingTopResponse;
  assert.ok(response, `unexpected cursor ${cursor}`);
  return new Response(JSON.stringify({ ...response, totals: pageTotals }), {
    status: 200,
  });
}) as typeof globalThis.fetch;

function mkRow(
  id: string,
  status: RootSummary["status"] = "done",
): RootSummary {
  return {
    provider: "claude",
    session_id: id,
    started_at: null,
    ended_at: null,
    status,
    model: "",
    usage: null,
    node_count: 1,
    source_path: "",
    confidence: "high",
  };
}

const ids = (): string[] => rows.value.map((row) => row.session_id);
const AS_OF = "2026-07-15T00:00:00Z";

async function seed(...loaded: RootSummary[]): Promise<void> {
  page = loaded;
  pageCursor = null;
  pageTotals = {
    sessions: loaded.length,
    agents: loaded.reduce(
      (sum, row) => sum + Math.max(Number(row.node_count) - 1, 0),
      0,
    ),
    total_tokens: loaded.reduce(
      (sum, row) => sum + Number(row.usage?.total_tokens ?? 0),
      0,
    ),
  };
  cursorPages.clear();
  pendingCursorPages.clear();
  pendingTopResponse = null;
  pendingTreeResponses.clear();
  treeStatuses.clear();
  treeRequested.clear();
  await resetAndReload();
  assert.deepEqual(
    ids(),
    loaded.map((row) => row.session_id),
  );
}

beforeEach(async () => {
  await seed();
});

test("refresh preserves loaded later pages and their pagination cursor", async () => {
  page = [mkRow("A")];
  pageCursor = "page-2";
  cursorPages.set("page-2", {
    sessions: [mkRow("B")],
    next_cursor: "page-3",
  });
  await resetAndReload();
  await loadMore();
  assert.deepEqual(ids(), ["A", "B"]);

  page = [mkRow("N"), mkRow("A")];
  pageCursor = "replacement-page-2";
  await refreshTop(AS_OF);

  assert.deepEqual(ids(), ["A", "B", "N"]);
  assert.equal(nextCursor.value, "page-3");
});

test("pagination and SSE refresh preserve dataset-wide overview totals", async () => {
  page = [mkRow("A")];
  pageCursor = "page-2";
  pageTotals = { sessions: 501, agents: 777, total_tokens: 9_999_999 };
  cursorPages.set("page-2", {
    sessions: [mkRow("B")],
    next_cursor: "page-3",
  });
  await resetAndReload();
  await loadMore();
  assert.deepEqual(datasetTotals.value, pageTotals);

  page = [mkRow("N"), mkRow("A")];
  await refreshTop(AS_OF);

  assert.deepEqual(datasetTotals.value, {
    sessions: 501,
    agents: 777,
    total_tokens: 9_999_999,
  });
  assert.deepEqual(ids(), ["A", "B", "N"]);
});

test("a vanished active row is probed and pruned", async () => {
  await seed(mkRow("A"), mkRow("V", "active"));
  treeStatuses.set("V", 404);
  page = [mkRow("A")];

  await refreshTop(AS_OF);

  assert.deepEqual(ids(), ["A"]);
});

test("a paged-off active row is preserved when its tree still exists", async () => {
  await seed(mkRow("A"), mkRow("P", "active"));
  page = [mkRow("A")];

  await refreshTop(AS_OF);

  assert.deepEqual(ids(), ["A", "P"]);
});

test("a paged-off active row is preserved after a transient tree failure", async () => {
  await seed(mkRow("A"), mkRow("T", "active"));
  treeStatuses.set("T", 503);
  page = [mkRow("A")];

  await refreshTop(AS_OF);

  assert.deepEqual(ids(), ["A", "T"]);
});

test("a completed deep-page row remains loaded without a tree probe", async () => {
  await seed(mkRow("A"), mkRow("D"));
  treeStatuses.set("D", 404);
  page = [mkRow("A")];

  await refreshTop(AS_OF);

  assert.deepEqual(ids(), ["A", "D"]);
});

test("a row already confirmed gone by expansion is pruned on refresh", async () => {
  await seed(mkRow("A"), mkRow("G"));
  markSessionGone("G");
  page = [mkRow("A")];

  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A"]);

  page = [mkRow("A"), mkRow("G")];
  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A", "G"]);
});

test("a page response in flight during refresh cannot restore stale rows", async () => {
  page = [mkRow("A")];
  pageCursor = "old-page-2";
  await resetAndReload();

  let resolveOldPage: ((response: Response) => void) | undefined;
  pendingCursorPages.set(
    "old-page-2",
    new Promise((resolve) => {
      resolveOldPage = resolve;
    }),
  );
  const stalePage = loadMore();

  page = [mkRow("N"), mkRow("A")];
  await refreshTop(AS_OF);
  resolveOldPage?.(
    new Response(
      JSON.stringify({ sessions: [mkRow("C")], next_cursor: null }),
      { status: 200 },
    ),
  );
  await stalePage;

  assert.deepEqual(ids(), ["A", "N"]);
  assert.equal(nextCursor.value, "old-page-2");
});

test("a stale tree 404 cannot prune a row reconfirmed by a later page", async () => {
  const active = mkRow("P", "active");
  page = [mkRow("A"), active];
  pageCursor = "page-2";
  pageTotals = { sessions: 2, agents: 0, total_tokens: 0 };
  cursorPages.set("page-2", {
    sessions: [mkRow("P", "active")],
    next_cursor: null,
  });
  await resetAndReload();

  let resolveTree: ((response: Response) => void) | undefined;
  pendingTreeResponses.set(
    "P",
    new Promise((resolve) => {
      resolveTree = resolve;
    }),
  );
  let noteTreeRequested: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => {
    noteTreeRequested = resolve;
  });
  treeRequested.set("P", () => noteTreeRequested?.());

  page = [mkRow("A")];
  const refresh = refreshTop(AS_OF);
  await requested;
  await loadMore();
  resolveTree?.(
    new Response(JSON.stringify({ error: "unknown session" }), { status: 404 }),
  );
  await refresh;

  assert.deepEqual(ids(), ["A", "P"]);
});

test("a page launched during refresh cannot overwrite fresh SSE totals", async () => {
  page = [mkRow("A")];
  pageCursor = "old-page-2";
  pageTotals = { sessions: 50, agents: 5, total_tokens: 50 };
  await resetAndReload();

  let resolveTop: ((response: Response) => void) | undefined;
  pendingTopResponse = new Promise((resolve) => {
    resolveTop = resolve;
  });
  let resolveCursor: ((response: Response) => void) | undefined;
  pendingCursorPages.set(
    "old-page-2",
    new Promise((resolve) => {
      resolveCursor = resolve;
    }),
  );

  const refresh = refreshTop(AS_OF);
  const stalePage = loadMore();
  resolveTop?.(
    new Response(
      JSON.stringify({
        sessions: [mkRow("N"), mkRow("A")],
        next_cursor: "new-page-2",
        totals: { sessions: 100, agents: 10, total_tokens: 100 },
      }),
      { status: 200 },
    ),
  );
  await refresh;
  resolveCursor?.(
    new Response(
      JSON.stringify({
        sessions: [mkRow("OLD")],
        next_cursor: null,
        totals: { sessions: 50, agents: 5, total_tokens: 50 },
      }),
      { status: 200 },
    ),
  );
  await stalePage;

  assert.deepEqual(ids(), ["A", "N"]);
  assert.deepEqual(datasetTotals.value, {
    sessions: 100,
    agents: 10,
    total_tokens: 100,
  });
});
