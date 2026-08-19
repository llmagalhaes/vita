import { PANEL_ROUTES, canStartPan, commitTarget, isVerticalVeto, panelIndex, rubberBand, shouldEngage } from "../panelPan";

const W = 390; // the prototype's canvas — keeps the reference numbers comparable

test("panel order is Trends · Day · Library", () => {
  expect(PANEL_ROUTES).toEqual(["/trends", "/day", "/library"]);
  expect(panelIndex("/trends")).toBe(0);
  expect(panelIndex("/day")).toBe(1);
  expect(panelIndex("/library")).toBe(2);
});

test("panelIndex returns -1 off the panels (shell hides on pushes)", () => {
  expect(panelIndex("/account")).toBe(-1);
  expect(panelIndex("/plan-setup")).toBe(-1);
  expect(panelIndex("/")).toBe(-1);
});

describe("canStartPan — EDGE 34 on Day only", () => {
  test("Day arms inside either 34px edge, exactly at the threshold", () => {
    expect(canStartPan(1, 0, W)).toBe(true);
    expect(canStartPan(1, 34, W)).toBe(true);
    expect(canStartPan(1, 34.1, W)).toBe(false);
    expect(canStartPan(1, 195, W)).toBe(false); // mid-screen: dock/charts own it
    expect(canStartPan(1, W - 34, W)).toBe(true); // 356 in the prototype
    expect(canStartPan(1, W - 34.1, W)).toBe(false);
    expect(canStartPan(1, W, W)).toBe(true);
  });
  test("Trends and Library drag from anywhere", () => {
    expect(canStartPan(0, 195, W)).toBe(true);
    expect(canStartPan(2, 195, W)).toBe(true);
  });
});

describe("shouldEngage — |dx| ≥ 8", () => {
  test.each([
    [7.9, false],
    [8, true],
    [-8, true],
    [-7.9, false],
    [0, false],
  ])("dx %p → %p", (dx, engaged) => {
    expect(shouldEngage(dx)).toBe(engaged);
  });
});

describe("isVerticalVeto — |dy| > 12 && |dy| > 1.1·|dx|", () => {
  test("both conditions are required", () => {
    expect(isVerticalVeto(0, 12)).toBe(false); // not past 12
    expect(isVerticalVeto(0, 12.1)).toBe(true);
    expect(isVerticalVeto(-10, -13)).toBe(true); // 13 > 12 and 13 > 11 → veto (signs ignored)
    expect(isVerticalVeto(30, 20)).toBe(false); // past 12 but not past 1.1·30
  });
  test("the ratio is strict at exactly 1.1·|dx|", () => {
    expect(isVerticalVeto(20, 22)).toBe(false); // 22 > 1.1·20 = 22 is false
    expect(isVerticalVeto(20, 22.1)).toBe(true);
  });
  test("a clearly horizontal drag never vetoes", () => {
    expect(isVerticalVeto(90, 20)).toBe(false);
    expect(isVerticalVeto(-90, -20)).toBe(false);
  });
});

describe("rubberBand — 1:1 inside, ÷3.5 past the ends", () => {
  test("no resistance mid-range", () => {
    expect(rubberBand(1, 60, W)).toBe(60);
    expect(rubberBand(1, -60, W)).toBe(-60);
    expect(rubberBand(0, -100, W)).toBe(-100);
  });
  test("past the left end (panel 0 dragged right) only 1/3.5 travels", () => {
    expect(rubberBand(0, 35, W)).toBeCloseTo(10, 6); // 35 / 3.5
    expect(rubberBand(0, 0, W)).toBe(0);
  });
  test("past the right end (panel 2 dragged left) only 1/3.5 travels", () => {
    expect(rubberBand(2, -35, W)).toBeCloseTo(-10, 6);
  });
  test("partially past an end keeps the in-range part 1:1", () => {
    // panel 0, drag right 35 → all 35 is overshoot → 10
    // panel 1 dragged right 390+35: 390 lands at the end, 35 overshoots
    expect(rubberBand(1, 425, W)).toBeCloseTo(390 + 10, 6);
  });
});

describe("commitTarget — |dx| ≥ 90, distance only, one panel per gesture", () => {
  test("exactly 90 does not commit; past 90 does", () => {
    expect(commitTarget(1, -90)).toBe(1);
    expect(commitTarget(1, -90.1)).toBe(2);
    expect(commitTarget(1, 90)).toBe(1);
    expect(commitTarget(1, 90.1)).toBe(0);
  });
  test("never jumps two panels, however far the drag went", () => {
    expect(commitTarget(0, -1000)).toBe(1);
    expect(commitTarget(2, 1000)).toBe(1);
  });
  test("clamps at both ends", () => {
    expect(commitTarget(0, 500)).toBe(0);
    expect(commitTarget(2, -500)).toBe(2);
  });
});
