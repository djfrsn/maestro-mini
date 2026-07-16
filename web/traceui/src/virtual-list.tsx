// Window-virtualized list: only the rows inside (a small overscan around) the
// viewport exist in the DOM, so a 3,000-row dataset renders a few dozen nodes.
// It virtualizes against the page scroll — the header stays sticky and the
// document scrolls, matching the current UI. Row heights are measured, so an
// expanded row (T4/T5) grows the window and its neighbours reflow without a
// scroll jump. Reaching the tail calls onNearEnd for on-demand paging.
//
// Layout is a top spacer, the window rows in normal flow, then a bottom spacer
// — no absolute positioning — and each row keeps a stable ref callback per key,
// so Preact's keyed diff never orphans a removed row.
//
// Mounted rows are re-measured on every viewport pass. A ref callback only
// runs on mount and unmount, so an in-place expansion would otherwise retain
// its collapsed height. That stale height can put the expanded row outside its
// own virtual window, unmounting its waterfall and snapping the page upward.
import { type JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

const OVERSCAN_PX = 600;
const NEAR_END_PX = 800;
const POLL_MS = 250;

interface VirtualListProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  estimateHeight: number;
  renderRow: (item: T) => JSX.Element;
  onNearEnd?: (() => void) | undefined;
}

interface ViewMetrics {
  scrollY: number;
  viewportH: number;
  containerTop: number;
}

// prefixOffsets returns cumulative pixel offsets: offsets[i] is the top of row
// i, offsets[n] the total height. Unmeasured rows fall back to the estimate.
function prefixOffsets(
  keys: readonly string[],
  heights: Map<string, number>,
  estimate: number,
): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] ?? "";
    offsets.push((offsets[i] ?? 0) + (heights.get(key) ?? estimate));
  }
  return offsets;
}

// findStart binary-searches the last row whose top is at or before y.
function findStart(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((offsets[mid] ?? 0) <= y) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  const { items, itemKey, estimateHeight, renderRow, onNearEnd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const refCache = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
    new Map(),
  );
  const elByKey = useRef<Map<string, HTMLDivElement>>(new Map());
  const [metrics, setMetrics] = useState<ViewMetrics>({
    scrollY: 0,
    viewportH: typeof window !== "undefined" ? window.innerHeight : 800,
    containerTop: 0,
  });
  // A measured row-height change re-renders via this setter, which recomputes
  // offsets below; its value is never read.
  const [, bumpMeasure] = useState(0);

  const keys = items.map(itemKey);

  // Every measurement path uses the same change guard so polling a stable row
  // cannot cause a render loop.
  const noteHeight = (key: string, el: Element): boolean => {
    const height = el.getBoundingClientRect().height;
    if (height > 0 && heightsRef.current.get(key) !== height) {
      heightsRef.current.set(key, height);
      return true;
    }
    return false;
  };

  const syncHeights = (): boolean => {
    let changed = false;
    for (const [key, el] of elByKey.current) {
      if (noteHeight(key, el)) changed = true;
    }
    return changed;
  };

  // readMetrics re-measures the viewport and every mounted row. The functional
  // update returns the previous object unchanged when nothing moved, so Preact
  // bails out — the idle poll below costs nothing when the user is still.
  const readMetrics = (): void => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const next: ViewMetrics = {
      scrollY: window.scrollY,
      viewportH: window.innerHeight,
      containerTop: rect.top + window.scrollY,
    };
    if (syncHeights()) bumpMeasure((value) => value + 1);
    setMetrics((prev) =>
      prev.scrollY === next.scrollY &&
      prev.viewportH === next.viewportH &&
      prev.containerTop === next.containerTop
        ? prev
        : next,
    );
  };

  useLayoutEffect(() => {
    readMetrics();
    // Coalesce scroll bursts to one measure per frame for smooth foreground
    // scrolling.
    let queued = false;
    const onScroll = (): void => {
      if (queued) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        readMetrics();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Idle-poll fallback: embedded and throttled contexts starve scroll-event
    // and rAF delivery (the perf baseline calls this out), which would freeze
    // the window. The change-guarded poll keeps it honest; it is a no-op
    // re-render when nothing moved.
    const poll = window.setInterval(readMetrics, POLL_MS);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearInterval(poll);
    };
  }, []);

  const offsets = prefixOffsets(keys, heightsRef.current, estimateHeight);
  const total = offsets[offsets.length - 1] ?? 0;
  const relTop = metrics.scrollY - metrics.containerTop;
  const start = findStart(offsets, relTop - OVERSCAN_PX);
  const end = Math.min(
    keys.length,
    findStart(offsets, relTop + metrics.viewportH + OVERSCAN_PX) + 1,
  );

  // On-demand paging fires in an effect (never during render, which would
  // mutate store signals mid-render) when the tail nears the viewport.
  const nearEnd = total - (relTop + metrics.viewportH) < NEAR_END_PX;
  // Hold the latest callback in a ref so a fresh closure from the parent never
  // becomes an effect dependency: the trigger keys on the tail's position, not
  // on the handler's identity.
  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
  // Fire once per threshold crossing — the false->true rising edge. While the
  // tail stays inside the near-end zone across re-renders (row measures, the
  // 250ms poll, an SSE refresh, or a filter whose pages add no visible rows),
  // it does not refire. That is one page per threshold; loadMore's own
  // in-flight and nextCursor guards decide whether that page is fetched. A
  // level-triggered version instead pages on every such re-render, cascading
  // the whole dataset in from a single scroll.
  const wasNearEnd = useRef(false);
  useLayoutEffect(() => {
    if (nearEnd && !wasNearEnd.current) {
      onNearEndRef.current?.();
    }
    wasNearEnd.current = nearEnd;
  }, [nearEnd]);

  const topSpacer = offsets[start] ?? 0;
  const bottomSpacer = total - (offsets[end] ?? total);
  const visible = items.slice(start, end);

  // measureRef returns a stable callback per key, so Preact never sees a
  // changing ref and never orphans a removed row. Mounted elements are retained
  // only while visible so viewport passes can re-measure in-place expansions.
  const measureRef = (key: string): ((el: HTMLDivElement | null) => void) => {
    let cb = refCache.current.get(key);
    if (!cb) {
      cb = (el: HTMLDivElement | null): void => {
        if (!el) {
          elByKey.current.delete(key);
          return;
        }
        elByKey.current.set(key, el);
        if (noteHeight(key, el)) {
          bumpMeasure((v) => v + 1);
        }
      };
      refCache.current.set(key, cb);
    }
    return cb;
  };

  return (
    <div ref={containerRef} class="session-list">
      <div style={{ height: `${topSpacer}px` }} />
      {visible.map((item) => {
        const key = itemKey(item);
        return (
          <div key={key} ref={measureRef(key)}>
            {renderRow(item)}
          </div>
        );
      })}
      <div style={{ height: `${bottomSpacer}px` }} />
    </div>
  );
}
