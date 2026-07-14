/**
 * On-device Trends aggregation (D4: client-side over SQLite; NO server aggregate).
 * Pure math over LocalEntry rows so it's unit-testable — the tabs just read
 * entries via entriesInRange and pass them here. Nothing here touches the DB.
 */
import type { MealDetail, Muscle, WaterDetail, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";

export type TrendWindow = "W" | "F" | "M";
export const WINDOW_DAYS: Record<TrendWindow, number> = { W: 7, F: 14, M: 30 };

/** Local YYYY-MM-DD key — buckets an instant into its calendar day (device tz). */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The window's days at local midnight, oldest→newest, ending today (inclusive). */
export function windowDays(win: TrendWindow, today: Date = new Date()): Date[] {
  const n = WINDOW_DAYS[win];
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (n - 1 - i));
    return d;
  });
}

/** Half-open [start, end) covering the window — hand to entriesInRange. */
export function windowRange(win: TrendWindow, today: Date = new Date()): { start: Date; end: Date } {
  const days = windowDays(win, today);
  const start = days[0]!;
  const end = new Date(days[days.length - 1]!);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Vacation-day filter hook (D1/slice-7 wires real ranges; predicate is enough now). */
export type ExcludeDay = (key: string) => boolean;

/** A day inside any [start,end] (inclusive) vacation range is excluded from trends. */
export function vacationExcluder(ranges: Array<{ start: string; end: string }>): ExcludeDay {
  return (key) => ranges.some((r) => key >= r.start.slice(0, 10) && key <= r.end.slice(0, 10));
}

export type DayBucket = {
  key: string;
  date: Date;
  consumedKcal: number;
  spentKcal: number; // D8: sum of logged workout kcal (labeled estimate); 0 until logged
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  workoutMin: number;
  excluded: boolean; // vacation day — kept in the series but dropped from stats
};

/** Bucket entries into one DayBucket per window day (missing days stay zeroed). */
export function aggregateDays(
  entries: LocalEntry[],
  win: TrendWindow,
  today: Date = new Date(),
  isExcluded?: ExcludeDay,
): DayBucket[] {
  const days = windowDays(win, today);
  const buckets = new Map<string, DayBucket>();
  for (const date of days) {
    const key = dayKey(date);
    buckets.set(key, {
      key,
      date,
      consumedKcal: 0,
      spentKcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      waterMl: 0,
      workoutMin: 0,
      excluded: isExcluded?.(key) ?? false,
    });
  }
  for (const e of entries) {
    const b = buckets.get(dayKey(new Date(e.occurredAt)));
    if (!b) continue; // outside the window
    if (e.type === "meal") {
      const tot = (e.detail as MealDetail).totals;
      b.consumedKcal += tot?.kcal ?? 0;
      b.protein += tot?.proteinG ?? 0;
      b.carbs += tot?.carbsG ?? 0;
      b.fat += tot?.fatG ?? 0;
    } else if (e.type === "water") {
      b.waterMl += (e.detail as WaterDetail).amountMl;
    } else if (e.type === "workout") {
      const wd = e.detail as WorkoutDetail;
      b.spentKcal += wd.kcal ?? 0;
      b.workoutMin += wd.durationMin ?? 0;
    }
  }
  return days.map((d) => buckets.get(dayKey(d))!);
}

/** Non-vacation days only — the base for every stat line and axis max. */
export const visibleDays = (days: DayBucket[]): DayBucket[] => days.filter((d) => !d.excluded);

export type MealDot = {
  key: string;
  xPct: number; // time of day: 6:00→0%, 24:00→100% (earlier clamps to 0)
  yPct: number; // day position: oldest 0% (top) → newest 100% (bottom)
  opacity: number; // relative to the day's biggest meal
};

/**
 * Meal-time scatter: when meals were logged across the window. x = clock time,
 * y = which day, opacity = relative kcal. Vacation days are dropped.
 */
export function mealTimeDots(
  entries: LocalEntry[],
  win: TrendWindow,
  today: Date = new Date(),
  isExcluded?: ExcludeDay,
): MealDot[] {
  const days = windowDays(win, today);
  const n = days.length;
  const indexOf = new Map(days.map((d, i) => [dayKey(d), i]));
  const meals = entries.filter(
    (e) => e.type === "meal" && indexOf.has(dayKey(new Date(e.occurredAt))) && !(isExcluded?.(dayKey(new Date(e.occurredAt))) ?? false),
  );
  const maxKcal = Math.max(1, ...meals.map((e) => (e.detail as MealDetail).totals?.kcal ?? 0));
  return meals.map((e) => {
    const at = new Date(e.occurredAt);
    const dayIdx = indexOf.get(dayKey(at))!;
    const hour = at.getHours() + at.getMinutes() / 60;
    const xPct = Math.max(0, Math.min(100, ((hour - 6) / 18) * 100));
    const yPct = n <= 1 ? 50 : (dayIdx / (n - 1)) * 100;
    const kcal = (e.detail as MealDetail).totals?.kcal ?? 0;
    return { key: e.id, xPct, yPct, opacity: 0.35 + 0.55 * (kcal / maxKcal) };
  });
}

export type MuscleStats = {
  counts: Partial<Record<Muscle, number>>;
  intensity: Partial<Record<Muscle, number>>; // 0..1, normalized by the busiest muscle
  ranked: Array<{ muscle: Muscle; count: number }>;
};

/**
 * Per-muscle session counts over the window → normalized intensity map that
 * feeds BodyMap.highlighted (front∪back covers all 11 muscles). Vacation days out.
 */
export function muscleStats(
  entries: LocalEntry[],
  win: TrendWindow,
  today: Date = new Date(),
  isExcluded?: ExcludeDay,
): MuscleStats {
  const workouts = workoutsInWindow(entries, win, today, isExcluded);
  const counts: Partial<Record<Muscle, number>> = {};
  for (const w of workouts) {
    for (const m of ((w.detail as WorkoutDetail).muscles ?? []) as Muscle[]) {
      counts[m] = (counts[m] ?? 0) + 1;
    }
  }
  const max = Math.max(1, ...Object.values(counts));
  const intensity: Partial<Record<Muscle, number>> = {};
  for (const [m, c] of Object.entries(counts) as Array<[Muscle, number]>) {
    intensity[m] = c / max;
  }
  const ranked = (Object.entries(counts) as Array<[Muscle, number]>)
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count);
  return { counts, intensity, ranked };
}

/** Workout entries in the window, newest first, vacation days excluded. */
export function workoutsInWindow(
  entries: LocalEntry[],
  win: TrendWindow,
  today: Date = new Date(),
  isExcluded?: ExcludeDay,
): LocalEntry[] {
  const days = windowDays(win, today);
  const keys = new Set(days.map(dayKey));
  return entries
    .filter((e) => e.type === "workout")
    .filter((e) => {
      const k = dayKey(new Date(e.occurredAt));
      return keys.has(k) && !(isExcluded?.(k) ?? false);
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
