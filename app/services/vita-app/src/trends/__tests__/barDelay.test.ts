import { barDelay } from "../parts";

// Prototype `tDelay`: 55ms/bar for the 7-day view (reads as a clear left→right
// sweep), 16ms for the denser 15/30-day views. Paired bars share their day's delay.
test("barDelay staggers 55ms per bar at 7 days, 16ms otherwise", () => {
  expect(barDelay(0, 7)).toBe(0);
  expect(barDelay(3, 7)).toBe(165);
  expect(barDelay(6, 7)).toBe(330);
  expect(barDelay(3, 15)).toBe(48);
  expect(barDelay(29, 30)).toBe(29 * 16);
});
