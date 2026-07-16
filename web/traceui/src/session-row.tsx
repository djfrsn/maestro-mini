// One session row: the keyed head (status pill, id,
// span, duration, session count, token heat, model) plus, when expanded, the
// waterfall/detail mount. Clicking the id
// badge copies it; clicking elsewhere toggles expansion. Keyed rendering means
// a live refresh updates cells in place — no manual reconciliation, no lost
// scroll.
import { type JSX } from "preact";
import { useEffect } from "preact/hooks";
import { isSessionGone } from "./api.ts";
import { copyWithFlash } from "./clipboard.ts";
import type { RootSummary } from "./contract.gen.ts";
import {
  fmtNum,
  fmtRowDur,
  fmtSpan,
  heatLevel,
  shortId,
  totalTokens,
} from "./format.ts";
import { DetailPanel } from "./detail.tsx";
import { dropDetail, dropTree, treeResource } from "./resources.ts";
import {
  clockTick,
  detailNodeByRoot,
  expandedIds,
  markSessionGone,
  nowMs,
  selectDetailNode,
  toggleExpand,
} from "./store.ts";
import { Waterfall } from "./waterfall.tsx";

// RowExpansion mounts under an expanded row: the waterfall bound to the tree
// resource. It drops its cache keys on unmount (collapse, or the row scrolling
// out of the virtual window) so a hidden row stops refetching; a live tick
// patches the open tree in place. The conversation detail panel lands in T5.
function RowExpansion({ rootId }: { rootId: string }): JSX.Element {
  const tree = treeResource(rootId);
  useEffect(
    () => () => {
      dropTree(rootId);
      dropDetail(rootId);
    },
    [rootId],
  );

  const doc = tree.data.value;
  // A gone session (404) with no prior tree is a stale row the server has
  // dropped from its snapshot: show the graceful notice and let the store prune
  // it on the next refresh. A row that had loaded once and then 404ed on a live
  // refetch keeps its last-good tree (cache behaviour) and is left in place.
  const gone = isSessionGone(tree.error.value);
  useEffect(() => {
    if (gone) {
      markSessionGone(rootId);
    }
  }, [gone, rootId]);

  const detailNode = detailNodeByRoot.value.get(rootId);
  return (
    <div class="row-tree">
      <div>
        {doc ? (
          <Waterfall
            tree={doc.document}
            asOf={doc.as_of}
            onNodeClick={(node) => selectDetailNode(rootId, node)}
          />
        ) : gone ? (
          <p class="tree-gone">
            this session is no longer available — it may have been archived or
            removed.
          </p>
        ) : tree.error.value ? (
          <p class="tree-error">
            tree fetch failed: {tree.error.value.message}
          </p>
        ) : (
          <p class="tree-loading">loading tree…</p>
        )}
      </div>
      {detailNode ? <DetailPanel node={detailNode} rootId={rootId} /> : null}
    </div>
  );
}

// LiveDuration re-renders on the 1s clock so an active session's "≥" duration
// advances; the tick value is surfaced as a data attribute purely to consume
// it. Completed rows render a static duration and never subscribe.
function LiveDuration({ session }: { session: RootSummary }): JSX.Element {
  const tick = clockTick.value;
  return (
    <span class="row-dur" data-tick={tick}>
      {fmtRowDur(session, nowMs())}
    </span>
  );
}

export function SessionRow({ session }: { session: RootSummary }): JSX.Element {
  const s = session;
  const expanded = expandedIds.value.has(s.session_id);
  const tokens = totalTokens(s);

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    const sid = target.closest(".row-sid");
    if (sid) {
      copyWithFlash(sid, s.session_id);
      return;
    }
    toggleExpand(s.session_id);
  };

  return (
    <div class="session-row">
      <button
        type="button"
        class="row-head"
        aria-expanded={expanded}
        onClick={onClick}
      >
        <span class={`pill pill-${s.status}`}>{s.status}</span>
        <span class="row-sid" title={`${s.session_id} — click to copy`}>
          {shortId(s.session_id)}
        </span>
        <span class="row-span">{fmtSpan(s)}</span>
        {s.ended_at ? (
          <span class="row-dur">{fmtRowDur(s, nowMs())}</span>
        ) : (
          <LiveDuration session={s} />
        )}
        <span class="row-count">
          {fmtNum(Number(s.node_count) || 0)} session
          {s.node_count === 1 ? "" : "s"}
        </span>
        <span class={`row-tok heat-${heatLevel(tokens)}`} title="total tokens">
          {fmtNum(tokens)}
        </span>
        <span class="row-model">{s.model || ""}</span>
      </button>
      {expanded ? <RowExpansion rootId={s.session_id} /> : null}
    </div>
  );
}
