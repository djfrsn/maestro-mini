// Pure formatting and derivation helpers, ported verbatim from the current
// UI (web/app.js) so v1 renders byte-identical values: friendly magnitudes,
// durations, token heat, short ids, and local clock/day stamps. Kept pure and
// dependency-free so they unit-test without a DOM.
import type { RootSummary } from "./contract.gen.ts";

export const parseTs = (s: string | null | undefined): number | null =>
  s == null ? null : Date.parse(s);

const pad2 = (v: number): string => String(v).padStart(2, "0");

// Friendly duration: 45s, 3m 07s, 2h 05m.
export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
  }
  return `${Math.floor(s / 3600)}h ${pad2(Math.floor((s % 3600) / 60))}m`;
}

// Friendly magnitude: 1.43k, 194k, 1.5m. Values under 1000 render verbatim;
// larger ones carry two significant decimals (three-digit mantissas drop
// theirs), trailing zeros trimmed.
export function fmtNum(input: number): string {
  const n = Number(input) || 0;
  const abs = Math.abs(n);
  if (abs < 1000) {
    return String(n);
  }
  const [suffix, div] =
    abs >= 1e9 ? ["b", 1e9] : abs >= 1e6 ? ["m", 1e6] : ["k", 1e3];
  const v = n / div;
  return (
    (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2))
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "") + suffix
  );
}

// Volume accessors over one row's derived fields. agentsSpawned excludes the
// root itself, so a lone session with no children reads as zero agents.
export const totalTokens = (s: RootSummary): number =>
  s.usage ? Number(s.usage.total_tokens) || 0 : 0;
export const agentsSpawned = (s: RootSummary): number =>
  Math.max((Number(s.node_count) || 0) - 1, 0);

// Absolute token-heat buckets: <100k, 100k–500k, 500k–1.5m, ≥1.5m map to
// levels 1–4; a session with no recorded tokens stays at level 0 (no tint).
export const heatLevel = (t: number): number =>
  t <= 0 ? 0 : t < 1e5 ? 1 : t < 5e5 ? 2 : t < 1.5e6 ? 3 : 4;

export const shortId = (id: string): string =>
  id.length <= 13 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;

export const fmtLocalClock = (t: number): string => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const fmtLocalDay = (t: number): string => {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

const sameLocalDay = (a: number, b: number): boolean => {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

export function fmtSpan(s: RootSummary): string {
  const start = parseTs(s.started_at);
  if (start == null) {
    return "—";
  }
  const end = parseTs(s.ended_at);
  const day = fmtLocalDay(start);
  const from = fmtLocalClock(start);
  if (end == null) {
    return `${day} ${from} → …`;
  }
  const to = `${sameLocalDay(start, end) ? "" : `${fmtLocalDay(end)} `}${fmtLocalClock(end)}`;
  return `${day} ${from} → ${to}`;
}

// Row duration against a drift-safe "now" (the latest SSE as_of plus elapsed
// local time) for active rows, which read as "≥ <elapsed>".
export function fmtRowDur(s: RootSummary, nowMs: number): string {
  const start = parseTs(s.started_at);
  if (start == null) {
    return "";
  }
  const end = parseTs(s.ended_at);
  return end != null ? fmtDur(end - start) : `≥ ${fmtDur(nowMs - start)}`;
}

// Elapsed run time in milliseconds: ended_at − started_at for a finished row,
// and the drift-safe now − started_at for a row still running, so live rows
// sort by how long they have been going. A row with no start sorts last.
export function rowRuntimeMs(s: RootSummary, nowMs: number): number {
  const start = parseTs(s.started_at);
  if (start == null) {
    return -Infinity;
  }
  const end = parseTs(s.ended_at);
  return (end ?? nowMs) - start;
}
