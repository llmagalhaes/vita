import { daySummary, mealExpanded, workoutExpanded } from "../timelineData";
import type { LocalEntry } from "../../../db/entries";
import type { MealDetail, WorkoutDetail } from "../../../api";

const entry = (type: string, detail: unknown): LocalEntry =>
  ({
    id: `${type}-${Math.random()}`,
    type,
    occurredAt: new Date().toISOString(),
    inputMethod: "text",
    isEstimate: true,
    detail,
    syncState: "synced",
  }) as unknown as LocalEntry;

describe("timeline data shaping", () => {
  it("daySummary counts meals/workouts and sums water ml — factual, no score", () => {
    const entries = [
      entry("meal", { title: "Breakfast", items: [], totals: { kcal: 400 } }),
      entry("water", { amountMl: 250 }),
      entry("workout", { title: "Run", exercises: [] }),
      entry("water", { amountMl: 500 }),
      entry("checkin", {}), // ignored (not a timeline kind)
    ];
    expect(daySummary(entries)).toEqual({ meals: 1, workouts: 1, waterMl: 750 });
    // empty day
    expect(daySummary([])).toEqual({ meals: 0, workouts: 0, waterMl: 0 });
  });

  it("mealExpanded rounds P/C/F and maps item name+kcal", () => {
    const d: MealDetail = {
      title: "Breakfast",
      items: [
        { name: "Scrambled eggs", kcal: 179.6, proteinG: 12 },
        { name: "Latte", kcal: 110 },
      ],
      totals: { kcal: 430, proteinG: 24.4, carbsG: 38, fatG: 20.8 },
    };
    const ex = mealExpanded(d);
    expect(ex.pcf).toEqual({ p: 24, c: 38, f: 21 });
    expect(ex.items).toEqual([
      { name: "Scrambled eggs", kcal: 180 },
      { name: "Latte", kcal: 110 },
    ]);
  });

  it("workoutExpanded gives minutes, exercise count and set/rep rows", () => {
    const d: WorkoutDetail = {
      title: "Leg day",
      durationMin: 52,
      kcal: 430,
      exercises: [
        { name: "Back squat", sets: 4, reps: 8 },
        { name: "Leg press", sets: 3, reps: 12 },
      ],
    };
    const ex = workoutExpanded(d);
    expect(ex.minutes).toBe(52);
    expect(ex.exerciseCount).toBe(2);
    expect(ex.items[0]).toEqual({ name: "Back squat", sets: 4, reps: 8 });
    // a cardio session with no exercises
    expect(workoutExpanded({ title: "Run", durationMin: 30, exercises: [] })).toMatchObject({ minutes: 30, exerciseCount: 0, items: [] });
  });
});
