// Unit tests for the signals resource cache: the two guarantees the live
// surfaces depend on — one in-flight fetch per key, and invalidate() refetches
// in place while keeping the last good value. Run via `npm test` (node's test
// runner with TypeScript type-stripping); skipped cleanly where Node is absent.
import assert from "node:assert/strict";
import test from "node:test";
import { ResourceCache } from "./cache.ts";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("one in-flight fetch per key despite concurrent refreshes", async () => {
  const cache = new ResourceCache();
  let calls = 0;
  let pending = deferred<number>();
  const resource = cache.resource("k", () => {
    calls += 1;
    return pending.promise;
  });

  // Creating the resource kicks off exactly one load.
  assert.equal(calls, 1);
  assert.equal(resource.loading.value, true);

  // A concurrent refresh dedups behind the in-flight promise.
  const second = resource.refresh();
  assert.equal(calls, 1);

  pending.resolve(42);
  await second;
  assert.equal(resource.data.value, 42);
  assert.equal(resource.error.value, undefined);
  assert.equal(resource.loading.value, false);
});

test("invalidate refetches live keys in place", async () => {
  const cache = new ResourceCache();
  let calls = 0;
  let pending = deferred<number>();
  const resource = cache.resource("k", () => {
    calls += 1;
    return pending.promise;
  });
  pending.resolve(1);
  await resource.refresh();
  assert.equal(resource.data.value, 1);

  pending = deferred<number>();
  cache.invalidate();
  assert.equal(calls, 2);
  const refetch = resource.refresh(); // dedups onto the invalidate fetch
  pending.resolve(2);
  await refetch;
  assert.equal(resource.data.value, 2);
});

test("a failed refetch keeps the last good value", async () => {
  const cache = new ResourceCache();
  let pending = deferred<number>();
  const resource = cache.resource("k", () => pending.promise);
  pending.resolve(7);
  await resource.refresh();

  pending = deferred<number>();
  const refetch = resource.refresh();
  pending.reject(new Error("boom"));
  await refetch;

  assert.equal(resource.data.value, 7);
  assert.ok(resource.error.value instanceof Error);
  assert.equal(resource.loading.value, false);
});
