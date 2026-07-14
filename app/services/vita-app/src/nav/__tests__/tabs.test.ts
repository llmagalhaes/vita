import { TAB_ROUTES, tabIndex } from "../TabsPager";

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
