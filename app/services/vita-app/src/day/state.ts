/**
 * APP-094 — pure day-record reads. No React, no db, no dates-from-nowhere.
 * `planned` is the absence of a record; "unrecorded" is the absence of ANY
 * meal/workout record (water alone never closes a day — PLAN R1).
 */
import type { DayMeal, DayRecord, MealRecord, MealState, WorkoutRecord } from "./record";
import { mealRecord, minutesOf } from "./record";

/** Composition flags, structurally typed so this file never imports src/db/domains. */
export type Domains = Partial<Record<"meals" | "water" | "move" | "habits" | "weight", boolean>>;

/** A meal is due once its slot time has passed. */
export const isDue = (meal: { minutes?: number; time?: string }, nowMin: number): boolean =>
  (meal.minutes ?? minutesOf(meal.time)) <= nowMin;

/** The state of one plan meal today — no record ⇒ `planned`. */
export const mealState = (day: DayRecord, meal: { id?: string }): MealState =>
  (meal.id != null ? mealRecord(day, meal.id)?.state : undefined) ?? "planned";

export type DayCounters = { done: number; adjusted: number; skipped: number; planned: number };

/**
 * Counts across the day. `planned` needs the plan (an absence can only be counted
 * against something), so pass the day's meals; omitting them counts records only.
 */
export function dayCounters(day: DayRecord, meals: DayMeal[] = []): DayCounters {
  const c: DayCounters = { done: 0, adjusted: 0, skipped: 0, planned: 0 };
  for (const r of day.meals) c[r.state]++;
  for (const m of meals) if (!mealRecord(day, m.id)) c.planned++;
  return c;
}

/** Recorded later than the day it describes ⇒ "closed later, by you" (PLAN R2). */
export const isRetro = (rec: MealRecord | WorkoutRecord): boolean =>
  rec.loggedAt != null && rec.loggedAt.slice(0, 10) > rec.at.slice(0, 10);

export const dayIsRetro = (day: DayRecord): boolean =>
  [...day.meals, ...(day.workout ? [day.workout] : [])].some(isRetro);

/**
 * Calendar-dot status. A day with no meal and no workout record is `unrecorded` —
 * phrased as an absence, never a failure. Anything not fully `done` is `adjusted`
 * (a skipped meal is a deviation the user recorded, not a gap).
 */
export function dayStatus(day: DayRecord): "asPlanned" | "adjusted" | "unrecorded" {
  const recs: Array<MealRecord | WorkoutRecord> = [...day.meals, ...(day.workout ? [day.workout] : [])];
  if (recs.length === 0) return "unrecorded";
  return recs.every((r) => r.state === "done") ? "asPlanned" : "adjusted";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The evening recap / past-day summary line — counters only, never a verdict.
 * Empty string when nothing was recorded; the caller renders the honest empty copy.
 * ponytail: English-shaped here because it is a *count* sentence; APP-108 moves the
 * fragments into i18n when it restructures en.json.
 */
export function recapLine(day: DayRecord, domains: Domains = {}): string {
  const on = (k: keyof Domains) => domains[k] !== false;
  const bits: string[] = [];
  if (on("meals")) {
    const c = dayCounters(day);
    if (c.done || c.adjusted || c.skipped) {
      bits.push(
        plural(c.done, "meal", "meals") +
          " as planned" +
          (c.adjusted ? ` · ${c.adjusted} adjusted` : "") +
          (c.skipped ? ` · ${c.skipped} skipped` : ""),
      );
    }
  }
  if (on("move") && day.workout) {
    bits.push(`${day.workout.title} ${day.workout.state === "skipped" ? "skipped" : "done"}`);
  }
  if (on("water") && day.waterMl > 0) bits.push(`${day.waterMl.toLocaleString("en-US")} ml of water`);
  return bits.join(" · ");
}

/** Meals still marked planned AND already due — what Close the day would record. */
export const pendingMeals = (day: DayRecord, meals: DayMeal[], nowMin: number): DayMeal[] =>
  meals.filter((m) => !mealRecord(day, m.id) && isDue(m, nowMin));

/** The close-the-day card's line (prototype `closeLine`). */
export function closeLine(day: DayRecord, meals: DayMeal[], nowMin: number): string {
  const pend = pendingMeals(day, meals, nowMin);
  if (pend.length === 0) return "Everything is confirmed — close the day whenever you like.";
  return `${pend.map((m) => m.name).join(" and ")} ${pend.length > 1 ? "are" : "is"} still marked planned — everything else is confirmed.`;
}
