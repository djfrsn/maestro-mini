export interface Usage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

export interface RootSummary {
  provider: string;
  session_id: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  model: string;
  usage: Usage | null;
  node_count: number;
  source_path: string;
  confidence: string;
}

export interface SessionsResponse {
  sessions: RootSummary[];
  next_cursor: string | null;
}

export interface SessionNode {
  session_id: string;
  parent_session_id?: string;
  agent_path: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  depth: number;
  order: number;
  model?: string;
  usage: Usage | null;
  confidence: string;
}

export interface TreeResponse {
  as_of: string;
  document: { schema: string; nodes: SessionNode[] };
}

export interface TranscriptEntry {
  role: string;
  at: string;
  summary: string;
  text: string;
  ref: number;
}

export interface SessionEvent {
  kind: string;
  at: string;
  ref: { source_path: string; line: number };
}

export interface SessionDetail {
  session_id: string;
  parent_session_id?: string;
  thread_source?: string;
  agent_role?: string;
  model?: string;
  cli_version?: string;
  cwd?: string;
  source_path?: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  confidence: string;
  usage: Usage | null;
  events: SessionEvent[];
  errors?: string[];
  event_kind_counts: Record<string, number>;
  transcript: TranscriptEntry[];
  transcript_truncated: boolean;
  transcript_omitted_entries: number;
}

export interface DetailResponse {
  as_of: string;
  detail: SessionDetail;
}
