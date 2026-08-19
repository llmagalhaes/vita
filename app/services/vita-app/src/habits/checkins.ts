/**
 * Habit check-ins (APP-025). A check-in is a single yes/no answer to a habit on
 * a given day — no streaks, no scores. Local SQLite is the display source for the
 * dots; answers also persist server-side as `checkin` entries via the outbox
 * (BE-024, Idempotency-Key `habitId:date`), so durability doesn't depend on the
 * device.
 *
 * APP-108: v4 has one kind of habit and one place to answer it — the Day overview's
 * ✓/— row. The v3 check-in deck and the "plan" habit that auto-logged a meal are gone.
 */
import { api } from "../api";
import { getEntry, upsertCheckin, type LocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import type { Habit } from "../db/habits";

export type Answer = "yes" | "not_quite";

/**
 * `CheckinDetail.kind` is required by the contract and server-opaque; the app has
 * only one habit kind left, so it is a constant on the wire.
 */
const CHECKIN_KIND = "plain";

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

/**
 * Record an answer. Writes the `checkin` entry (durable via outbox) — that is the
 * whole action: no auto-logged meal, no follow-up sheet. The Day overview row owns
 * the undo (it deletes `habitId:date`).
 */
export function answerCheckin(habit: Habit, answer: Answer, now = new Date()): void {
  upsertCheckin(habit.id, dateKey(now), {
    type: "checkin",
    occurredAt: now.toISOString(),
    inputMethod: "checkin",
    sourcePhrase: undefined,
    isEstimate: false,
    detail: { habitId: habit.id, habitName: habit.name, kind: CHECKIN_KIND, answer: answer === "yes" ? "yes" : "no" },
  });

  logChanged();
  void drainOutbox(api)
    .then(({ synced }) => {
      if (synced > 0) logChanged();
    })
    .catch(() => {}); // fire-and-forget: a drain failure must not surface as an unhandled rejection
}
