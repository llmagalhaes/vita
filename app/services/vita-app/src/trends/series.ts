/**
 * APP-100 — the numbers behind the v4 Trends panel.
 *
 * **Plan risk R6: a year of rows is never mapped in JS.** Every chart series is ONE
 * `GROUP BY` over `entries` that returns at most 30 rows (7 days · 30 days · 12
 * months), and the record counter is a single `COUNT(DISTINCT day)`. SQLite computes
 * the bucket key in the DEVICE's zone (`'localtime'`), which is the same local-day
 * rule `dayKey()` applies in JS — the two never disagree.
 *
 * Everything that isn't a query is pure geometry, so the chart math is unit-tested
 * without a renderer.
 */
import type { WeightDetail } from "../api/client";
import { getDb } from "../db/db";
import { entriesInRange } from "../db/entries";

/** Week · Month · Year. The v3 15-day window (`WINDOW_DAYS.F`) is gone. */
export type TrendRange = "W" | "M" | "Y";
/** Buckets per range: 7 days · 30 days · 12 months. */
export const RANGE_N: Record<TrendRange, number> = { W: 7, M: 30, Y: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const keyFn = (range: TrendRange) => (range === "Y" ? monthOf : dayOf);

/** The range's buckets at local midnight (month starts for Y), oldest→newest. */
export function rangeDates(range: TrendRange, today: Date = new Date()): Date[] {
  const n = RANGE_N[range];
  if (range === "Y") {
    return Array.from({ length: n }, (_, i) => new Date(today.getFullYear(), today.getMonth() - (n - 1 - i), 1));
  }
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (n - 1 - i));
    return d;
  });
}

/** Exclusive upper bound of every range: tomorrow's local midnight. */
export function rangeEnd(today: Date = new Date()): Date {
  const e = new Date(today);
  e.setHours(0, 0, 0, 0);
  e.setDate(e.getDate() + 1);
  return e;
}

export type Bucket = {
  key: string;
  date: Date;
  kcal: number;
  waterMl: number;
  moveKcal: number;
  /** Workout records that actually happened — a `skipped` one is a record, not a session. */
  workouts: number;
  /** The user recorded SOMETHING that period (meal · water · workout). */
  recorded: boolean;
};

type Raw = {
  k: string;
  kcal: number;
  waterMl: number;
  moveKcal: number;
  workouts: number;
  records: number;
  mealDays: number;
  waterDaysIn: number;
};

/** `SUM(json_extract(...))` for one entry type — the detail column is JSON text. */
const sumJson = (type: string, path: string) =>
  `SUM(CASE WHEN type = '${type}' THEN CAST(COALESCE(json_extract(detail, '${path}'), 0) AS REAL) ELSE 0 END)`;

/**
 * One query per range. `strftime` buckets in device-local time, `GROUP BY` collapses
 * to ≤ 30 rows before anything crosses into JS. Buckets with no entries come back
 * zeroed and `recorded: false` — an absence, never an assumption.
 *
 * `kcal`/`waterMl` are **per recorded day inside the bucket** (handoff v4.1 §3): on
 * W/M a bucket IS one day, so the division is by 1 and the value is that day's total;
 * on Y it turns the month's sum into a daily average, which is the only aggregate that
 * means anything for a rate — summing twelve monthly kcal totals is a number with no
 * physical meaning. The divisor counts days that carry that metric, so an unrecorded
 * day never dilutes the average into a zero.
 */
export function readBuckets(range: TrendRange, today: Date = new Date()): Bucket[] {
  const dates = rangeDates(range, today);
  const fmt = range === "Y" ? "%Y-%m" : "%Y-%m-%d";
  const day = `strftime('%Y-%m-%d', occurredAt, 'localtime')`;
  const key = keyFn(range);
  const rows = getDb().getAllSync<Raw>(
    `SELECT strftime('${fmt}', occurredAt, 'localtime') AS k,
            ${sumJson("meal", "$.totals.kcal")} AS kcal,
            ${sumJson("water", "$.amountMl")} AS waterMl,
            ${sumJson("workout", "$.kcal")} AS moveKcal,
            SUM(CASE WHEN type = 'workout' AND COALESCE(json_extract(detail, '$.planStatus'), '') != 'skipped' THEN 1 ELSE 0 END) AS workouts,
            SUM(CASE WHEN type IN ('meal', 'water', 'workout') THEN 1 ELSE 0 END) AS records,
            COUNT(DISTINCT CASE WHEN type = 'meal' THEN ${day} END) AS mealDays,
            COUNT(DISTINCT CASE WHEN type = 'water' THEN ${day} END) AS waterDaysIn
       FROM entries
      WHERE occurredAt >= ? AND occurredAt < ?
      GROUP BY k`,
    [dates[0]!.toISOString(), rangeEnd(today).toISOString()],
  );
  const by = new Map(rows.map((r) => [r.k, r]));
  return dates.map((date) => {
    const r = by.get(key(date));
    return {
      key: key(date),
      date,
      kcal: Math.round((r?.kcal ?? 0) / Math.max(1, r?.mealDays ?? 0)),
      waterMl: Math.round((r?.waterMl ?? 0) / Math.max(1, r?.waterDaysIn ?? 0)),
      moveKcal: Math.round(r?.moveKcal ?? 0),
      workouts: r?.workouts ?? 0,
      recorded: (r?.records ?? 0) > 0,
    };
  });
}

export type YearCounters = {
  /** Days this year carrying any meal/water/workout entry. */
  recorded: number;
  /** LIVE day-of-year — the counter's denominator grows with the year, never 365. */
  dayOfYear: number;
  /** Days this year with a water entry (the water card's caption). */
  waterDays: number;
};

/** Two `COUNT(DISTINCT …)`s in one pass over this year's entries. */
export function yearCounters(today: Date = new Date()): YearCounters {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = rangeEnd(today);
  const row = getDb().getFirstSync<{ recorded: number; waterDays: number }>(
    `SELECT COUNT(DISTINCT CASE WHEN type IN ('meal', 'water', 'workout') THEN d END) AS recorded,
            COUNT(DISTINCT CASE WHEN type = 'water' THEN d END) AS waterDays
       FROM (SELECT type, strftime('%Y-%m-%d', occurredAt, 'localtime') AS d
               FROM entries WHERE occurredAt >= ? AND occurredAt < ?)`,
    [start.toISOString(), end.toISOString()],
  );
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return {
    recorded: row?.recorded ?? 0,
    waterDays: row?.waterDays ?? 0,
    dayOfYear: Math.round((midnight.getTime() - start.getTime()) / 86_400_000) + 1,
  };
}

export type WeightPoint = { kg: number; at: string; date: Date };

/**
 * The range's weight readings, one per bucket (the LAST reading of the day/month),
 * oldest→newest. Buckets without a reading are simply absent — the line joins the
 * readings that exist and invents nothing between them. Bounded at 7/30/12 points.
 */
export function weightSeries(range: TrendRange, today: Date = new Date()): WeightPoint[] {
  const dates = rangeDates(range, today);
  const key = keyFn(range);
  const last = new Map<string, { kg: number; at: string }>();
  for (const e of entriesInRange("weight", dates[0]!, rangeEnd(today))) {
    last.set(key(new Date(e.occurredAt)), { kg: (e.detail as WeightDetail).kg, at: e.occurredAt });
  }
  return dates
    .map((d) => last.get(key(d)))
    .filter((p): p is { kg: number; at: string } => p != null)
    .map((p) => ({ ...p, date: new Date(p.at) }));
}

// ── pure geometry (README §3 Charts) ─────────────────────────────────────────

/** Bar height as a % of the 72px box — `max(4, round(v/max·96))`. */
export const barHeightPct = (v: number, max: number): number => Math.max(4, Math.round((v / Math.max(1, max)) * 96));

/** Inter-bar gap: 6px up to 12 bars, 2px for the 30-day month. */
export const barGap = (n: number): number => (n > 12 ? 2 : 6);

/** Tooltip anchor — the bar's centre as a % of the chart width. */
export const tipLeftPct = (i: number, n: number): number => (n <= 0 ? 0 : ((i + 0.5) / n) * 100);

/** Where the dashed average line sits, as a % of the 72px box (unclamped, no floor). */
export const avgLinePct = (avg: number, max: number): number => (avg / Math.max(1, max)) * 96;

/** 1st · 2nd · 3rd · 4th … — the rank line's ordinal. */
export function ordinal(k: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Everything the redesigned chart card annotates (handoff v4.1 §3), from ONE series.
 *
 * The constitution rules the arithmetic: a bucket with no value is an ABSENCE, so it
 * never enters an average and never counts as a "low". `perWeek` therefore derives
 * from the total over calendar weeks and never from `avg × 7` — 18 recorded workout
 * days in 30 average 405 kcal *per session day*, and ×7 would claim seven sessions a
 * week; `7290 / (30/7)` = 1701 kcal a week is what actually happened.
 */
export type ChartStats = {
  n: number;
  /** Chart scale — the tallest bar, floored at 1 so an empty range has no NaN. */
  max: number;
  /** Buckets carrying a value: the coverage numerator ("N of M days recorded"). */
  recorded: number;
  /** Mean over recorded buckets only. 0 when nothing was recorded. */
  avg: number;
  total: number;
  /** Total ÷ calendar weeks in the range. NEVER avg × 7. */
  perWeek: number;
  hiIndex: number;
  loIndex: number;
  hiValue: number;
  /** The lowest RECORDED value — a zero bucket is an absence, not a low. */
  loValue: number;
  /** 1 = the highest recorded bucket · null when that bucket has no record. */
  rank: (i: number) => number | null;
};

export function chartStats(values: number[]): ChartStats {
  const n = values.length;
  const rec = values.filter((v) => v > 0);
  const total = values.reduce((a, b) => a + b, 0);
  const hiValue = n ? Math.max(...values) : 0;
  const loValue = rec.length ? Math.min(...rec) : hiValue;
  const sorted = rec.slice().sort((a, b) => b - a);
  return {
    n,
    max: Math.max(1, hiValue),
    recorded: rec.length,
    avg: rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : 0,
    total,
    perWeek: n ? total / (n / 7) : 0,
    hiValue,
    loValue,
    hiIndex: Math.max(0, values.indexOf(hiValue)),
    loIndex: Math.max(0, values.indexOf(loValue)),
    rank: (i) => {
      const v = values[i];
      return v != null && v > 0 ? sorted.indexOf(v) + 1 : null;
    },
  };
}

/** The weight polyline in the prototype's 306×64 box: y spans 57 → 13. */
export function weightPoints(values: number[], w = 306): Array<{ x: number; y: number }> {
  const n = values.length;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values.map((v, i) => ({
    x: n === 1 ? w / 2 : (i / (n - 1)) * w,
    y: 57 - ((v - lo) / span) * 44,
  }));
}
