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
import { InteractionManager } from "react-native";
import { api } from "../api";
import { getEntry, upsertCheckin, type LocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import { getHabit, type Habit } from "../db/habits";
import { HABIT_ACTION } from "../notify/notifier";

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
 *
 * R18-E — the write stays synchronous (every reader, and `applyCheckinAction`'s
 * double-apply guard, must see the answer the instant it is given), but the two
 * things AFTER it wait for the frame: `logChanged()` fans out to every pre-mounted
 * panel (Day re-reads the rebuilt day record + the whole plan doc, Trends recomputes
 * its ranges, Library re-reads its sections) and to `syncDayClose()`, and the drain's
 * own prologue reads the outbox before its first await. None of that is visible, and
 * all of it used to run before the pressed row could paint — the CEO's "slow button".
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

  InteractionManager.runAfterInteractions(() => {
    logChanged();
    void drainOutbox(api)
      .then(({ synced }) => {
        if (synced > 0) logChanged();
      })
      .catch(() => {}); // fire-and-forget: a drain failure must not surface as an unhandled rejection
  });
}

/**
 * APP-136 — an answer pressed on the notification itself. Same chokepoint as the Day
 * card (`answerCheckin` → entry → outbox); this only maps the action id and decides
 * WHICH day the answer belongs to.
 *
 * `firedAt` is when the OS delivered the reminder, not when the button was pressed:
 * a habit notification sits on the shade until answered, so "Done" tapped at 07:00 the
 * next morning must land on the day it was asked about (same rule as the day-close one).
 *
 * Returns whether an answer was written — false is the guard, and it does double duty:
 * an unknown action (a plain tap), a deleted habit, and **already answered**. That last
 * one is what makes this safe to call twice, which it will be: Android hands the same
 * response to the live listener AND to `getLastNotificationResponse()` on a cold start,
 * and the user may have answered in-app in between (the in-app answer wins).
 */
export function applyCheckinAction(actionId: string, habitId: string, firedAt?: number): boolean {
  const answer: Answer | null =
    actionId === HABIT_ACTION.yes ? "yes" : actionId === HABIT_ACTION.no ? "not_quite" : null;
  if (!answer) return false;

  const when = firedAt ? new Date(firedAt) : new Date();
  const habit = getHabit(habitId);
  if (!habit) return false;
  if (getCheckin(habitId, dateKey(when))) return false;

  answerCheckin(habit, answer, when);
  return true;
}
