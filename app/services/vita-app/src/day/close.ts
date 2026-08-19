/**
 * APP-094 — close the day, live or retro. **ONE representation** (PLAN R10a):
 * both produce the same per-meal records; only `occurredAt` differs (it is always
 * the meal's own slot on the day being closed) and, for retro, the fact that the
 * server's `loggedAt` lands on a later day — which is how "closed later, by you"
 * is derived (R2). Nothing here is a `closed{at,mode}` field on the wire.
 *
 * Pure: returns the new DayRecord plus exactly the records that must be written.
 * src/db/dayRecord.ts turns each one into an entry write through the outbox.
 */
import type { PlanMeal } from "../api/client";
import { buildMealRecord, minutesOf, type DayRecord, type MealRecord } from "./record";
import { mealState } from "./state";

export type CloseResult = { day: DayRecord; written: MealRecord[] };

function close(day: DayRecord, meals: PlanMeal[], accept: (m: PlanMeal) => boolean): CloseResult {
  const written: MealRecord[] = [];
  for (const meal of meals) {
    if (meal.id == null) continue;
    if (mealState(day, meal) !== "planned") continue; // already recorded — never overwritten
    if (!accept(meal)) continue;
    written.push(buildMealRecord(day.date, meal, "done", day.overlay));
  }
  return written.length ? { day: { ...day, meals: [...day.meals, ...written] }, written } : { day, written };
}

/**
 * Close today: only meals that are **due** flip to `done`. A meal later in the day
 * stays `planned` — Vita never records something that hasn't happened yet.
 */
export const closeDay = (day: DayRecord, meals: PlanMeal[], nowMin: number): CloseResult =>
  close(day, meals, (m) => minutesOf(m.time) <= nowMin);

/**
 * Close a past day as planned. Every meal is due (the day is over), so all of them
 * flip — same records, same shape, `occurredAt` on that day.
 */
export const retroClose = (day: DayRecord, meals: PlanMeal[]): CloseResult => close(day, meals, () => true);
