import type { LocalEntry } from "../../db/entries";
import { aggregateDays, dayKey, vacationExcluder } from "../aggregate";
import { indexFromX, nearestIndexFromX } from "../scrub";

// Fixed anchor so day math is deterministic (local noon avoids tz day-flip).
const TODAY = new Date(2026, 5, 15, 12, 0, 0); // 2026-06-15
const daysAgo = (n: number, h = 12): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

let seq = 0;
function entry(type: LocalEntry["type"], occurredAt: string, detail: unknown): LocalEntry {
  return {
    id: `e${seq++}`,
    type,
    occurredAt,
    inputMethod: "text",
    isEstimate: true,
    detail: detail as LocalEntry["detail"],
    syncState: "synced",
  };
}

describe("aggregateDays bucketing", () => {
  const entries: LocalEntry[] = [
    entry("meal", daysAgo(0, 8), { totals: { kcal: 500, proteinG: 30, carbsG: 40, fatG: 10 } }),
    entry("meal", daysAgo(0, 13), { totals: { kcal: 300, proteinG: 10, carbsG: 50, fatG: 5 } }),
    entry("water", daysAgo(0, 9), { amountMl: 250 }),
    entry("water", daysAgo(2, 9), { amountMl: 500 }),
    entry("workout", daysAgo(2, 18), { kcal: 320, durationMin: 45, muscles: ["chest"] }),
    entry("meal", daysAgo(20, 8), { totals: { kcal: 999 } }), // outside the W window
  ];

  test("sums meals/water/workouts into the right day; ignores out-of-window", () => {
    const days = aggregateDays(entries, 7, TODAY);
    const today = days.find((d) => d.key === "2026-06-15")!;
    expect(today.consumedKcal).toBe(800);
    expect(today.protein).toBe(40);
    expect(today.waterMl).toBe(250);

    const twoAgo = days.find((d) => d.key === "2026-06-13")!;
    expect(twoAgo.waterMl).toBe(500);
    expect(twoAgo.spentKcal).toBe(320); // D8: spent = logged workout kcal
    expect(twoAgo.workoutMin).toBe(45);

    // the 20-days-ago meal must not land in any W bucket
    expect(days.reduce((s, d) => s + d.consumedKcal, 0)).toBe(800);
  });

  test("missing days stay zeroed, not dropped", () => {
    const days = aggregateDays(entries, 7, TODAY);
    expect(days).toHaveLength(7);
    const empty = days.find((d) => d.key === "2026-06-11")!;
    expect(empty.consumedKcal).toBe(0);
    expect(empty.waterMl).toBe(0);
  });
});

describe("vacation-day exclusion", () => {
  const entries = [entry("meal", daysAgo(1, 8), { totals: { kcal: 700 } })];

  test("predicate flags the day; the bucket still holds the data", () => {
    const isEx = vacationExcluder([{ start: daysAgo(1), end: daysAgo(1) }]);
    const days = aggregateDays(entries, 7, TODAY, isEx);
    const vac = days.find((d) => d.key === dayKey(new Date(daysAgo(1))))!;
    expect(vac.excluded).toBe(true);
    expect(vac.consumedKcal).toBe(700); // still bucketed
    expect(days.filter((d) => !d.excluded)).toHaveLength(6);
  });

  test("range covering multiple days excludes each; ISO datetime bounds work", () => {
    const isEx = vacationExcluder([{ start: "2026-06-13T00:00:00Z", end: "2026-06-14T23:59:59Z" }]);
    expect(isEx("2026-06-13")).toBe(true);
    expect(isEx("2026-06-14")).toBe(true);
    expect(isEx("2026-06-15")).toBe(false);
    expect(isEx("2026-06-12")).toBe(false);
  });
});

describe("scrub index math", () => {
  test("indexFromX clamps to [0, count-1]", () => {
    expect(indexFromX(0, 100, 7)).toBe(0);
    expect(indexFromX(99.9, 100, 7)).toBe(6);
    expect(indexFromX(50, 100, 10)).toBe(5);
    expect(indexFromX(-5, 100, 7)).toBe(0); // finger dragged left of the chart
    expect(indexFromX(10, 0, 7)).toBe(0); // zero width (not laid out yet)
  });

  // The weight line has vertices, not columns: it snaps to the NEAREST reading.
  test("nearestIndexFromX rounds to the closest vertex", () => {
    expect(nearestIndexFromX(0, 100, 5)).toBe(0);
    expect(nearestIndexFromX(100, 100, 5)).toBe(4);
    expect(nearestIndexFromX(51, 100, 5)).toBe(2);
    expect(nearestIndexFromX(63, 100, 5)).toBe(3); // .52 of the way → vertex 3, not 2
    expect(nearestIndexFromX(50, 100, 1)).toBe(0); // a single reading
  });
});
