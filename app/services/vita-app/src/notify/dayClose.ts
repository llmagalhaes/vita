/**
 * APP-106 — the day-close notification (README §4 screen 6; prototype lines 97–119).
 *
 * ONE local notification per day, at `recapStartHour` (default 20:00 — the same hour
 * the timeline's Close-the-day card appears, so the lock screen and the app never
 * disagree). It replaces v3's evening recap AND the per-meal check-in notifications.
 *
 * It never claims anything: the body names exactly which meals are still marked
 * planned, and the footer says what happens if you walk away. Ignoring it leaves the
 * day **unrecorded** — that is the designed outcome, not a bug.
 *
 * `plannedDayClose` is pure (day + plan + now + gates → content | null) so the whole
 * schedule/cancel matrix is unit-tested; `syncDayClose` reads live state and drives
 * the notifier seam. No server push (v1 rule): if the app never opened that day,
 * nothing is scheduled and the day passes in calm silence.
 */
import i18n from "../i18n";
import type { Habit } from "../db/habits";
import { getDayRecord, isDayClosed, setDayClosed } from "../db/dayRecord";
import { getCachedPlan } from "../db/plan";
import { onChange } from "../db/notify";
import { recapEnabled, recapStartHour } from "../db/settings";
import { closeDay } from "../day/close";
import { dayKey, dayMeals, type DayMeal, type DayRecord } from "../day/record";
import { pendingMeals } from "../day/state";
import {
  DAY_CLOSE_ACTION,
  ensureNotificationPermission,
  getNotifier,
  notificationsPaused,
  type NotificationResponse,
  type PlannedDayClose,
} from "./notifier";

/** Per-habit reminder body — the only habit copy the notifier still needs. */
export const habitBody = (h: Habit): string => i18n.t("notify.habit", { name: h.name });

/** The two buttons on a habit reminder (APP-136). Same words as the in-app row. */
export const habitActions = (): { yes: string; no: string } => ({
  yes: i18n.t("notify.habitYes"),
  no: i18n.t("notify.habitNo"),
});

/**
 * The notification to schedule for today, or null to cancel. Gated by: the recap
 * setting, notifications not paused (master switch / vacation), the day not already
 * closed, the plan actually having meals, and the close hour still ahead of us — a
 * one-shot DATE trigger in the past would fire immediately or not at all.
 *
 * The pending list is computed **at the close hour**, not at "now": that is when the
 * user reads it, and it is exactly the set `closeDay` would record.
 */
export function plannedDayClose(args: {
  day: DayRecord;
  meals: DayMeal[];
  now: Date;
  hour: number;
  gates: { enabled: boolean; paused: boolean; closed: boolean };
}): PlannedDayClose | null {
  const { day, meals, now, hour, gates } = args;
  if (!gates.enabled || gates.paused || gates.closed) return null;
  if (meals.length === 0) return null; // nothing to close — never nag an empty plan
  if (now.getHours() >= hour) return null;

  const pending = pendingMeals(day, meals, hour * 60);
  const t = (k: string, v?: Record<string, unknown>) => i18n.t(`notify.dayClose.${k}`, v ?? {});
  const head = pending.length
    ? t("pending", { names: pending.map((m) => m.name).join(t("and")) })
    : t("allConfirmed");

  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  return {
    title: t("title"),
    body: `${head} ${t("tail")}\n${t("footer")}`,
    at,
    date: dayKey(now),
    actions: { close: t("close"), adjust: t("adjust") },
  };
}

/** Read live state and (re)schedule or cancel today's day-close notification. */
export async function syncDayClose(now: Date = new Date()): Promise<void> {
  const date = dayKey(now);
  const planned = plannedDayClose({
    day: getDayRecord(date),
    meals: dayMeals(getCachedPlan()?.meals ?? []),
    now,
    hour: recapStartHour(),
    gates: { enabled: recapEnabled(), paused: notificationsPaused(), closed: isDayClosed(date) },
  });
  try {
    // Boot path reaches here WITHOUT refreshNotifications (startDayClose calls this
    // directly), and Android 13+ posts nothing un-asked — ensure at the moment there
    // is actually a notification to deliver. No-op once decided.
    if (planned) await ensureNotificationPermission();
    await getNotifier().syncDayClose?.(planned);
  } catch {
    // scheduling is non-critical to the in-app flow (Expo Go may warn)
  }
}

/**
 * What a tapped notification does. "Close as planned" records every DUE meal exactly
 * as `closeDay` would from the timeline card and marks the day closed; "I'll adjust"
 * — and a plain tap, which is what an OS that dropped the buttons gives us — records
 * NOTHING and just opens the Day.
 *
 * `date` comes from the notification's own payload. It is load-bearing: a local
 * notification sits on the lock screen until dismissed, so "Close as planned" tapped
 * at 07:30 the next morning used to close TODAY — recording breakfast, a meal the user
 * had not confirmed happened, while yesterday stayed unrecorded. A past day is over,
 * so every meal on it is due (retro-close, R10a).
 */
export function applyDayCloseAction(actionId: string, date: string = dayKey(), now: Date = new Date()): void {
  if (actionId === DAY_CLOSE_ACTION.close) {
    // Lazy require: applyClose pulls the api/outbox chain; this file must stay loadable
    // from the notification handler without dragging React in.
    const { applyClose } = require("../db/dayRecord") as typeof import("../db/dayRecord");
    const nowMin = date === dayKey(now) ? now.getHours() * 60 + now.getMinutes() : 24 * 60;
    applyClose(closeDay(getDayRecord(date), getCachedPlan()?.meals ?? [], nowMin));
    setDayClosed(date, true);
  }
  const { setSelectedDate } = require("../day/selection") as typeof import("../day/selection");
  const { router } = require("expo-router") as typeof import("expo-router");
  setSelectedDate(date);
  router.replace("/day");
}

/**
 * The app's ONE notification-response handler: day-close, or a habit check-in answered
 * from the shade (APP-136). A plain tap on a habit reminder falls through to nothing —
 * the app is already opening, and Vita never answers on the user's behalf.
 */
function handleResponse(r: NotificationResponse): void {
  if (r.data?.dayClose) {
    applyDayCloseAction(r.actionId, typeof r.data.date === "string" ? r.data.date : undefined);
    return;
  }
  const habitId = typeof r.data?.habitId === "string" ? r.data.habitId : null;
  if (!habitId) return;
  const { applyCheckinAction } = require("../habits/checkins") as typeof import("../habits/checkins");
  if (!applyCheckinAction(r.actionId, habitId, r.firedAt)) return;
  // No congratulation, no navigation, no toast — it just goes away (product philosophy).
  // Android does not cancel a notification when an action button is pressed, so we do.
  if (r.id) void getNotifier().dismiss?.(r.id);
}

/**
 * Mount-time wiring (called once from the main layout, like `startReconnectDrain`):
 * schedule now, reschedule on every log change so the body never goes stale, and
 * handle taps. Returns an unsubscribe.
 */
export function startDayClose(): () => void {
  void syncDayClose();
  const offLog = onChange(() => {
    void syncDayClose();
  });
  // Cold start: a Yes/No pressed while the app was dead is queued by the OS with no JS
  // listener to hear it. Drain it here, synchronously, BEFORE the Day's habit card reads
  // the db — an answered check-in must never come back as a pending one.
  const queued = getNotifier().lastResponse?.();
  if (queued) handleResponse(queued);
  const offResp = getNotifier().onResponse?.(handleResponse) ?? (() => {});
  return () => {
    offLog();
    offResp();
  };
}
