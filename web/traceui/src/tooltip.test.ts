// Repro + regression for the waterfall tooltip clamp (PMVP-038). Hovering a
// bar low or far-right in the viewport used to place the card at
// {cursor + 14} with no clamping, so the fixed-position card overflowed and
// was clipped. Each case asserts the rendered card rect stays fully within the
// viewport (with the 8px edge margin the renderer keeps).
import assert from "node:assert/strict";
import test from "node:test";
import { clampTooltip, type Size, type Viewport } from "./tooltip.ts";

const VIEWPORT: Viewport = { width: 1280, height: 800 };
const CARD: Size = { width: 360, height: 260 };
const EDGE = 8;

// assertOnScreen fails with the offending edge and coordinates spelled out, so
// a regression reads as "right edge overflowed at left=1260" not a bare false.
function assertOnScreen(
  left: number,
  top: number,
  size: Size,
  viewport: Viewport,
): void {
  assert.ok(left >= EDGE, `left ${left} past left edge (min ${EDGE})`);
  assert.ok(top >= EDGE, `top ${top} past top edge (min ${EDGE})`);
  assert.ok(
    left + size.width <= viewport.width - EDGE,
    `right ${left + size.width} past right edge (max ${viewport.width - EDGE})`,
  );
  assert.ok(
    top + size.height <= viewport.height - EDGE,
    `bottom ${top + size.height} past bottom edge (max ${viewport.height - EDGE})`,
  );
}

test("bottom-right cursor: card flips left and clamps up, staying on-screen", () => {
  const { left, top } = clampTooltip(1270, 795, CARD, VIEWPORT);
  assertOnScreen(left, top, CARD, VIEWPORT);
});

test("far-right cursor: card flips to the left of the cursor", () => {
  const { left } = clampTooltip(1200, 400, CARD, VIEWPORT);
  // width 360 + 14 gap would overflow past the right edge, so it flips left.
  assert.equal(left, 1200 - CARD.width - 14);
  assertOnScreen(left, 400, CARD, VIEWPORT);
});

test("bottom cursor: top clamps to keep the card above the bottom edge", () => {
  const { top } = clampTooltip(400, 790, CARD, VIEWPORT);
  assert.equal(top, VIEWPORT.height - CARD.height - EDGE);
  assertOnScreen(400, top, CARD, VIEWPORT);
});

test("interior cursor: default offset placement is left untouched", () => {
  const { left, top } = clampTooltip(300, 200, CARD, VIEWPORT);
  assert.deepEqual({ left, top }, { left: 314, top: 214 });
});
