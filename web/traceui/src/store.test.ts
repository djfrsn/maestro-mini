// Unit tests for authoritative page-one reconciliation. An SSE refresh replaces
// the loaded cursor chain with the latest first page, so removed roots vanish
// immediately and subsequent pagination starts from the refreshed cursor.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { RootSummary } from "./contract.gen.ts";
import {
  loadMore,
  nextCursor,
  refreshTop,
  resetAndReload,
  rows,
} from "./store.ts";

let page: RootSummary[] = [];
let pageCursor: string | null = null;
const cursorPages = new Map<
  string,
  { sessions: RootSummary[]; next_cursor: string | null }
>();
const pendingCursorPages = new Map<string, Promise<Response>>();

globalThis.fetch = (async (input) => {
  const requestURL =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(requestURL, "http://traceui.test");
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    const pending = pendingCursorPages.get(cursor);
    if (pending) return pending;
  }
  const response = cursor
    ? cursorPages.get(cursor)
    : { sessions: page, next_cursor: pageCursor };
  assert.ok(response, `unexpected cursor ${cursor}`);
  return new Response(JSON.stringify(response), { status: 200 });
}) as typeof globalThis.fetch;

function mkRow(id: string): RootSummary {
  return {
    provider: "claude",
    session_id: id,
    started_at: null,
    ended_at: null,
    status: "done",
    model: "",
    usage: null,
    node_count: 1,
    source_path: "",
    confidence: "high",
  };
}

const ids = (): string[] => rows.value.map((r) => r.session_id);
const AS_OF = "2026-07-15T00:00:00Z";

// Seed the store's loaded rows through the real load path, then clear it before
// the next test. resetAndReload clears rowById + the gone set and loads page 1.
async function seed(...loaded: string[]): Promise<void> {
  page = loaded.map(mkRow);
  pageCursor = null;
  cursorPages.clear();
  pendingCursorPages.clear();
  await resetAndReload();
  assert.deepEqual(ids(), loaded);
}

beforeEach(async () => {
  await seed();
});

test("refresh removes a root omitted from the latest page one", async () => {
  await seed("A", "B");
  page = [mkRow("A")];
  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A"]);
});

test("a removed root is restored when it reappears", async () => {
  await seed("A", "B");
  page = [mkRow("A")];
  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A"]);

  page = [mkRow("A"), mkRow("B")];
  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A", "B"]);
});

test("refresh discards stale pages and paginates from the new cursor", async () => {
  page = [mkRow("A"), mkRow("B")];
  pageCursor = "old-page-2";
  cursorPages.set("old-page-2", {
    sessions: [mkRow("C")],
    next_cursor: null,
  });
  await resetAndReload();
  await loadMore();
  assert.deepEqual(ids(), ["A", "B", "C"]);

  page = [mkRow("A")];
  pageCursor = "new-page-2";
  cursorPages.set("new-page-2", {
    sessions: [mkRow("D")],
    next_cursor: null,
  });
  await refreshTop(AS_OF);
  assert.deepEqual(ids(), ["A"]);
  assert.equal(nextCursor.value, "new-page-2");

  await loadMore();
  assert.deepEqual(ids(), ["A", "D"]);
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

  pageCursor = "new-page-2";
  await refreshTop(AS_OF);
  resolveOldPage?.(
    new Response(
      JSON.stringify({ sessions: [mkRow("C")], next_cursor: null }),
      { status: 200 },
    ),
  );
  await stalePage;

  assert.deepEqual(ids(), ["A"]);
  assert.equal(nextCursor.value, "new-page-2");
});
