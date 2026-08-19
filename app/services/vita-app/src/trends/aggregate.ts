/**
 * Day bucketing for the PDF export and the local-day key everything else shares.
 *
 * The v4 Trends panel does NOT read this file: its series come from SQL (`series.ts`,
 * plan risk R6 — a year of rows is never mapped in JS), and the v3 15-day window
 * (`WINDOW_DAYS.F`) died with the Food/Activity tabs. What survives here is the pure
 * math the export still needs, plus `dayKey`/`vacationExcluder`, which half the app
 * imports.
 */
import type { MealDetail, WaterDetail, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";

export type TrendWindow = "W" | "M";
export const WINDOW_DAYS: Record<TrendWindow, number> = { W: 7, M: 30 };

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

/** Vacation-day filter hook. */
export type ExcludeDay = (key: string) => boolean;

/** A day inside any [start,end] (inclusive) vacation range is excluded. */
export function vacationExcluder(ranges: Array<{ start: string; end: string }>): ExcludeDay {
  return (key) => ranges.some((r) => key >= r.start.slice(0, 10) && key <= r.end.slice(0, 10));
}

export type DayBucket = {
  key: string;
  date: Date;
  consumedKcal: number;
  spentKcal: number;
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

/** Non-vacation days only. */
export const visibleDays = (days: DayBucket[]): DayBucket[] => days.filter((d) => !d.excluded);
