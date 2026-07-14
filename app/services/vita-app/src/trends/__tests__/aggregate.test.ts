import type { LocalEntry } from "../../db/entries";
import { ALL_MUSCLES } from "../../ui/BodyMap";
import {
  WINDOW_DAYS,
  aggregateDays,
  dayKey,
  mealTimeDots,
  muscleStats,
  vacationExcluder,
  visibleDays,
  windowDays,
  windowRange,
  workoutsInWindow,
} from "../aggregate";
import { indexFromX } from "../scrub";

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

describe("windowing", () => {
  test("windowDays returns N local-midnight days ending today, oldest→newest", () => {
    const days = windowDays("W", TODAY);
    expect(days).toHaveLength(WINDOW_DAYS.W);
    expect(days).toHaveLength(7);
    expect(dayKey(days[6]!)).toBe("2026-06-15");
    expect(dayKey(days[0]!)).toBe("2026-06-09");
    for (const d of days) expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  test("W/F/M sizes", () => {
    expect(windowDays("F", TODAY)).toHaveLength(14);
    expect(windowDays("M", TODAY)).toHaveLength(30);
  });

  test("windowRange is half-open [firstDay, dayAfterToday)", () => {
    const { start, end } = windowRange("W", TODAY);
    expect(dayKey(start)).toBe("2026-06-09");
    expect(dayKey(end)).toBe("2026-06-16"); // exclusive upper bound = tomorrow
  });
});

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
    const days = aggregateDays(entries, "W", TODAY);
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
    const days = aggregateDays(entries, "W", TODAY);
    expect(days).toHaveLength(7);
    const empty = days.find((d) => d.key === "2026-06-11")!;
    expect(empty.consumedKcal).toBe(0);
    expect(empty.waterMl).toBe(0);
  });
});

describe("vacation-day exclusion", () => {
  const entries = [entry("meal", daysAgo(1, 8), { totals: { kcal: 700 } })];

  test("predicate flags the day; visibleDays drops it; bucket still holds the data", () => {
    const isEx = vacationExcluder([{ start: daysAgo(1), end: daysAgo(1) }]);
    const days = aggregateDays(entries, "W", TODAY, isEx);
    const vac = days.find((d) => d.key === dayKey(new Date(daysAgo(1))))!;
    expect(vac.excluded).toBe(true);
    expect(vac.consumedKcal).toBe(700); // still bucketed
    expect(visibleDays(days).some((d) => d.excluded)).toBe(false);
    expect(visibleDays(days)).toHaveLength(6);
  });

  test("range covering multiple days excludes each; ISO datetime bounds work", () => {
    const isEx = vacationExcluder([{ start: "2026-06-13T00:00:00Z", end: "2026-06-14T23:59:59Z" }]);
    expect(isEx("2026-06-13")).toBe(true);
    expect(isEx("2026-06-14")).toBe(true);
    expect(isEx("2026-06-15")).toBe(false);
    expect(isEx("2026-06-12")).toBe(false);
  });
});

describe("muscleStats → BodyMap intensity", () => {
  const entries = [
    entry("workout", daysAgo(1, 18), { muscles: ["chest", "shoulders"] }),
    entry("workout", daysAgo(3, 18), { muscles: ["chest", "triceps"] }),
    entry("workout", daysAgo(5, 18), { muscles: ["chest"] }),
  ];

  test("counts sessions per muscle, normalizes intensity to the busiest = 1", () => {
    const { counts, intensity, ranked } = muscleStats(entries, "W", TODAY);
    expect(counts.chest).toBe(3);
    expect(counts.shoulders).toBe(1);
    expect(intensity.chest).toBe(1);
    expect(intensity.shoulders).toBeCloseTo(1 / 3, 5);
    // ranked is sorted by count desc, chest first
    expect(ranked[0]!.muscle).toBe("chest");
    expect(ranked[0]!.count).toBe(3);
  });

  test("intensity keys are all real BodyMap muscles and within [0,1]", () => {
    const { intensity } = muscleStats(entries, "W", TODAY);
    for (const [m, v] of Object.entries(intensity)) {
      expect(ALL_MUSCLES).toContain(m);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("vacation workouts excluded from the counts", () => {
    const isEx = vacationExcluder([{ start: daysAgo(1), end: daysAgo(1) }]);
    const { counts } = muscleStats(entries, "W", TODAY, isEx);
    expect(counts.shoulders).toBeUndefined(); // that session was on the vacation day
    expect(counts.chest).toBe(2);
  });
});

describe("meal-time dots", () => {
  test("x maps clock time from 6:00→0% to 24:00→100%; before 6am clamps to 0", () => {
    const dots = mealTimeDots(
      [entry("meal", daysAgo(0, 12), { totals: { kcal: 400 } }), entry("meal", daysAgo(0, 5), { totals: { kcal: 200 } })],
      "W",
      TODAY,
    );
    const noon = dots.find((d) => d.xPct > 0)!;
    expect(noon.xPct).toBeCloseTo(((12 - 6) / 18) * 100, 3);
    const early = dots.find((d) => d.xPct === 0);
    expect(early).toBeDefined(); // 5am clamped to 0
  });
});

describe("workoutsInWindow", () => {
  test("returns window workouts newest-first, honoring exclusion", () => {
    const entries = [
      entry("workout", daysAgo(1, 18), { title: "A", muscles: ["chest"] }),
      entry("workout", daysAgo(4, 18), { title: "B", muscles: ["back"] }),
      entry("meal", daysAgo(1, 8), { totals: { kcal: 100 } }),
    ];
    const w = workoutsInWindow(entries, "W", TODAY);
    expect(w.map((e) => (e.detail as { title: string }).title)).toEqual(["A", "B"]);
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
});
