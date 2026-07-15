import type { LocalEntry } from "../../db/entries";
import type { MealDetail, WaterDetail, WorkoutDetail } from "../../api";

/**
 * Pure day/data shaping for the Home v2 timeline (HOME-V2-6). Formatting into
 * i18n strings happens in the component; these helpers stay pure so the counts
 * and expanded-content extraction are unit-testable without a device.
 */

export type TlKind = "meal" | "water" | "workout";

/** Factual counts for the summary line — no score, no streak. */
export function daySummary(entries: LocalEntry[]): { meals: number; workouts: number; waterMl: number } {
  let meals = 0;
  let workouts = 0;
  let waterMl = 0;
  for (const e of entries) {
    if (e.type === "meal") meals += 1;
    else if (e.type === "workout") workouts += 1;
    else if (e.type === "water") waterMl += (e.detail as WaterDetail).amountMl;
  }
  return { meals, workouts, waterMl };
}

/** Expanded meal: P/C/F grams (rounded) + item rows (name + kcal). */
export function mealExpanded(d: MealDetail): {
  pcf: { p: number; c: number; f: number };
  items: { name: string; kcal: number }[];
} {
  const t = d.totals;
  return {
    pcf: {
      p: Math.round(t?.proteinG ?? 0),
      c: Math.round(t?.carbsG ?? 0),
      f: Math.round(t?.fatG ?? 0),
    },
    items: (d.items ?? []).map((it) => ({ name: it.name, kcal: Math.round(it.kcal) })),
  };
}

/** Expanded workout: minutes + exercise count (for chips) + exercise rows. */
export function workoutExpanded(d: WorkoutDetail): {
  minutes: number | null;
  exerciseCount: number;
  items: { name: string; sets?: number; reps?: number }[];
} {
  const exercises = d.exercises ?? [];
  return {
    minutes: d.durationMin ?? null,
    exerciseCount: exercises.length,
    items: exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps })),
  };
}
