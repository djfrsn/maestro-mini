// The app's single server-data cache and the per-surface resource accessors
// built on it. Trees and details are keyed by session id; a collapsed or
// scrolled-away surface drops its key so it stops refetching, and the SSE
// `changed` stream invalidates every live key at once — each refetches in
// place, keeping its last good value until the new one lands.
import { fetchDetail, fetchTree } from "./api.ts";
import { type Resource, ResourceCache } from "./cache.ts";
import type { DetailResponse, TreeResponse } from "./contract.gen.ts";

const cache = new ResourceCache();

const treeKey = (id: string): string => `tree:${id}`;
const detailKey = (id: string): string => `detail:${id}`;

export function treeResource(id: string): Resource<TreeResponse> {
  return cache.resource(treeKey(id), () => fetchTree(id));
}

export function detailResource(id: string): Resource<DetailResponse> {
  return cache.resource(detailKey(id), () => fetchDetail(id));
}

export function dropTree(id: string): void {
  cache.drop(treeKey(id));
}

export function dropDetail(id: string): void {
  cache.drop(detailKey(id));
}

// invalidateResources refetches every live tree and detail in place. The SSE
// `changed` handler calls it so an open waterfall or conversation updates as
// new turns land.
export function invalidateResources(): void {
  cache.invalidate();
}
