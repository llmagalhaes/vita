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

type Raw = { k: string; kcal: number; waterMl: number; moveKcal: number; workouts: number; records: number };

/** `SUM(json_extract(...))` for one entry type — the detail column is JSON text. */
const sumJson = (type: string, path: string) =>
  `SUM(CASE WHEN type = '${type}' THEN CAST(COALESCE(json_extract(detail, '${path}'), 0) AS REAL) ELSE 0 END)`;

/**
 * One query per range. `strftime` buckets in device-local time, `GROUP BY` collapses
 * to ≤ 30 rows before anything crosses into JS. Buckets with no entries come back
 * zeroed and `recorded: false` — an absence, never an assumption.
 */
export function readBuckets(range: TrendRange, today: Date = new Date()): Bucket[] {
  const dates = rangeDates(range, today);
  const fmt = range === "Y" ? "%Y-%m" : "%Y-%m-%d";
  const key = keyFn(range);
  const rows = getDb().getAllSync<Raw>(
    `SELECT strftime('${fmt}', occurredAt, 'localtime') AS k,
            ${sumJson("meal", "$.totals.kcal")} AS kcal,
            ${sumJson("water", "$.amountMl")} AS waterMl,
            ${sumJson("workout", "$.kcal")} AS moveKcal,
            SUM(CASE WHEN type = 'workout' AND COALESCE(json_extract(detail, '$.planStatus'), '') != 'skipped' THEN 1 ELSE 0 END) AS workouts,
            SUM(CASE WHEN type IN ('meal', 'water', 'workout') THEN 1 ELSE 0 END) AS records
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
      kcal: Math.round(r?.kcal ?? 0),
      waterMl: Math.round(r?.waterMl ?? 0),
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

/** Mean of the buckets that carry a record, skipping the still-open last one. */
export function recordedAverage(values: number[], recorded: boolean[]): number | null {
  const past = values.slice(0, -1).filter((_, i) => recorded[i]);
  if (past.length === 0) return null;
  return Math.round(past.reduce((a, b) => a + b, 0) / past.length);
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
