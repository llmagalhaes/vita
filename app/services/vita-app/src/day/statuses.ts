/**
 * APP-099 — day status for a RANGE of days (the dock's 10 dots, the calendar's month).
 *
 * Derived LOCALLY from SQLite entries (PLAN R1: there is no `/days` resource). One
 * ranged query per entry type instead of `getDayRecord()` per day — the APP-094 ledger
 * asks for exactly this, since the day-record cache exists to avoid per-day queries.
 *
 * A day that isn't in the returned map has **no record** — an absence, never a failure.
 *
 * ponytail: no lazy server hydration for months the device has never seen. The contract's
 * `GET /entries` takes a single `date`, so a month would cost 30 round-trips; add it when
 * the API grows a range query (then: fetch once per month, keyed in kv).
 */
import { entriesInRange } from "../db/entries";
import type { LocalEntry } from "../db/entries";
import { dayKey, emptyDay, fromMealEntry, fromWorkoutEntry, type DayRecord } from "./record";
import { dayStatus } from "./state";

export type DayStatus = "asPlanned" | "adjusted" | "unrecorded";

/**
 * Record status of every day in `[start, end)` that has one, keyed by local `YYYY-MM-DD`.
 * Water is deliberately not read: water alone never closes a day (R1), so a day with only
 * drinks stays unrecorded.
 */
export function dayStatuses(start: Date, end: Date): Record<string, DayStatus> {
  const byDay = new Map<string, DayRecord>();
  const day = (e: LocalEntry): DayRecord => {
    const k = dayKey(new Date(e.occurredAt));
    let rec = byDay.get(k);
    if (!rec) byDay.set(k, (rec = emptyDay(k)));
    return rec;
  };
  for (const e of entriesInRange("meal", start, end)) {
    const m = fromMealEntry(e);
    if (m) day(e).meals.push(m);
  }
  for (const e of entriesInRange("workout", start, end)) {
    const w = fromWorkoutEntry(e);
    if (w) day(e).workout = w;
  }
  const out: Record<string, DayStatus> = {};
  for (const [k, rec] of byDay) out[k] = dayStatus(rec);
  return out;
}

/** `dayStatuses` for the last `days` calendar days ending on (and including) `today`. */
export function recentStatuses(today: Date, days: number): Record<string, DayStatus> {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return dayStatuses(start, end);
}

/** `dayStatuses` for the whole calendar month `date` falls in. */
export function monthStatuses(date: Date): Record<string, DayStatus> {
  return dayStatuses(new Date(date.getFullYear(), date.getMonth(), 1), new Date(date.getFullYear(), date.getMonth() + 1, 1));
}
