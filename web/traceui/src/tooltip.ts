// Placement math for the waterfall hover tooltip (#wf-tooltip), a
// fixed-position card positioned in viewport (client) coordinates at the
// cursor. clampTooltip keeps the fully-rendered card on-screen at any edge:
// it flips to the left of the cursor when the default right placement would
// overflow the right edge, and clamps the top so the card never runs past the
// bottom edge — mirroring the legacy renderer (web/waterfall.js). The caller
// supplies the card's measured size, since the clamp depends on how large the
// card actually rendered.

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  left: number;
  top: number;
}

// Cursor-to-card offset and the minimum gap kept from any viewport edge, both
// matching the legacy renderer.
const CURSOR_GAP = 14;
const EDGE_GAP = 8;

// clampTooltip returns the top-left placement (viewport coordinates) for a
// tooltip of `size` anchored at cursor (`cursorX`, `cursorY`) within
// `viewport`, kept fully on-screen.
export function clampTooltip(
  cursorX: number,
  cursorY: number,
  size: Size,
  viewport: Viewport,
): Point {
  let left = cursorX + CURSOR_GAP;
  if (left + size.width > viewport.width - EDGE_GAP) {
    left = cursorX - size.width - CURSOR_GAP;
  }
  left = Math.max(EDGE_GAP, left);

  const top = Math.max(
    EDGE_GAP,
    Math.min(cursorY + CURSOR_GAP, viewport.height - size.height - EDGE_GAP),
  );

  return { left, top };
}
