import { consecutiveLogWeeks, consistencyKey, weekStart } from "../consistency";

// Anchor on a fixed Thursday; the walk steps back one Monday-week at a time, so
// "weeks ago" = the iteration index, which we key the fake adapters on.
const today = new Date(2026, 6, 23, 12, 0, 0); // Thu 2026-07-23
const anchor = weekStart(today).getTime();
const weeksAgo = (start: Date) => Math.round((anchor - start.getTime()) / (7 * 86400000));
const from = (set: Set<number>) => (s: Date) => set.has(weeksAgo(s));
const none = () => false;

test("counts consecutive weeks with ≥1 log", () => {
  expect(consecutiveLogWeeks(today, from(new Set([0, 1, 2])), none)).toBe(3);
});

test("the current week counts as soon as it has one log (partial week)", () => {
  expect(consecutiveLogWeeks(today, from(new Set([0])), none)).toBe(1);
});

test("a non-vacation empty week breaks the chain", () => {
  // weeks 0,1 logged, week 2 empty, week 3 logged → stops at 2 → 2
  expect(consecutiveLogWeeks(today, from(new Set([0, 1, 3])), none)).toBe(2);
});

test("a fully-vacation week bridges the chain without counting", () => {
  // week 2 is vacation → weeks 0,1,3 all count → 3
  expect(consecutiveLogWeeks(today, from(new Set([0, 1, 3])), from(new Set([2])))).toBe(3);
});

test("caps at maxWeeks", () => {
  const all = { has: () => true } as unknown as Set<number>;
  expect(consecutiveLogWeeks(today, from(all), none)).toBe(12);
  expect(consecutiveLogWeeks(today, from(all), none, 5)).toBe(5);
});

test("consistencyKey maps ordinals, then 'many' past 12", () => {
  expect(consistencyKey(2)).toBe("trends.consistency.w2");
  expect(consistencyKey(12)).toBe("trends.consistency.w12");
  expect(consistencyKey(13)).toBe("trends.consistency.many");
});
