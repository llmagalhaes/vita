import { TAB_ROUTES, neighborsToMount, snapTarget, tabIndex } from "../TabsPager";

const W = 400;
const LAST = TAB_ROUTES.length - 1;

test("tabIndex maps the six v3 top-level routes in swipe order", () => {
  expect(TAB_ROUTES).toEqual(["/today", "/home", "/trends", "/workout", "/habits", "/integrations"]);
  expect(tabIndex("/today")).toBe(0);
  expect(tabIndex("/home")).toBe(1);
  expect(tabIndex("/trends")).toBe(2);
  expect(tabIndex("/workout")).toBe(3);
  expect(tabIndex("/habits")).toBe(4);
  expect(tabIndex("/integrations")).toBe(5);
});

test("tabIndex returns -1 for detail/unknown routes (pager hides)", () => {
  expect(tabIndex("/meal/abc")).toBe(-1);
  expect(tabIndex("/account")).toBe(-1);
  expect(tabIndex("/plan-setup")).toBe(-1);
  expect(tabIndex("/")).toBe(-1);
});

describe("neighborsToMount — lazy pager keeps self ± 1, clamped", () => {
  test("mounts the current slot and its neighbours", () => {
    expect(neighborsToMount(1)).toEqual([0, 1, 2]);
    expect(neighborsToMount(3)).toEqual([2, 3, 4]);
  });
  test("clamps at the ends (no negative / past-last slot)", () => {
    expect(neighborsToMount(0)).toEqual([0, 1]);
    expect(neighborsToMount(LAST)).toEqual([LAST - 1, LAST]);
  });
});

describe("snapTarget — one swipe moves at most one adjacent tab (APP-043)", () => {
  test("fast flick left from page 0 lands on 1, never the last tab", () => {
    expect(snapTarget(0, -60, -4000, W)).toBe(1);
    expect(snapTarget(0, -60, -12000, W)).toBe(1); // even faster: still only +1
  });

  test("slow small drag springs back to the start page", () => {
    expect(snapTarget(0, -30, -50, W)).toBe(0);
    expect(snapTarget(1, 24, 40, W)).toBe(1);
  });

  test("deliberate drag+flick past threshold moves exactly one page each way", () => {
    expect(snapTarget(3, -260, -900, W)).toBe(4);
    expect(snapTarget(3, 260, 900, W)).toBe(2);
  });

  test("already at an end clamps — no overshoot across six tabs", () => {
    expect(snapTarget(LAST, -300, -6000, W)).toBe(LAST); // can't go past Integrations
    expect(snapTarget(0, 300, 6000, W)).toBe(0); // can't go before Today
  });
});
