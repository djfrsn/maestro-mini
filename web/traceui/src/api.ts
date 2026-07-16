// Typed clients for the frozen JSON contract. Each returns the generated
// contract interface, so a server-side field change (which regenerates
// contract.gen.ts) surfaces here and anywhere downstream reads the old shape.
import type {
  DetailResponse,
  SessionsResponse,
  TreeResponse,
} from "./contract.gen.ts";

// PAGE_LIMIT matches the current UI's page size against the frozen list API.
export const PAGE_LIMIT = 200;

// ApiError carries the HTTP status of a failed contract fetch, so callers can
// tell a session the server no longer knows (404 — archived/removed) apart
// from a transient server or network failure. The message keeps the prior
// `<label> fetch failed (<status>)` shape.
export class ApiError extends Error {
  readonly status: number;
  constructor(label: string, status: number) {
    super(`${label} fetch failed (${status})`);
    this.name = "ApiError";
    this.status = status;
  }
}

// isSessionGone reports whether an error is the server's "this id is not in the
// current snapshot" 404 — a session archived or removed after it was paged in —
// as opposed to a transient failure worth surfacing (a network drop throws a
// plain TypeError, a server fault a 5xx, neither of which is "gone").
export function isSessionGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

async function getJSON<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(label, res.status);
  }
  return res.json() as Promise<T>;
}

export interface ListParams {
  cursor?: string | undefined;
  limit?: number | undefined;
}

// fetchSessions reads one page of the native Claude session list.
export function fetchSessions(
  params: ListParams = {},
): Promise<SessionsResponse> {
  const q = new URLSearchParams({ limit: String(params.limit ?? PAGE_LIMIT) });
  if (params.cursor) {
    q.set("cursor", params.cursor);
  }
  return getJSON<SessionsResponse>(`/api/v1/sessions?${q}`, "sessions");
}

export function fetchTree(id: string): Promise<TreeResponse> {
  return getJSON<TreeResponse>(
    `/api/v1/sessions/${encodeURIComponent(id)}/tree`,
    "tree",
  );
}

export function fetchDetail(id: string): Promise<DetailResponse> {
  return getJSON<DetailResponse>(
    `/api/v1/sessions/${encodeURIComponent(id)}/detail`,
    "detail",
  );
}
