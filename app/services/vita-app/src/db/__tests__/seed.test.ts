/**
 * The demo seed is only worth anything if the app DERIVES the right shapes from it
 * (APP-094: no aggregates are stored). So this checks the derived side: a mix of
 * day statuses including real gaps, one retro-closed day, the weight drift and the
 * habit pattern — not the rows the seed wrote.
 */
import { resetDbForTests } from "../db";
import { seedDemoDataOnce } from "../seed";
import { getDayRecord } from "../dayRecord";
import { listHabits } from "../habits";
import { habitDots } from "../../habits/checkins";
import { recentStatuses } from "../../day/statuses";
import { dayIsRetro } from "../../day/state";
import { dayKey } from "../../day/record";
import { latestWeight } from "../../day/weight";

const dateNDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

beforeEach(() => {
  resetDbForTests();
  seedDemoDataOnce();
});

test("three weeks of days derive as a mix, gaps included", () => {
  const statuses = recentStatuses(new Date(), 22);
  const values = Object.values(statuses);
  expect(values.filter((s) => s === "asPlanned").length).toBeGreaterThan(3);
  expect(values.filter((s) => s === "adjusted").length).toBeGreaterThan(5);
  // A gap day has water only, so it never reaches the status map at all (R1).
  expect(Object.keys(statuses)).not.toContain(dayKey(dateNDaysAgo(4)));
  expect(Object.keys(statuses)).not.toContain(dayKey(dateNDaysAgo(17)));
});

test("one day was closed the morning after — and only that kind of day", () => {
  expect(dayIsRetro(getDayRecord(dayKey(dateNDaysAgo(9))))).toBe(true);
  expect(dayIsRetro(getDayRecord(dayKey(dateNDaysAgo(8))))).toBe(false);
});

test("a seeded day carries real water and self-describing meal items", () => {
  const day = getDayRecord(dayKey(dateNDaysAgo(3)));
  expect(day.waterMl).toBeGreaterThanOrEqual(1500);
  expect(day.waterMl).toBeLessThanOrEqual(2600);
  expect(day.meals.length).toBe(5);
  expect(day.meals[2]!.items.length).toBeGreaterThan(0);
  expect(day.meals[2]!.totals.kcal).toBeGreaterThan(0);
});

test("weight drifts down and the habit is answered most days", () => {
  expect(latestWeight()?.kg).toBe(83.1);
  const habit = listHabits()[0]!;
  const dots = habitDots(habit, dateNDaysAgo(1));
  expect(dots.filter((d) => d === "yes").length).toBeGreaterThan(dots.filter((d) => d === "no").length);
});
