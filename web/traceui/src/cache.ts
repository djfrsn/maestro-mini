// Server-data resource cache (decision-record §3). A small, id-keyed store
// built on @preact/signals: each key holds the last server snapshot plus its
// load state as signals, so a component that reads a resource re-renders only
// when that resource changes. The SSE `changed` stream invalidates the live
// keys, which refetch in place — no store holds scroll or selection, and no
// component rebuilds the world.
//
// Two guarantees the list/waterfall/detail surfaces rely on:
//   • one in-flight fetch per key — concurrent refreshes share a promise;
//   • invalidate() refetches every live key in place, keeping the prior value
//     visible until the new one lands (a failed refetch keeps the last good
//     value rather than flashing an error).
import { signal, type Signal } from "@preact/signals";

// Resource is the read-only face of one cached key: the last value, the last
// error, and whether a fetch is in flight. refresh() forces a refetch.
export interface Resource<T> {
  readonly data: Signal<T | undefined>;
  readonly error: Signal<Error | undefined>;
  readonly loading: Signal<boolean>;
  refresh(): Promise<void>;
}

interface Entry<T> {
  data: Signal<T | undefined>;
  error: Signal<Error | undefined>;
  loading: Signal<boolean>;
  fetcher: () => Promise<T>;
  inflight: Promise<void> | undefined;
  generation: number;
}

export class ResourceCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  // resource returns the cached resource for key, creating and kicking off its
  // first load on first request. Re-requesting a live key returns the same
  // signals (a cache hit) and refreshes the fetcher to the latest closure.
  resource<T>(key: string, fetcher: () => Promise<T>): Resource<T> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing) {
      existing.fetcher = fetcher;
      return this.face(key, existing);
    }
    const entry: Entry<T> = {
      data: signal<T | undefined>(undefined),
      error: signal<Error | undefined>(undefined),
      loading: signal(false),
      fetcher,
      inflight: undefined,
      generation: 0,
    };
    this.entries.set(key, entry as Entry<unknown>);
    void this.load(entry);
    return this.face(key, entry);
  }

  // has reports whether a key is currently cached (live).
  has(key: string): boolean {
    return this.entries.has(key);
  }

  // drop evicts a key so a collapsed surface stops refetching on invalidate.
  drop(key: string): void {
    this.entries.delete(key);
  }

  // invalidate refetches every live key in place. The SSE `changed` handler
  // calls this; the shared-promise dedup means a key already mid-fetch is not
  // fetched twice.
  invalidate(): void {
    for (const entry of this.entries.values()) {
      void this.load(entry);
    }
  }

  private face<T>(key: string, entry: Entry<T>): Resource<T> {
    return {
      data: entry.data,
      error: entry.error,
      loading: entry.loading,
      refresh: () => {
        const live = this.entries.get(key) as Entry<T> | undefined;
        return live ? this.load(live) : Promise.resolve();
      },
    };
  }

  // load fetches one entry, deduping concurrent calls behind a shared promise.
  // A superseded fetch (its generation no longer current) drops its result. A
  // failed fetch records the error but keeps the last good value.
  private load<T>(entry: Entry<T>): Promise<void> {
    if (entry.inflight) {
      return entry.inflight;
    }
    const generation = ++entry.generation;
    entry.loading.value = true;
    const run = entry
      .fetcher()
      .then((value) => {
        if (generation === entry.generation) {
          entry.data.value = value;
          entry.error.value = undefined;
        }
      })
      .catch((err: unknown) => {
        if (generation === entry.generation) {
          entry.error.value =
            err instanceof Error ? err : new Error(String(err));
        }
      })
      .finally(() => {
        if (entry.inflight === run) {
          entry.inflight = undefined;
        }
        if (generation === entry.generation) {
          entry.loading.value = false;
        }
      });
    entry.inflight = run;
    return run;
  }
}
