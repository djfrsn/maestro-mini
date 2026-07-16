import { type JSX } from "preact";
import { useRef } from "preact/hooks";
import { fmtNum, shortId, totalTokens } from "./format.ts";
import {
  applyFilter,
  errorText,
  liveState,
  setSort,
  type SortKey,
  sortKey,
  summary,
} from "./store.ts";

const FILTER_DEBOUNCE_MS = 250;

function Chip(props: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`chip${props.active ? " is-active" : ""}`}
      aria-pressed={props.active}
      title={props.title}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

const SORTS: { key: SortKey; label: string; title: string }[] = [
  { key: "recent", label: "recent", title: "most recent first" },
  { key: "runtime", label: "runtime", title: "longest running first" },
  { key: "tokens", label: "tokens", title: "most token usage first" },
  { key: "agents", label: "sessions", title: "most sessions first" },
];

export function Header(): JSX.Element {
  const timer = useRef<number | undefined>(undefined);
  const onFilterInput = (event: JSX.TargetedEvent<HTMLInputElement>): void => {
    const value = event.currentTarget.value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => applyFilter(value),
      FILTER_DEBOUNCE_MS,
    );
  };

  return (
    <header class="app-header">
      <h1 aria-label="TraceUI">
        <span class="app-title-name">Trace</span>
        <span class="app-title-kind">UI</span>
      </h1>
      <div class="chips" role="group" aria-label="sort sessions">
        {SORTS.map((sort) => (
          <Chip
            key={sort.key}
            active={sortKey.value === sort.key}
            label={sort.label}
            title={sort.title}
            onClick={() => setSort(sort.key)}
          />
        ))}
      </div>
      <input
        id="filter-input"
        type="search"
        placeholder="session id or model"
        autocomplete="off"
        spellcheck={false}
        aria-label="filter sessions"
        onInput={onFilterInput}
      />
      <LiveIndicator />
    </header>
  );
}

export function LiveIndicator(): JSX.Element {
  return (
    <span class="live-indicator" data-state={liveState.value}>
      <i class="live-dot" />
      <span>{liveState.value}</span>
    </span>
  );
}

export function ErrorBanner(): JSX.Element | null {
  return errorText.value ? (
    <div class="error-banner" role="alert">
      {errorText.value}
    </div>
  ) : null;
}

export function SectionHeader({
  label,
  count,
}: {
  label: string;
  count: number;
}): JSX.Element {
  return (
    <div class="section-header" role="heading" aria-level={2}>
      <span class="section-header-label">{label}</span>
      <span class="section-header-count">{fmtNum(count)}</span>
    </div>
  );
}

export function SummaryStrip(): JSX.Element | null {
  const data = summary.value;
  if (data.count === 0) return null;
  const busiestTokens = data.busiest ? totalTokens(data.busiest) : 0;
  return (
    <div class="session-summary">
      <div class="ssum-tile">
        <span class="ssum-label">Sessions</span>
        <span class="ssum-value">{fmtNum(data.count)}</span>
      </div>
      <div class="ssum-tile">
        <span class="ssum-label">Total tokens</span>
        <span class="ssum-value">{fmtNum(data.tokens)}</span>
      </div>
      <div class="ssum-tile">
        <span class="ssum-label">Agents spawned</span>
        <span class="ssum-value">{fmtNum(data.agents)}</span>
      </div>
      <div class="ssum-tile ssum-tile-wide">
        <span class="ssum-label">Busiest session</span>
        <span class="ssum-value">
          {data.busiest && busiestTokens > 0
            ? `${shortId(data.busiest.session_id)} · ${fmtNum(busiestTokens)}`
            : "–"}
        </span>
      </div>
    </div>
  );
}
