// Waterfall renderer for gb.session-tree/v1 documents, ported from the current
// UI's waterfall.js to keyed Preact. Each bar and label is keyed by session id,
// so a live tick with the same node set patches the existing elements in place
// — the active bar keeps its running wf-pulse animation and the .wf-scroll
// container keeps the reader's scroll (scroll is uncontrolled, owned by the
// DOM). A changed node set (a child appears or drops) adds or removes just that
// keyed row. All node text reaches the DOM as text via JSX, never as HTML.
import { type JSX } from "preact";
import { createPortal } from "preact/compat";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SessionNode, TreeResponse } from "./contract.gen.ts";
import { clampTooltip } from "./tooltip.ts";

const PAD_L = 24;
const PAD_R = 200;
const PLOT_W = 860;
const AXIS_H = 30;
const ROW_H = 40;
const PALETTE = [
  "--wf-c0",
  "--wf-c1",
  "--wf-c2",
  "--wf-c3",
  "--wf-c4",
  "--wf-c5",
];
type SessionTree = TreeResponse["document"];

const parseTs = (s: string | null | undefined): number | null =>
  s == null ? null : Date.parse(s);
const pad2 = (v: number): string => String(v).padStart(2, "0");
const fmtClock = (t: number): string => {
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
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
const fmtAxisTick = (t: number, showDay: boolean): string => {
  if (!showDay) return fmtClock(t);
  const date = new Date(t);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
};
const fmtDur = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
  }
  return `${Math.floor(s / 3600)}h ${pad2(Math.floor((s % 3600) / 60))}m`;
};
const fmtInt = (v: number): string => Number(v).toLocaleString("en-US");
const tail = (agentPath: string): string => {
  const parts = String(agentPath || "").split("/");
  return parts[parts.length - 1] || "session";
};
const colorFor = (n: SessionNode, i: number): string =>
  n.depth === 0 ? "var(--wf-root-bar)" : `var(${PALETTE[i % PALETTE.length]})`;

interface Layout {
  asOf: number | null;
  tMin: number;
  tMax: number;
  openEdge: number;
  chartW: number;
  chartH: number;
  x: (t: number) => number;
}

// computeLayout builds the time domain over known timestamps; as_of joins it
// whenever an open-ended (active) bar needs a right edge.
function computeLayout(nodes: readonly SessionNode[], asOfIso: string): Layout {
  const asOf = parseTs(asOfIso);
  let tMin = Infinity;
  let tMax = -Infinity;
  let hasOpen = false;
  for (const n of nodes) {
    const s = parseTs(n.started_at);
    const e = parseTs(n.ended_at);
    if (s != null) {
      tMin = Math.min(tMin, s);
      tMax = Math.max(tMax, s);
    }
    if (e != null) {
      tMax = Math.max(tMax, e);
    }
    if (s != null && e == null) {
      hasOpen = true;
    }
  }
  if (hasOpen && asOf != null && Number.isFinite(asOf)) {
    tMax = Math.max(tMax, asOf);
  }
  if (!Number.isFinite(tMin)) {
    tMin = 0;
    tMax = 1;
  }
  if (tMax <= tMin) {
    tMax = tMin + 1000;
  }
  const openEdge =
    asOf != null && Number.isFinite(asOf) ? Math.max(asOf, tMin + 1) : tMax;
  const chartW = PAD_L + PLOT_W + PAD_R;
  const chartH = AXIS_H + nodes.length * ROW_H + 8;
  const x = (t: number): number =>
    PAD_L + ((t - tMin) / (tMax - tMin)) * PLOT_W;
  return { asOf, tMin, tMax, openEdge, chartW, chartH, x };
}

interface BarVisual {
  barX0: number;
  barClass: string;
  barStyle: JSX.CSSProperties;
  barText: string;
  labelX: number;
  labelColor: string;
}

// barVisual computes one node's bar geometry, classes, and inline style. The
// color/background fill is an object (aborted, missing, and malformed take
// their fill from their class instead).
function barVisual(n: SessionNode, i: number, layout: Layout): BarVisual {
  const { x, tMin, tMax, openEdge } = layout;
  const s = parseTs(n.started_at);
  const e = parseTs(n.ended_at);
  const isMissing = n.status === "missing";
  const isActive = n.status === "active";
  const color = colorFor(n, i);

  let barX0: number;
  let barX1: number;
  let barClass = "wf-bar";
  let barText = "";
  let fill: { background?: string; color?: string } = {};

  if (isMissing || s == null) {
    barX0 = x(tMin);
    barX1 = x(tMax);
    barClass += " wf-missing";
    barText = "missing — spawn position unknown in export";
  } else {
    barX0 = x(s);
    barX1 = x(e != null ? e : openEdge);
    if (n.depth === 0) {
      barClass += " wf-root";
    } else {
      fill = { background: color };
    }
    if (n.status === "aborted") {
      barClass += " wf-aborted";
      fill = {};
      barText = "✕";
    }
    if (isActive) {
      barClass += " wf-active";
      fill = { color, background: color };
    }
    if (n.status === "malformed") {
      barClass += " wf-malformed";
      fill = {};
    }
    if (n.depth === 0) {
      barText =
        (e != null ? "" : "≥ ") + fmtDur((e != null ? e : openEdge) - s);
    }
  }
  const barW = Math.max(barX1 - barX0, 6);
  const labelX = barX1 + (isActive ? 34 : 10);
  const labelColor =
    n.depth === 0
      ? "var(--wf-root-text)"
      : isMissing
        ? "var(--wf-missing)"
        : color;
  return {
    barX0,
    barClass,
    barStyle: { left: `${barX0}px`, width: `${barW}px`, ...fill },
    barText,
    labelX,
    labelColor,
  };
}

function LabelContent({ n }: { n: SessionNode }): JSX.Element {
  const badges: JSX.Element[] = [];
  if (n.status === "active") {
    badges.push(
      <span key="a" class="wf-badge active">
        active
      </span>,
    );
  }
  if (n.status === "aborted") {
    badges.push(
      <span key="x" class="wf-badge aborted">
        ✕ aborted
      </span>,
    );
  }
  if (n.status === "missing") {
    badges.push(
      <span key="m" class="wf-badge missing">
        missing
      </span>,
    );
  }
  if (n.confidence !== "full") {
    badges.push(
      <span key="c" class="wf-badge partial">
        {n.confidence}
      </span>,
    );
  }
  return (
    <>
      <strong>{tail(n.agent_path)}</strong>
      {n.model ? <span class="wf-model">{n.model}</span> : null}
      {badges}
    </>
  );
}

interface Tick {
  left: number;
  label: string;
}

function axisTicks(layout: Layout): Tick[] {
  const { tMin, tMax, x } = layout;
  const spanS = (tMax - tMin) / 1000;
  const steps = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600,
    43200, 86400, 172800, 345600,
  ];
  const stepS =
    steps.find((candidate) => spanS / candidate <= 7) ??
    Math.ceil(spanS / 7 / 86400) * 86400;
  const showDay = spanS >= 86400;
  const ticks: Tick[] = [];
  for (
    let t = Math.ceil(tMin / (stepS * 1000)) * stepS * 1000;
    t <= tMax;
    t += stepS * 1000
  ) {
    ticks.push({ left: x(t), label: fmtAxisTick(t, showDay) });
  }
  return ticks;
}

interface Connector {
  key: string;
  d: string;
  points: string;
}

// connectors builds the parent→child elbow paths from per-node geometry.
function connectors(
  nodes: readonly SessionNode[],
  geom: Map<string, { rowMid: number; barX0: number }>,
): Connector[] {
  const byId = new Map(nodes.map((n) => [n.session_id, n]));
  const out: Connector[] = [];
  for (const n of nodes) {
    if (!n.parent_session_id) {
      continue;
    }
    const parent = byId.get(n.parent_session_id);
    const g = geom.get(n.session_id);
    const pg = parent ? geom.get(parent.session_id) : undefined;
    if (!g || !pg || n.status === "missing" || parseTs(n.started_at) == null) {
      continue;
    }
    const cx = g.barX0;
    const py = pg.rowMid + 12;
    const cy = g.rowMid;
    const ex = cx - 14;
    out.push({
      key: n.session_id,
      d: `M ${cx} ${py} L ${ex} ${py} L ${ex} ${cy} L ${cx - 3} ${cy}`,
      points: `${cx} ${cy} ${cx - 7} ${cy - 3.5} ${cx - 7} ${cy + 3.5}`,
    });
  }
  return out;
}

// The tooltip anchors at the cursor (viewport coordinates); its on-screen
// clamp depends on the card's rendered size, so we keep the raw cursor point
// here and clamp after render once the size is measurable.
interface TooltipState {
  node: SessionNode;
  cursorX: number;
  cursorY: number;
}

function tooltipRows(n: SessionNode, openEdge: number): [string, string][] {
  const s = parseTs(n.started_at);
  const e = parseTs(n.ended_at);
  let duration: string;
  if (n.status === "missing" || s == null) {
    duration = "unknown (missing)";
  } else if (e == null) {
    duration = `≥ ${fmtDur(openEdge - s)} (still active as of last scan)`;
  } else {
    duration = fmtDur(e - s);
  }
  const usage = n.usage
    ? `${fmtInt(n.usage.total_tokens)} total (in ${fmtInt(n.usage.input_tokens)}, ` +
      `cached ${fmtInt(n.usage.cached_input_tokens)}, out ${fmtInt(n.usage.output_tokens)}, ` +
      `reasoning ${fmtInt(n.usage.reasoning_output_tokens)})`
    : "— not exposed";
  return [
    ["session", n.session_id],
    ["agent path", n.agent_path],
    ["status", n.status],
    ["duration", duration],
    ["model", n.model || "—"],
    ["tokens", usage],
    ["confidence", n.confidence],
  ];
}

export function Waterfall({
  tree,
  asOf,
  onNodeClick,
}: {
  tree: SessionTree;
  asOf: string;
  onNodeClick: (node: SessionNode) => void;
}): JSX.Element {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // The tooltip is a fixed-position card. It first renders at the raw cursor
  // offset, then this layout effect measures the rendered card and clamps it
  // fully on-screen before the browser paints — so it never flashes clipped at
  // a bottom or right edge.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !tip) {
      return;
    }
    const { left, top } = clampTooltip(
      tip.cursorX,
      tip.cursorY,
      { width: el.offsetWidth, height: el.offsetHeight },
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [tip]);

  const nodes = (tree.nodes ?? []).toSorted((a, b) => a.order - b.order);
  if (nodes.length === 0) {
    return (
      <div class="wf-app">
        <div class="wf-header">
          <span class="wf-meta">empty tree</span>
        </div>
      </div>
    );
  }

  const layout = computeLayout(nodes, asOf);
  const geom = new Map<string, { rowMid: number; barX0: number }>();
  const visuals = nodes.map((n, i) => {
    const v = barVisual(n, i, layout);
    geom.set(n.session_id, { rowMid: AXIS_H + i * ROW_H + 20, barX0: v.barX0 });
    return v;
  });
  const ticks = axisTicks(layout);
  const links = connectors(nodes, geom);

  const onMouseMove = (event: MouseEvent): void => {
    const bar = (event.target as Element).closest<HTMLElement>(".wf-bar");
    if (!bar?.dataset["sessionId"]) {
      setTip(null);
      return;
    }
    const node = nodes.find((n) => n.session_id === bar.dataset["sessionId"]);
    if (!node) {
      setTip(null);
      return;
    }
    setTip({ node, cursorX: event.clientX, cursorY: event.clientY });
  };

  const onClick = (event: MouseEvent): void => {
    const bar = (event.target as Element).closest<HTMLElement>(".wf-bar");
    const id = bar?.dataset["sessionId"];
    if (!id) {
      return;
    }
    const node = nodes.find((n) => n.session_id === id);
    if (node) {
      onNodeClick(node);
    }
  };

  return (
    <div class="wf-app">
      <div class="wf-header">
        <h2>session tree</h2>
        <span class="wf-meta">
          schema <code>{tree.schema || "?"}</code>
        </span>
        <span class="wf-meta">{nodes.length} nodes</span>
        <span class="wf-meta">
          wall time {fmtDur(layout.tMax - layout.tMin)} ({fmtClock(layout.tMin)}{" "}
          → {fmtClock(layout.tMax)} UTC)
        </span>
        {layout.asOf != null && Number.isFinite(layout.asOf) ? (
          <span class="wf-meta">as of {fmtClock(layout.asOf)} UTC</span>
        ) : null}
      </div>

      <div class="wf-legend">
        <span>
          <i class="wf-swatch completed" />
          completed
        </span>
        <span>
          <i class="wf-swatch active" />
          active (open right edge → as-of)
        </span>
        <span>
          <i class="wf-swatch aborted" />
          aborted
        </span>
        <span>
          <i class="wf-swatch missing" />
          missing (ghost — spawn time not in export)
        </span>
        <span>
          <i class="wf-swatch malformed" />
          malformed
        </span>
      </div>

      <div class="wf-scroll">
        <div
          class="wf-chart"
          style={{ width: `${layout.chartW}px`, height: `${layout.chartH}px` }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setTip(null)}
          onClick={onClick}
        >
          <div class="wf-axis">
            {ticks.map((t) => (
              <div
                key={`t${t.left}`}
                class="wf-tick"
                style={{ left: `${t.left}px` }}
              >
                {t.label}
              </div>
            ))}
            <div class="wf-axis-title">time (UTC) →</div>
          </div>
          <div class="wf-grid">
            {ticks.map((t) => (
              <div
                key={`g${t.left}`}
                class="wf-gridline"
                style={{ left: `${t.left}px` }}
              />
            ))}
          </div>
          <div class="wf-rows">
            {nodes.map((n, i) => {
              const v = visuals[i];
              if (!v) {
                return null;
              }
              return (
                <div key={n.session_id} class="wf-row">
                  {Array.from({ length: n.depth }, (_, d) => (
                    <div
                      key={`r${d}`}
                      class="wf-depth-rail"
                      style={{ left: `${4 + d * 7}px` }}
                    />
                  ))}
                  <div
                    class={`${v.barClass} wf-clickable`}
                    style={v.barStyle}
                    data-session-id={n.session_id}
                  >
                    {v.barText}
                  </div>
                  <div
                    class="wf-label"
                    style={{ left: `${v.labelX}px`, color: v.labelColor }}
                  >
                    <LabelContent n={n} />
                  </div>
                </div>
              );
            })}
          </div>
          <svg
            class="wf-connectors"
            width={layout.chartW}
            height={layout.chartH}
          >
            {links.map((l) => (
              <g key={l.key}>
                <path d={l.d} />
                <polygon class="wf-arrowhead" points={l.points} />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {tip
        ? createPortal(
            // Portaled to document.body so the fixed-position card is
            // viewport-relative: the .session-row it hovers uses
            // content-visibility, which would otherwise make that row the
            // containing block and pin the tooltip inside it (matching the
            // legacy renderer, which appends #wf-tooltip to document.body).
            <div
              id="wf-tooltip"
              ref={tipRef}
              style={{
                display: "block",
                left: `${tip.cursorX + 14}px`,
                top: `${tip.cursorY + 14}px`,
              }}
            >
              <dl>
                {tooltipRows(tip.node, layout.openEdge).map(([k, val]) => (
                  <>
                    <dt key={`k${k}`}>{k}</dt>
                    <dd key={`v${k}`}>{val}</dd>
                  </>
                ))}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
