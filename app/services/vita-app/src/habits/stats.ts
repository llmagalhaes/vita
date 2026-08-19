/**
 * APP-102 — habit statistics. Pure: no db, no React, no clock of its own.
 *
 * Every number here is a COUNT of recorded days — never a score, never a streak
 * (README §5). It is computed from the real `checkin` entries the device already
 * stores; the v4 prototype's `doneAt`/`mCnt` are synthetic demo generators and are
 * deliberately NOT ported.
 */
import type { LocalEntry } from "../db/entries";
import { dayKey, vacationExcluder } from "../trends/aggregate";

/** Days the dock date picker can reach (README §3) — gates "Open this day →". */
export const DOCK_DAYS = 10;
/** By-month history: 8 bars, the last one being the current month. */
export const MONTH_BARS = 8;
/** By-weekday frequency window. */
export const WEEKDAY_WINDOW_DAYS = 30;
/** Weekday columns, Mon-first, as `Date.getDay()` indices. */
export const MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

export type CalendarCell = {
  /** `null` = leading blank so day 1 lands under its weekday column. */
  day: number | null;
  key: string; // "" for blanks
  /** Days before today (negative for future days). */
  offset: number;
  done: boolean;
  future: boolean;
  onVacation: boolean;
};

export type MonthBar = { date: Date; count: number; current: boolean };
export type WeekdayShare = { weekday: number; count: number; share: number };

export type HabitStats = {
  monthCount: number;
  totalCount: number;
  /** ≤ 2 `Date.getDay()` indices, most-recorded first; zero-count days dropped. */
  topWeekdays: number[];
  /** First day the habit was ever recorded, `null` when it never was. */
  since: Date | null;
  /** The month the calendar shows (its first day). */
  monthStart: Date;
  calendar: CalendarCell[];
  months: MonthBar[];
  /** Mon-first. */
  weekdays: WeekdayShare[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD key back to a local-midnight Date (never UTC-parsed). */
export function dateOfKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * The days this habit was answered "yes". A check-in's id is `habitId:YYYY-MM-DD`
 * (see checkins.ts) and that date — not `occurredAt` — is the day it answers;
 * `occurredAt` is only the fallback for an entry whose id came from elsewhere.
 */
export function doneDayKeys(entries: LocalEntry[], habitId: string): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.type !== "checkin") continue;
    const detail = e.detail as { habitId?: string; answer?: string };
    if (detail.habitId !== habitId || detail.answer !== "yes") continue;
    const suffix = e.id.slice(-10);
    out.add(DATE_KEY.test(suffix) ? suffix : dayKey(new Date(e.occurredAt)));
  }
  return out;
}

export function habitStats({
  habitId,
  entries,
  today = new Date(),
  vacationRanges = [],
}: {
  habitId: string;
  /** Every check-in entry on the device (other habits' rows are filtered out). */
  entries: LocalEntry[];
  today?: Date;
  vacationRanges?: Array<{ start: string; end: string }>;
}): HabitStats {
  const done = doneDayKeys(entries, habitId);
  const onVacation = vacationExcluder(vacationRanges);
  const year = today.getFullYear();
  const month = today.getMonth();
  const td = today.getDate();

  const perMonth = new Map<string, number>();
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  let since: string | null = null;
  for (const key of done) {
    perMonth.set(key.slice(0, 7), (perMonth.get(key.slice(0, 7)) ?? 0) + 1);
    perWeekday[dateOfKey(key).getDay()]!++;
    if (since === null || key < since) since = key;
  }

  // Current-month calendar, leading blanks first (Sunday-first grid, as the prototype).
  const monthStart = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendar: CalendarCell[] = Array.from({ length: monthStart.getDay() }, () => ({
    day: null,
    key: "",
    offset: 0,
    done: false,
    future: false,
    onVacation: false,
  }));
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    const future = d > td;
    calendar.push({
      day: d,
      key,
      offset: td - d,
      done: !future && done.has(key),
      future,
      onVacation: onVacation(key),
    });
  }

  const months: MonthBar[] = Array.from({ length: MONTH_BARS }, (_, i) => {
    const date = new Date(year, month - (MONTH_BARS - 1 - i), 1);
    return { date, count: perMonth.get(monthKey(date)) ?? 0, current: i === MONTH_BARS - 1 };
  });

  // Last 30 days including today.
  const windowCounts = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < WEEKDAY_WINDOW_DAYS; i++) {
    const d = new Date(year, month, td - i);
    if (done.has(dayKey(d))) windowCounts[d.getDay()]!++;
  }
  const max = Math.max(1, ...windowCounts);
  const weekdays: WeekdayShare[] = MON_FIRST.map((wd) => ({
    weekday: wd,
    count: windowCounts[wd]!,
    share: windowCounts[wd]! / max,
  }));

  // "Most often" reads the whole history (it sits beside "total"), Mon-first on ties.
  const topWeekdays = MON_FIRST.filter((wd) => perWeekday[wd]! > 0)
    .sort((a, b) => perWeekday[b]! - perWeekday[a]!)
    .slice(0, 2);

  return {
    monthCount: perMonth.get(monthKey(today)) ?? 0,
    totalCount: done.size,
    topWeekdays,
    since: since === null ? null : dateOfKey(since),
    monthStart,
    calendar,
    months,
    weekdays,
  };
}

/** Bar height in px — `round(count/max·42 + 5)`, so an all-zero history is a flat 5px. */
export const monthBarHeight = (count: number, max: number): number =>
  Math.round((count / Math.max(1, max)) * 42 + 5);

/** Weekday circle diameter — `Ø 8 + share·14`. */
export const weekdayDiameter = (share: number): number => Math.round(8 + share * 14);

/** Weekday circle opacity — `.35 + share·.65`, a zero count dimming to `.25`. */
export const weekdayOpacity = (count: number, share: number): number =>
  count === 0 ? 0.25 : 0.35 + share * 0.65;

/** A past day inside the dock's reach can be opened from the sheet. */
export const canOpenDay = (offset: number): boolean => offset >= 0 && offset < DOCK_DAYS;
