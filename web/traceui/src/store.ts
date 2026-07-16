import { batch, computed, type ReadonlySignal, signal } from "@preact/signals";
import { fetchSessions, fetchTree, isSessionGone } from "./api.ts";
import type { RootSummary, SessionNode, Totals } from "./contract.gen.ts";
import { agentsSpawned, parseTs, rowRuntimeMs, totalTokens } from "./format.ts";

export type SortKey = "recent" | "runtime" | "tokens" | "agents";
export const SORT_KEYS: readonly SortKey[] = [
  "recent",
  "runtime",
  "tokens",
  "agents",
];

const SORT_KEY = "traceui-sort";

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The current choice still applies when storage is unavailable.
  }
}

export const sortKey = signal<SortKey>(
  ((): SortKey => {
    const stored = readLocal(SORT_KEY);
    return SORT_KEYS.includes(stored as SortKey)
      ? (stored as SortKey)
      : "recent";
  })(),
);
export const substr = signal("");

export const expandedIds = signal<Set<string>>(new Set());
export function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
    clearDetailNode(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
}

export const detailNodeByRoot = signal<Map<string, SessionNode>>(new Map());
export function selectDetailNode(rootId: string, node: SessionNode): void {
  const next = new Map(detailNodeByRoot.value);
  next.set(rootId, node);
  detailNodeByRoot.value = next;
}

function clearDetailNode(rootId: string): void {
  if (!detailNodeByRoot.value.has(rootId)) return;
  const next = new Map(detailNodeByRoot.value);
  next.delete(rootId);
  detailNodeByRoot.value = next;
}

const rowById = new Map<string, RootSummary>();
export const rows = signal<RootSummary[]>([]);
// Dataset-wide aggregates reported by the API on every page. The overview reads
// these so its Sessions and token counts reflect the whole dataset, not the
// pages loaded so far.
export const datasetTotals = signal<Totals | null>(null);
export const nextCursor = signal<string | null>(null);
export const loading = signal(false);
export const initialLoaded = signal(false);
export const errorText = signal<string | undefined>(undefined);
export const liveState = signal<"connecting" | "live" | "paused">("connecting");
let pageGeneration = 0;

let asOfMs: number | null = null;
let asOfReceivedAt = 0;
export const clockTick = signal(0);
export function nowMs(): number {
  return asOfMs === null ? Date.now() : asOfMs + (Date.now() - asOfReceivedAt);
}
if (typeof window !== "undefined") {
  window.setInterval(() => {
    clockTick.value = clockTick.peek() + 1;
  }, 1000);
}

function publishRows(): void {
  rows.value = Array.from(rowById.values());
}

function mergeRows(incoming: readonly RootSummary[]): void {
  for (const session of incoming) {
    rowById.set(session.session_id, session);
  }
}

const goneIds = new Set<string>();
export function markSessionGone(id: string): void {
  goneIds.add(id);
}

// Drop rows already confirmed gone by an expanded tree/detail request when
// page one does not re-confirm them. Reappearing rows survive and clear the
// one-shot marker.
function pruneGone(present: ReadonlySet<string>): void {
  for (const id of goneIds) {
    if (!present.has(id)) rowById.delete(id);
  }
  goneIds.clear();
}

function matchesFilter(session: RootSummary, query: string): boolean {
  return (
    session.session_id.toLowerCase().includes(query) ||
    (session.model || "").toLowerCase().includes(query)
  );
}

type RowComparator = (left: RootSummary, right: RootSummary) => number;

export function rowComparator(key: SortKey, now: number): RowComparator {
  switch (key) {
    case "tokens":
      return (left, right) => totalTokens(right) - totalTokens(left);
    case "agents":
      return (left, right) => agentsSpawned(right) - agentsSpawned(left);
    case "runtime":
      return (left, right) =>
        rowRuntimeMs(right, now) - rowRuntimeMs(left, now);
    case "recent":
      return (left, right) =>
        (parseTs(right.started_at) ?? -Infinity) -
        (parseTs(left.started_at) ?? -Infinity);
  }
}

export const visibleRows: ReadonlySignal<RootSummary[]> = computed(() => {
  const query = substr.value;
  return rows.value
    .filter((session) => query === "" || matchesFilter(session, query))
    .toSorted(rowComparator(sortKey.value, nowMs()));
});

export type SectionKey = "active" | "completed";
export type ListRow =
  | { kind: "header"; section: SectionKey; label: string; count: number }
  | { kind: "session"; session: RootSummary };

export function groupIntoSections(visible: readonly RootSummary[]): ListRow[] {
  const active: RootSummary[] = [];
  const completed: RootSummary[] = [];
  for (const session of visible) {
    (session.status === "active" ? active : completed).push(session);
  }
  const result: ListRow[] = [];
  const add = (
    section: SectionKey,
    label: string,
    members: RootSummary[],
  ): void => {
    if (members.length === 0) return;
    result.push({ kind: "header", section, label, count: members.length });
    for (const session of members) result.push({ kind: "session", session });
  };
  add("active", "Active", active);
  add("completed", "Completed", completed);
  return result;
}

export const groupedRows: ReadonlySignal<ListRow[]> = computed(() =>
  groupIntoSections(visibleRows.value),
);

export interface Summary {
  count: number;
  tokens: number;
  agents: number;
  busiest: RootSummary | null;
}

export const summary: ReadonlySignal<Summary> = computed(() => {
  let loadedTokens = 0;
  let loadedAgents = 0;
  let busiest: RootSummary | null = null;
  for (const session of rows.value) {
    const sessionTokens = totalTokens(session);
    loadedTokens += sessionTokens;
    loadedAgents += agentsSpawned(session);
    if (!busiest || sessionTokens > totalTokens(busiest)) busiest = session;
  }
  // Sessions, tokens, and spawned agents are dataset-wide when the API reports
  // totals, so they stay correct before pagination loads every row. Busiest is
  // intentionally derived from the loaded rows.
  const totals = datasetTotals.value;
  return {
    count: totals ? totals.sessions : rows.value.length,
    tokens: totals ? totals.total_tokens : loadedTokens,
    agents: totals ? totals.agents : loadedAgents,
    busiest,
  };
});

function noteTotals(totals: Totals | undefined | null): void {
  if (totals) datasetTotals.value = totals;
}

function noteAsOf(asOf: string): void {
  const parsed = parseTs(asOf);
  if (parsed !== null && Number.isFinite(parsed)) {
    asOfMs = parsed;
    asOfReceivedAt = Date.now();
  }
}

export function seedBootstrap(
  sessions: RootSummary[],
  cursor: string | null,
  totals: Totals | null,
  asOf: string,
): void {
  noteAsOf(asOf);
  batch(() => {
    mergeRows(sessions);
    publishRows();
    noteTotals(totals);
    nextCursor.value = cursor;
    initialLoaded.value = true;
  });
}

export async function loadInitial(): Promise<void> {
  if (!initialLoaded.peek()) await loadPage(undefined);
}

export async function loadMore(): Promise<void> {
  const cursor = nextCursor.peek();
  if (!loading.peek() && cursor !== null) await loadPage(cursor);
}

async function loadPage(cursor: string | undefined): Promise<void> {
  if (loading.peek()) return;
  loading.value = true;
  const generation = pageGeneration;
  try {
    const response = await fetchSessions({ cursor });
    if (generation !== pageGeneration) return;
    batch(() => {
      mergeRows(response.sessions);
      publishRows();
      noteTotals(response.totals);
      nextCursor.value = response.next_cursor;
      initialLoaded.value = true;
      errorText.value = undefined;
    });
  } catch (error) {
    if (generation === pageGeneration) {
      errorText.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    loading.value = false;
  }
}

// Probe active rows not re-confirmed by page one. They may simply be on a later
// page; only the tree endpoint's authoritative 404 permits pruning them.
async function reconcileVanishedActives(
  present: ReadonlySet<string>,
  generation: number,
): Promise<void> {
  const suspects = Array.from(rowById.values()).filter(
    (session) =>
      session.status === "active" && !present.has(session.session_id),
  );
  const vanished = await Promise.all(
    suspects.map(async (session) => {
      try {
        await fetchTree(session.session_id);
        return null;
      } catch (error) {
        return isSessionGone(error) ? session : null;
      }
    }),
  );
  if (generation !== pageGeneration) return;
  let changed = false;
  for (const session of vanished) {
    if (
      session !== null &&
      !present.has(session.session_id) &&
      rowById.get(session.session_id) === session
    ) {
      rowById.delete(session.session_id);
      changed = true;
    }
  }
  if (changed) publishRows();
}

export async function refreshTop(asOf: string): Promise<void> {
  const refreshGeneration = ++pageGeneration;
  noteAsOf(asOf);
  try {
    const response = await fetchSessions();
    if (refreshGeneration !== pageGeneration) return;
    // Invalidate cursor requests launched while page one was in flight. Their
    // responses may describe the pre-refresh snapshot and must not overwrite
    // the authoritative rows or dataset totals that just arrived.
    const settledGeneration = ++pageGeneration;
    const present = new Set(
      response.sessions.map((session) => session.session_id),
    );
    batch(() => {
      mergeRows(response.sessions);
      pruneGone(present);
      publishRows();
      noteTotals(response.totals);
      errorText.value = undefined;
    });
    await reconcileVanishedActives(present, settledGeneration);
  } catch (error) {
    if (refreshGeneration === pageGeneration) {
      errorText.value = error instanceof Error ? error.message : String(error);
    }
  }
}

export async function resetAndReload(): Promise<void> {
  pageGeneration += 1;
  rowById.clear();
  goneIds.clear();
  batch(() => {
    rows.value = [];
    nextCursor.value = null;
    initialLoaded.value = false;
  });
  await loadPage(undefined);
}

export function setSort(key: SortKey): void {
  if (!SORT_KEYS.includes(key)) return;
  sortKey.value = key;
  writeLocal(SORT_KEY, key);
}

export function applyFilter(raw: string): void {
  substr.value = raw.trim().toLowerCase();
}
