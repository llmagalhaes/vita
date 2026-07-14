/**
 * Habit check-ins (APP-025). A check-in is a single yes/no answer to a habit on
 * a given day — no streaks, no scores. Local SQLite is the display source for the
 * dots; answers also persist server-side as `checkin` entries via the outbox
 * (BE-024, Idempotency-Key `habitId:date`), so durability doesn't depend on the
 * device. A "plan" check-in answered yes auto-logs the plan's linked meal.
 */
import { useSyncExternalStore } from "react";
import { api } from "../api";
import type { MealDetail, MealItem, NewEntry } from "../api/client";
import { getCachedPlan } from "../db/plan";
import { addLocalEntry, getEntry, upsertCheckin, type LocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import { itemTotals, mealTotals } from "../plan/compute";
import type { Habit } from "../db/habits";

export type Answer = "yes" | "not_quite";

/** Local calendar day, YYYY-MM-DD — the `date` half of the check-in id. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The stored check-in for a habit on a day, if answered. */
export const getCheckin = (habitId: string, dk: string): LocalEntry | null =>
  getEntry(`${habitId}:${dk}`);

const scheduledOn = (h: Habit, d: Date): boolean => h.enabled && !!h.days[d.getDay()];

/** Habits due today with no answer yet. */
export function pendingCheckins(habits: Habit[], today: Date): Habit[] {
  const dk = dateKey(today);
  return habits.filter((h) => scheduledOn(h, today) && !getCheckin(h.id, dk));
}

/** Habits due today already answered, with the answer. */
export function answeredCheckins(
  habits: Habit[],
  today: Date,
): { habit: Habit; answer: string; at: string }[] {
  const dk = dateKey(today);
  const out: { habit: Habit; answer: string; at: string }[] = [];
  for (const h of habits) {
    if (!scheduledOn(h, today)) continue;
    const c = getCheckin(h.id, dk);
    if (c) out.push({ habit: h, answer: (c.detail as { answer: string }).answer, at: c.occurredAt });
  }
  return out;
}

/** 14-day dot strip (oldest→today). "yes" = filled, "no" = answered-not, else empty. */
export type Dot = "yes" | "no" | "none";
export function habitDots(habit: Habit, today: Date): Dot[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    if (!habit.days[d.getDay()]) return "none";
    const c = getCheckin(habit.id, dateKey(d));
    if (!c) return "none";
    return (c.detail as { answer: string }).answer === "yes" ? "yes" : "no";
  });
}

/** Build a logged meal from a plan meal (used by a "yes" plan check-in). */
function planMealEntry(mealName: string): NewEntry | null {
  const plan = getCachedPlan();
  const meal = plan?.meals.find((m) => m.name === mealName);
  if (!meal) return null;
  const items: MealItem[] = meal.items.map((it) => {
    const tot = itemTotals(it);
    return {
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      kcal: tot.kcal,
      proteinG: tot.proteinG,
      carbsG: tot.carbsG,
      fatG: tot.fatG,
    };
  });
  const detail: MealDetail = { title: meal.name, items, totals: mealTotals(meal) };
  return {
    type: "meal",
    occurredAt: new Date().toISOString(),
    inputMethod: "checkin",
    sourcePhrase: undefined,
    isEstimate: true,
    detail,
  };
}

/**
 * Record an answer. Writes the `checkin` entry (durable via outbox) and, for a
 * plan check-in answered "yes", auto-logs the plan's meal. Returns whether a
 * plan meal was logged (so a plain "not_quite" caller can open capture instead).
 */
export function answerCheckin(habit: Habit, answer: Answer, now = new Date()): { loggedMeal: boolean } {
  // Stored answer is clean per kind: plain → "yes"/"no", plan → "yes"/"not_quite".
  const stored = answer === "yes" ? "yes" : habit.kind === "plan" ? "not_quite" : "no";
  upsertCheckin(habit.id, dateKey(now), {
    type: "checkin",
    occurredAt: now.toISOString(),
    inputMethod: "checkin",
    sourcePhrase: undefined,
    isEstimate: false,
    detail: { habitId: habit.id, habitName: habit.name, kind: habit.kind, answer: stored },
  });

  let loggedMeal = false;
  if (habit.kind === "plan" && answer === "yes" && habit.planMealName) {
    const meal = planMealEntry(habit.planMealName);
    if (meal) {
      addLocalEntry(meal);
      loggedMeal = true;
    }
  }

  logChanged();
  void drainOutbox(api)
    .then(({ synced }) => {
      if (synced > 0) logChanged();
    })
    .catch(() => {}); // fire-and-forget: a drain failure must not surface as an unhandled rejection
  return { loggedMeal };
}

// ── Check-in stack sheet: a tiny store so Home's banner and the Habits tab can
//    both open the same overlay (mounted once in the main layout). ────────────
let sheetOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openCheckins = (): void => {
  sheetOpen = true;
  emit();
};
export const closeCheckins = (): void => {
  sheetOpen = false;
  emit();
};

export function useCheckinSheetOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sheetOpen,
  );
}
