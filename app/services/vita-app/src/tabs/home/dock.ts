/**
 * Dock date picker — pure math (Home v2, HOME-V2-2).
 *
 * All continuous motion runs on the UI thread; this module holds only the
 * pure, worklet-safe helpers so the magnifier feel is unit-testable without a
 * device. Verbatim prototype math in docs/home-v2/handoff-extract.md §a.
 *
 * Day mapping: dot `i` (left→right, 0..9) shows dayOffset `9 - i`
 * (0 = today, rightmost dot). 10 dots = today + the previous 9 days.
 */

export const NDAYS = 10;
export const MAXD = NDAYS - 1; // 9

// Magnifier tuning — literals, not theme tokens (spec §4). Tune against
// screens/04-dock-magnifier-mid-drag.png + 05-past-day-loaded.png.
export const AMPLITUDE = 1.15; // scale = 1 + AMPLITUDE * gaussian
export const SPREAD_FACTOR = 1.25; // spread = slot * SPREAD_FACTOR
export const LIFT_PX = 13; // translateY = -(LIFT_PX * gaussian)
export const IDLE_SELECTED_SCALE = 1.85; // selected dot at rest
export const TINT_THRESHOLD = 0.14; // prototype tints only above this mag

// NOTE: every helper below carries "worklet" — they are called from the dock's
// useAnimatedStyle + gesture worklets (UI thread). Without it Reanimated throws
// "Object is not a function" on the UI thread (device-verified). The directive
// is a harmless no-op on the JS thread (tests call them directly).

/** dot index (0..9, left→right) → day offset (0 = today, rightmost). */
export function offsetForIndex(i: number): number {
  "worklet";
  return MAXD - i;
}

/** day offset (0 = today) → dot index (0..9, left→right). */
export function indexForOffset(off: number): number {
  "worklet";
  return MAXD - off;
}

/** Per-slot width for a measured row. */
export function slotWidth(rowWidth: number): number {
  "worklet";
  return rowWidth / NDAYS;
}

/** Gaussian falloff spread (px) for a given slot width. */
export function spreadFor(slot: number): number {
  "worklet";
  return slot * SPREAD_FACTOR;
}

/** Center x (px) of dot `i` within the row. */
export function dotCenter(i: number, slot: number): number {
  "worklet";
  return (i + 0.5) * slot;
}

function clamp(v: number, lo: number, hi: number): number {
  "worklet";
  return Math.max(lo, Math.min(hi, v));
}

/** Finger x (px within row) → the dot index under the finger, clamped [0,9]. */
export function hoverIndex(x: number, slot: number): number {
  "worklet";
  if (slot <= 0) return 0;
  return clamp(Math.round(x / slot - 0.5), 0, MAXD);
}

/** Idle finger x = the center of the currently selected dot (drag start point). */
export function idleFingerX(selectedOffset: number, slot: number): number {
  "worklet";
  return dotCenter(indexForOffset(selectedOffset), slot);
}

/** e^-(d/spread)² — peaks at 1 when d===0, falls off with distance. */
export function gaussian(d: number, spread: number): number {
  "worklet";
  if (spread <= 0) return 0;
  const r = d / spread;
  return Math.exp(-(r * r));
}

/**
 * The magnified dot state for dot `i` given the finger position. `dragging`
 * off → the selected dot rests at IDLE_SELECTED_SCALE, all others at 1.
 * Pure — the component's useAnimatedStyle calls this on the UI thread.
 */
export function dotState(
  i: number,
  fingerX: number,
  slot: number,
  dragging: boolean,
  selectedOffset: number,
): { scale: number; translateY: number; opacity: number; mag: number } {
  "worklet";
  const mag = gaussian(Math.abs(fingerX - dotCenter(i, slot)), spreadFor(slot));
  const isSel = !dragging && offsetForIndex(i) === selectedOffset;
  return {
    mag,
    scale: dragging ? 1 + AMPLITUDE * mag : isSel ? IDLE_SELECTED_SCALE : 1,
    translateY: dragging ? -(LIFT_PX * mag) : 0,
    opacity: dragging ? 0.5 + 0.5 * mag : isSel ? 1 : 0.85,
  };
}

export { clamp };
