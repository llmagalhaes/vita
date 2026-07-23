/**
 * Evening-recap scheduling (APP-089). One local notification per day at 20:30,
 * body computed from the day's log via `recapLine` (shared with the Home card).
 * No server push (v1 rule): if the app never opened that day, nothing is
 * scheduled and the day passes in calm silence.
 *
 * `plannedRecap` is pure (entries + now + gates → body|null) so the schedule /
 * cancel matrix is unit-tested; `syncRecapFromLog` reads live state and drives
 * the notifier seam. Home re-runs it on every log change (it is always mounted),
 * so no separate subscriber registration in the layout is needed.
 */
import i18n from "../i18n";
import type { WaterDetail } from "../api";
import type { LocalEntry } from "../db/entries";
import { entriesForDay } from "../db/entries";
import { recapLine } from "../plan/setup";
import { recapEnabled } from "../db/settings";
import { getNotifier, notificationsPaused } from "./notifier";

export const RECAP_HOUR = 20;
export const RECAP_MINUTE = 30;

/** True once the clock reaches 20:30 — no point scheduling a past-time one-shot. */
export function afterRecapCutoff(now: Date): boolean {
  return now.getHours() > RECAP_HOUR || (now.getHours() === RECAP_HOUR && now.getMinutes() >= RECAP_MINUTE);
}

/**
 * The recap to schedule for today (or null to cancel). Gated by: recap setting on,
 * notifications not paused (master switch / vacation), before 20:30, and at least
 * one thing logged today.
 */
export function plannedRecap(
  entries: LocalEntry[],
  now: Date,
  gates: { enabled: boolean; paused: boolean },
): { body: string } | null {
  if (!gates.enabled || gates.paused) return null;
  if (afterRecapCutoff(now)) return null;
  const nMeals = entries.filter((e) => e.type === "meal").length;
  const nWorkouts = entries.filter((e) => e.type === "workout").length;
  const waterMl = entries
    .filter((e) => e.type === "water")
    .reduce((s, e) => s + (e.detail as WaterDetail).amountMl, 0);
  const line = recapLine(nMeals, nWorkouts, waterMl);
  if (!line) return null; // all-zero → nothing to recap
  return { body: `${line} ${i18n.t("home.recapFresh")}` };
}

/** Read today's log + live gates and (re)schedule or cancel the recap. Best-effort. */
export async function syncRecapFromLog(now: Date = new Date()): Promise<void> {
  const planned = plannedRecap(entriesForDay(now), now, {
    enabled: recapEnabled(),
    paused: notificationsPaused(),
  });
  try {
    await getNotifier().syncRecap?.(planned);
  } catch {
    // scheduling is non-critical to the in-app flow (Expo Go may warn)
  }
}
