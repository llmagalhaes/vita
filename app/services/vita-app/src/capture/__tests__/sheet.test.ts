import { DISMISS_DISTANCE, DISMISS_VELOCITY, shouldDismiss } from "../sheet";

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
