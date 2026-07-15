import { TAB_ROUTES, snapTarget, tabIndex } from "../TabsPager";

const W = 400;

test("tabIndex maps the three top-level routes in swipe order", () => {
  expect(TAB_ROUTES).toEqual(["/home", "/trends", "/habits"]);
  expect(tabIndex("/home")).toBe(0);
  expect(tabIndex("/trends")).toBe(1);
  expect(tabIndex("/habits")).toBe(2);
});

test("tabIndex returns -1 for detail/unknown routes (pager hides)", () => {
  expect(tabIndex("/meal/abc")).toBe(-1);
  expect(tabIndex("/account")).toBe(-1);
  expect(tabIndex("/")).toBe(-1);
});

describe("snapTarget — one swipe moves at most one adjacent tab (APP-043)", () => {
  test("fast flick left from page 0 lands on 1, never the last tab", () => {
    // velocityX ~ -4000 px/s: the old velocity-projection clamped straight to 2.
    expect(snapTarget(0, -60, -4000, W)).toBe(1);
    expect(snapTarget(0, -60, -12000, W)).toBe(1); // even faster: still only +1
  });

  test("slow small drag springs back to the start page", () => {
    expect(snapTarget(0, -30, -50, W)).toBe(0); // <½ page, sub-threshold flick
    expect(snapTarget(1, 24, 40, W)).toBe(1);
  });

  test("deliberate drag+flick past threshold moves exactly one page each way", () => {
    expect(snapTarget(1, -260, -900, W)).toBe(2); // toward higher index
    expect(snapTarget(1, 260, 900, W)).toBe(0); // toward lower index
  });

  test("a distance drag past half a page commits without any flick", () => {
    expect(snapTarget(0, -210, 0, W)).toBe(1);
    expect(snapTarget(2, 210, 0, W)).toBe(1);
  });

  test("already at an end clamps — no overshoot", () => {
    expect(snapTarget(2, -300, -6000, W)).toBe(2); // can't go past the last tab
    expect(snapTarget(0, 300, 6000, W)).toBe(0); // can't go before the first
  });
});
