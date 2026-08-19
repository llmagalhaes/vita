/**
 * v4 three-panel edge-swipe math (APP-096) — pure, worklet-safe, unit-tested.
 *
 * Lifted 1:1 from the prototype's `panPD / panPM / panPU`
 * (`docs/v4/Vita Prototype v4.dc.html` lines 1578–1585) and README §1 "Structure".
 * Thresholds live in `ui/tokens.panelGesture` (APP-093) — never re-typed here.
 *
 * Everything the gesture decides is one of these four functions, so the fragile
 * part of the shell is testable without a renderer (this file ate swipes twice
 * before: session-6 mid-gesture remount, session-11 arbitration).
 */
import { panelGesture } from "../ui/tokens";

/** Panel order: Trends · Day · Library (index 0/1/2). Day is home. */
export const PANEL_ROUTES = ["/trends", "/day", "/library"] as const;
export type PanelRoute = (typeof PANEL_ROUTES)[number];
export const DAY_PANEL = 1;
const LAST = PANEL_ROUTES.length - 1;

/** Pure: route path → panel index; detail/unknown routes → -1 (shell hides). */
export function panelIndex(pathname: string): number {
  return PANEL_ROUTES.indexOf(pathname as PanelRoute);
}

/**
 * Where a pan may START. On Day only the two 34px edges arm the pan (the dock and
 * the charts own mid-screen); on Trends/Library the whole surface drags back.
 * Prototype: `act = S.panel!==1 || x<=34 || x>=356` (356 = 390 − 34).
 */
export function canStartPan(panel: number, x: number, width: number): boolean {
  "worklet";
  if (panel !== DAY_PANEL) return true;
  return x <= panelGesture.edgePx || x >= width - panelGesture.edgePx;
}

/** Engage the drag at |dx| ≥ 8px. */
export function shouldEngage(dx: number): boolean {
  "worklet";
  return Math.abs(dx) >= panelGesture.minDxPx;
}

/**
 * Vertical veto — |dy| > 12 AND |dy| > 1.1·|dx|. Checked only BEFORE engaging;
 * once true the pointer is dead for the rest of the gesture (prototype `p2.dead`).
 */
export function isVerticalVeto(dx: number, dy: number): boolean {
  "worklet";
  return Math.abs(dy) > panelGesture.verticalVetoPx && Math.abs(dy) > Math.abs(dx) * panelGesture.verticalVetoRatio;
}

/**
 * 1:1 tracking, rubber-banded ÷3.5 past either end. Returns the effective dx to
 * add to `-panel·width`.
 */
export function rubberBand(panel: number, dx: number, width: number): number {
  "worklet";
  const tx = -panel * width + dx;
  const min = -LAST * width;
  if (tx > 0) return dx - tx + tx / panelGesture.rubberBandDivisor;
  if (tx < min) return dx + (min - tx) - (min - tx) / panelGesture.rubberBandDivisor;
  return dx;
}

/**
 * Commit at |dx| ≥ 90px — distance only, NO velocity term (README §1), and at most
 * one panel per gesture. `dx` is the rubber-banded offset, as in the prototype.
 */
export function commitTarget(panel: number, dx: number): number {
  "worklet";
  if (dx < -panelGesture.commitPx && panel < LAST) return panel + 1;
  if (dx > panelGesture.commitPx && panel > 0) return panel - 1;
  return panel;
}
