import { backdropOpacityAt, DISMISS_DISTANCE, DISMISS_VELOCITY, shouldDismiss } from "../sheet";

describe("shouldDismiss", () => {
  it("keeps the sheet for a small, slow drag", () => {
    expect(shouldDismiss(40, 0)).toBe(false);
    expect(shouldDismiss(DISMISS_DISTANCE, 0)).toBe(false); // exactly at distance is not past it
  });

  it("dismisses when dragged past the distance threshold", () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
  });

  it("dismisses on a fast downward flick even if short", () => {
    expect(shouldDismiss(20, DISMISS_VELOCITY + 1)).toBe(true);
  });

  it("ignores upward drags/flicks (negative values)", () => {
    expect(shouldDismiss(-300, -2000)).toBe(false);
  });
});

describe("backdropOpacityAt", () => {
  it("is fully opaque while the sheet sits at rest (translateY 0)", () => {
    expect(backdropOpacityAt(0, 700)).toBe(1);
  });

  it("is fully transparent once the sheet has slid its full height down", () => {
    expect(backdropOpacityAt(700, 700)).toBe(0);
  });

  it("fades linearly through the slide-out", () => {
    expect(backdropOpacityAt(350, 700)).toBeCloseTo(0.5);
  });

  it("clamps: overshoot stays 0, upward drag stays 1", () => {
    expect(backdropOpacityAt(900, 700)).toBe(0);
    expect(backdropOpacityAt(-50, 700)).toBe(1);
  });

  it("stays opaque if height has not been measured yet (guards divide-by-zero)", () => {
    expect(backdropOpacityAt(120, 0)).toBe(1);
  });
});
