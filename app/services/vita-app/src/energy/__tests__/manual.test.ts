import { resetDbForTests } from "../../db/db";
import { addLocalEntry, entriesForDay } from "../../db/entries";
import { pendingCount } from "../../db/outbox";
import type { MealDetail, WorkoutDetail } from "../../api/client";
import {
  energyChartMax,
  last7EnergySeries,
  logManualEnergy,
  manualEnergyEntry,
  parseBurned,
} from "../manual";

const daysAgo = (n: number, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const workout = (kcal: number, occurredAt: string) =>
  addLocalEntry({ type: "workout", occurredAt, inputMethod: "tap", isEstimate: true, detail: { title: "Energy", kcal, exercises: [] } });
const meal = (kcal: number, occurredAt: string) =>
  addLocalEntry({
    type: "meal",
    occurredAt,
    inputMethod: "text",
    isEstimate: true,
    detail: { title: "M", items: [], totals: { kcal } } as MealDetail,
  });

beforeEach(() => resetDbForTests());

test("parseBurned reads the spoken/typed number, else null", () => {
  expect(parseBurned("burned 300")).toBe(300);
  expect(parseBurned("burnt 450 kcal")).toBe(450);
  expect(parseBurned("spent 200 calories")).toBe(200);
  expect(parseBurned("had a banana")).toBeNull();
});

test("manualEnergyEntry is a workout entry with kcal and NO exercises (D8, no new shape)", () => {
  const e = manualEnergyEntry(300);
  expect(e.type).toBe("workout");
  expect(e.isEstimate).toBe(true); // labeled an estimate
  const d = e.detail as WorkoutDetail;
  expect(d.kcal).toBe(300);
  expect(d.exercises).toEqual([]);
});

test("logManualEnergy writes the entry locally and enqueues it for sync (existing outbox path)", () => {
  logManualEnergy(300);
  const today = entriesForDay(new Date()).filter((e) => e.type === "workout");
  expect(today).toHaveLength(1);
  expect((today[0]!.detail as WorkoutDetail).kcal).toBe(300);
  expect(pendingCount()).toBe(1); // rides the same outbox as any entry
});

// Audit 1.1/2.2: the last-7 chart used to paint TODAY's spent across all 7 days and
// scale against consumed-only, so a lone "burned 800" made 7 identical bars overflow
// to ~80,000% height. Spent must be per-day real data and the max must include it.
test("last-7 spent is real per-day workout kcal, never today's total fabricated across the week", () => {
  workout(800, daysAgo(3)); // one workout, three days ago; nothing else all week
  const series = last7EnergySeries();
  expect(series).toHaveLength(7);
  expect(series[3]!.spent).toBe(800); // lands only on its day (today = index 6)
  expect(series[6]!.spent).toBe(0); // today has no workout — not fabricated to 800
  expect(series.every((d) => d.consumed === 0)).toBe(true);
});

test("energyChartMax includes spent so no bar overflows its scale (audit 1.1 overflow guard)", () => {
  workout(800, daysAgo(3));
  meal(500, daysAgo(1));
  const series = last7EnergySeries();
  const max = energyChartMax(series);
  expect(max).toBe(800); // the larger of consumed(500)/spent(800), not consumed-only
  for (const d of series) {
    expect((d.spent / max) * 100).toBeLessThanOrEqual(100);
    expect((d.consumed / max) * 100).toBeLessThanOrEqual(100);
  }
});
