// Unit tests for the contract client's error typing: a failed fetch throws an
// ApiError carrying the HTTP status, and isSessionGone recognises only the 404
// "not in the current snapshot" case — the signal the row surfaces as a
// graceful "no longer available" state rather than a raw error.
import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, fetchTree, isSessionGone } from "./api.ts";

type Fetch = typeof globalThis.fetch;

function withFetch(stub: Fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as Response;
}

test("a 404 fetch throws an ApiError isSessionGone recognises", async () => {
  await withFetch(
    async () => response(404),
    async () => {
      const err = await fetchTree("gone-id").then(
        () => null,
        (e: unknown) => e,
      );
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.equal(err.message, "tree fetch failed (404)");
      assert.equal(isSessionGone(err), true);
    },
  );
});

test("a 500 fetch is an ApiError but not 'gone'", async () => {
  await withFetch(
    async () => response(500),
    async () => {
      const err = await fetchTree("id").then(
        () => null,
        (e: unknown) => e,
      );
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 500);
      assert.equal(isSessionGone(err), false);
    },
  );
});

test("isSessionGone is false for non-ApiError failures", () => {
  assert.equal(isSessionGone(new TypeError("network down")), false);
  assert.equal(isSessionGone(new Error("boom")), false);
  assert.equal(isSessionGone(undefined), false);
});
