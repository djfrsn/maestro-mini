import { type JSX } from "preact";
import { useEffect } from "preact/hooks";
import {
  ErrorBanner,
  Header,
  SectionHeader,
  SummaryStrip,
} from "./components.tsx";
import type { SessionsResponse } from "./contract.gen.ts";
import { invalidateResources } from "./resources.ts";
import { SessionRow } from "./session-row.tsx";
import { subscribeChanged } from "./sse.ts";
import {
  groupedRows,
  initialLoaded,
  type ListRow,
  liveState,
  loadInitial,
  loadMore,
  refreshTop,
  rows,
  seedBootstrap,
  visibleRows,
} from "./store.ts";
import { VirtualList } from "./virtual-list.tsx";

const ROW_ESTIMATE_PX = 46;

function pageOnNearEnd(): void {
  void loadMore();
}

function readBootstrap(): SessionsResponse | null {
  const element = document.getElementById("traceui-bootstrap");
  if (!element?.textContent) return null;
  try {
    return JSON.parse(element.textContent) as SessionsResponse;
  } catch {
    return null;
  }
}

function boot(): () => void {
  const bootstrap = readBootstrap();
  if (bootstrap) {
    seedBootstrap(
      bootstrap.sessions,
      bootstrap.next_cursor,
      new Date().toISOString(),
    );
  } else {
    void loadInitial();
  }
  return subscribeChanged({
    onChanged: (asOf) => {
      void refreshTop(asOf);
      invalidateResources();
    },
    onStatus: (state) => {
      liveState.value = state;
    },
  });
}

function EmptyState(): JSX.Element | null {
  if (!initialLoaded.value) return null;
  if (rows.value.length === 0) {
    return <p class="empty-state">no Claude sessions under this root</p>;
  }
  if (visibleRows.value.length === 0) {
    return <p class="empty-state">all sessions hidden by the current filter</p>;
  }
  return null;
}

const rowKey = (row: ListRow): string =>
  row.kind === "header" ? `hdr:${row.section}` : row.session.session_id;

function renderListRow(row: ListRow): JSX.Element {
  return row.kind === "header" ? (
    <SectionHeader label={row.label} count={row.count} />
  ) : (
    <SessionRow session={row.session} />
  );
}

export function App(): JSX.Element {
  useEffect(() => boot(), []);
  return (
    <>
      <Header />
      <ErrorBanner />
      <main>
        <SummaryStrip />
        <EmptyState />
        <VirtualList
          items={groupedRows.value}
          itemKey={rowKey}
          estimateHeight={ROW_ESTIMATE_PX}
          renderRow={renderListRow}
          onNearEnd={pageOnNearEnd}
        />
      </main>
    </>
  );
}
