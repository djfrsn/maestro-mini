// Per-node conversation detail (PMVP-024), ported to keyed Preact. Opening a
// waterfall node renders its transcript here, bound to an SSE-invalidated
// detail resource. Two invariants the current UI hand-guarded now hold
// structurally:
//   • the transcript scroll follows the newest turn when the reader is at the
//     bottom and holds position when they have scrolled up — the list element
//     is never recreated, so its scrollTop is DOM-owned, and a follow-effect
//     re-pins only when the reader was already following;
//   • an entry the reader expanded stays open across live ticks, because the
//     open set lives in component state keyed by each entry's stable native
//     ref, not scraped back out of the DOM.
// Every transcript string reaches the DOM as text via JSX, never as HTML.
import { type JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { isSessionGone } from "./api.ts";
import { copyWithFlash } from "./clipboard.ts";
import type { SessionNode, TranscriptEntry } from "./contract.gen.ts";
import { fmtLocalClock, parseTs } from "./format.ts";
import { detailResource } from "./resources.ts";

// A reader within this many pixels of the bottom is "following" the newest
// turn, so a live refresh keeps them pinned rather than freezing the offset.
const FOLLOW_PX = 24;

function roleClass(role: string): string {
  if (
    role === "user" ||
    role === "assistant" ||
    role === "thinking" ||
    role === "context"
  ) {
    return role;
  }
  if (role === "tool_result") {
    return "tool-result";
  }
  return "tool";
}

function TranscriptRow({
  item,
  open,
  onToggle,
}: {
  item: TranscriptEntry;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  if (item.role === "marker") {
    return <div class="tr-marker">{item.summary || "… entries omitted …"}</div>;
  }
  const at = parseTs(item.at);
  return (
    <div class="tr-entry" data-ref={String(item.ref)}>
      <button
        type="button"
        class="tr-row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span class={`tr-role tr-role-${roleClass(item.role)}`}>
          {item.role}
        </span>
        <span class="tr-summary">{item.summary || "(no text)"}</span>
        <span class="tr-time">
          {at != null && at > 0 ? fmtLocalClock(at) : ""}
        </span>
      </button>
      <pre class="tr-text" hidden={!open}>
        {item.text}
      </pre>
    </div>
  );
}

export function DetailPanel({ node }: { node: SessionNode }): JSX.Element {
  const resource = detailResource(node.session_id);
  const [openRefs, setOpenRefs] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // Default to following: a freshly opened live conversation shows and tracks
  // the newest turn. Scrolling up clears it, which holds the position.
  const following = useRef(true);

  const doc = resource.data.value;
  const detail = doc?.detail;

  // After the transcript content changes (a new fetch), re-pin to the bottom
  // only if the reader was following. When they have scrolled up, the stable
  // list element already holds their offset — nothing to do.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && following.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [doc]);

  if (!detail) {
    const err = resource.error.value;
    if (err) {
      return (
        <div class="detail-host">
          {isSessionGone(err) ? (
            <p class="tree-gone">
              this session is no longer available — it may have been archived or
              removed.
            </p>
          ) : (
            <p class="tree-error">detail fetch failed: {err.message}</p>
          )}
        </div>
      );
    }
    return (
      <div class="detail-host">
        <p class="tree-loading">loading conversation for {node.session_id}…</p>
      </div>
    );
  }

  const onScroll = (): void => {
    const el = listRef.current;
    if (el) {
      following.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_PX;
    }
  };

  const toggle = (ref: string): void => {
    const next = new Set(openRefs);
    if (next.has(ref)) {
      next.delete(ref);
    } else {
      next.add(ref);
    }
    setOpenRefs(next);
  };

  const transcript = detail.transcript ?? [];
  const counts = detail.event_kind_counts ?? {};
  const kinds = Object.keys(counts).toSorted();
  const allRefs = (): Set<string> =>
    new Set(
      transcript.filter((t) => t.role !== "marker").map((t) => String(t.ref)),
    );

  return (
    <div class="detail-host">
      <div class="node-detail">
        <div class="detail-header">
          <strong>conversation</strong>
          <code
            title="click to copy"
            onClick={(e) =>
              copyWithFlash(
                e.currentTarget,
                detail.session_id || node.session_id,
              )
            }
          >
            {detail.session_id || node.session_id}
          </code>
          {detail.status ? (
            <span class="detail-meta">{detail.status}</span>
          ) : null}
        </div>

        {kinds.length > 0 ? (
          <div class="kind-chips">
            {kinds.map((kind) => (
              <span key={kind} class="kind-chip">
                {kind} ×{counts[kind]}
              </span>
            ))}
          </div>
        ) : null}

        {transcript.length === 0 ? (
          <p class="detail-meta">no conversation text in this session</p>
        ) : (
          <>
            <div class="detail-actions">
              <button
                type="button"
                class="detail-btn"
                onClick={() => setOpenRefs(allRefs())}
              >
                expand all
              </button>
              <button
                type="button"
                class="detail-btn"
                onClick={() => setOpenRefs(new Set())}
              >
                collapse all
              </button>
              {detail.transcript_truncated ? (
                <span class="detail-meta">
                  transcript truncated —{" "}
                  {detail.transcript_omitted_entries || 0} entries omitted
                </span>
              ) : null}
            </div>

            <div class="transcript" ref={listRef} onScroll={onScroll}>
              {transcript.map((item, i) => {
                const ref = item.ref != null ? String(item.ref) : `i${i}`;
                return (
                  <TranscriptRow
                    key={ref}
                    item={item}
                    open={openRefs.has(ref)}
                    onToggle={() => toggle(ref)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
