/**
 * The one native-notification seam (was `src/habits/notifier.ts`, APP-026 → APP-106).
 *
 * Two things are scheduled, and only two:
 *  1. **Per-habit daily reminders** — the Library's per-habit switch owns them, one
 *     weekly alarm per enabled weekday. They stay in v4.
 *  2. **The day-close notification** — exactly one per day at `recapStartHour`, built
 *     by `dayClose.ts`. It replaces v3's evening recap AND the per-meal check-in
 *     notifications (plan/digest habits no longer notify — APP-106).
 *
 * The `Notifier` interface isolates `expo-notifications` so Jest and the mock build
 * never touch it, and so the untrusted slice — interactive lock-screen actions —
 * degrades gracefully: if the OS drops the buttons, the tap still opens the app.
 *
 * Note: src/db/notify.ts is a log-change signal despite its name.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { listHabits, type Habit } from "../db/habits";
import { notificationsEnabled } from "../db/settings";
import { isVacationActive, vacationKeepsWater } from "../db/vacation";

/**
 * Expo Go (SDK 53+) removed expo-notifications' scheduling/permission APIs — calling
 * them THROWS ("use a development build"). In Expo Go we fall back to the no-op stub so
 * nothing crashes; real local notifications arrive with the dev build (APP-007).
 */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export type PermissionStatus = "granted" | "denied" | "undetermined";

/** One concrete daily alarm: a habit on one weekday at one time. */
export type PlannedNotification = {
  habitId: string;
  title: string;
  body: string;
  weekday: number; // 1 = Sunday … 7 = Saturday (expo-notifications convention)
  hour: number;
  minute: number;
};

/** Everything the day-close one-shot needs — strings resolved by the caller (i18n). */
export type PlannedDayClose = {
  title: string;
  body: string;
  at: Date;
  actions: { close: string; adjust: string };
};

/** What a tapped notification hands back. `actionId` is the OS default on a plain tap. */
export type NotificationResponse = { actionId: string; data: Record<string, unknown> };

export interface Notifier {
  getPermission(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  /** Cancel all and (re)schedule the per-habit reminders. */
  sync(habits: Habit[]): Promise<void>;
  /** Schedule (or cancel, with null) today's single day-close notification. */
  syncDayClose?(planned: PlannedDayClose | null): Promise<void>;
  /** Subscribe to notification taps / action buttons. Returns an unsubscribe. */
  onResponse?(cb: (r: NotificationResponse) => void): () => void;
}

/** Identifier for the one-shot day-close notification (so it can be replaced/cancelled). */
export const DAY_CLOSE_ID = "day-close";
/** Category carrying the two lock-screen buttons (best-effort — dev build only). */
export const DAY_CLOSE_CATEGORY = "vita-day-close";
export const DAY_CLOSE_ACTION = { close: "close-as-planned", adjust: "adjust" } as const;

/**
 * Pure: expand habits into concrete alarms. days index 0 = Sunday maps to expo
 * weekday 1; a bad/empty time is skipped rather than scheduled at 00:00.
 *
 * Every habit is the same kind now: the v3 per-meal check-in and digest habits are
 * gone with the notifications they existed for (APP-106 → the single day-close
 * notification), and the `kind` field with them (APP-108).
 */
export function plannedNotifications(habits: Habit[], body: (h: Habit) => string): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const h of habits) {
    if (!h.enabled) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(h.time.trim());
    if (!m) continue;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) continue;
    h.days.forEach((on, i) => {
      if (on) out.push({ habitId: h.id, title: "Vita", body: body(h), weekday: i + 1, hour, minute });
    });
  }
  return out;
}

const toStatus = (s: string): PermissionStatus =>
  s === "granted" ? "granted" : s === "denied" ? "denied" : "undetermined";

/** Real implementation — lazily requires expo-notifications so tests never load it. */
function createExpoNotifier(): Notifier {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const N = () => require("expo-notifications");

  return {
    async getPermission() {
      return toStatus((await N().getPermissionsAsync()).status);
    },
    async requestPermission() {
      return toStatus((await N().requestPermissionsAsync()).status);
    },
    async sync(habits) {
      const Notifications = N();
      const { habitBody } = require("./dayClose") as typeof import("./dayClose");
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const p of plannedNotifications(habits, habitBody)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: p.title, body: p.body, data: { habitId: p.habitId } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: p.weekday,
            hour: p.hour,
            minute: p.minute,
          },
        });
      }
    },
    async syncDayClose(planned) {
      const Notifications = N();
      // Cancel first, then reschedule — the body is recomputed from the day record each
      // time, so a repeating trigger would freeze stale content. A DATE trigger is a
      // one-shot for TODAY only, which is also what makes "exactly one per day" true.
      await Notifications.cancelScheduledNotificationAsync(DAY_CLOSE_ID).catch(() => {});
      if (!planned) return;
      try {
        await Notifications.setNotificationCategoryAsync(DAY_CLOSE_CATEGORY, [
          { identifier: DAY_CLOSE_ACTION.close, buttonTitle: planned.actions.close },
          { identifier: DAY_CLOSE_ACTION.adjust, buttonTitle: planned.actions.adjust },
        ]);
      } catch {
        // ponytail: categories unsupported here → the buttons just don't render and the
        // tap opens the Day. That degradation IS the acceptance criterion.
      }
      await Notifications.scheduleNotificationAsync({
        identifier: DAY_CLOSE_ID,
        content: {
          title: planned.title,
          body: planned.body,
          categoryIdentifier: DAY_CLOSE_CATEGORY,
          data: { dayClose: true },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: planned.at },
      });
    },
    onResponse(cb) {
      const sub = N().addNotificationResponseReceivedListener(
        (r: { actionIdentifier: string; notification: { request: { content: { data?: Record<string, unknown> } } } }) =>
          cb({ actionId: r.actionIdentifier, data: r.notification?.request?.content?.data ?? {} }),
      );
      return () => sub.remove();
    },
  };
}

let current: Notifier | null = null;

export function getNotifier(): Notifier {
  if (!current) current = isExpoGo() ? stubNotifier() : createExpoNotifier();
  return current;
}

/** Tests / APP-007 fallback inject a Notifier here. */
export function setNotifier(n: Notifier): void {
  current = n;
}

/**
 * Ask for permission only when it hasn't been decided — calm, once. Returns the
 * resulting status so the caller can stay quiet on "denied" (never nag).
 */
export async function ensureNotificationPermission(): Promise<PermissionStatus> {
  try {
    const n = getNotifier();
    const cur = await n.getPermission();
    return cur === "undetermined" ? n.requestPermission() : cur;
  } catch {
    // Native notifications unavailable (e.g. Expo Go removed them) — never crash the caller.
    return "denied";
  }
}

/**
 * Notifications pause when the master switch is off (APP-029) or for the whole of
 * a trip (APP-103 / CEO Q7: "everything else pauses") — one gate, both inputs.
 */
export function notificationsPaused(): boolean {
  return !notificationsEnabled() || isVacationActive();
}

/**
 * The water reminder is the one thing a "keep the water card" trip keeps live.
 * ponytail: the habit's name is the only water signal a Habit carries (plan setup
 * creates it from `planSetup.waterHabit`); give Habit a `kind: "water"` if this
 * ever needs to survive a rename or a second locale.
 */
const isWaterHabit = (h: Habit): boolean => /water|hydrat/i.test(h.name);

/** Habits that should be scheduled right now (APP-103). */
export function scheduledHabits(habits: Habit[] = listHabits()): Habit[] {
  if (!notificationsEnabled()) return [];
  if (!isVacationActive()) return habits;
  return vacationKeepsWater() ? habits.filter(isWaterHabit) : [];
}

/** Reschedule from the current habit set. Best-effort — never throws into the UI. */
export async function refreshNotifications(): Promise<void> {
  try {
    // Paused → cancel everything by syncing an empty set (keep-water keeps one).
    await getNotifier().sync(scheduledHabits());
    // sync() calls cancelAllScheduledNotificationsAsync(), which also wipes tonight's
    // day-close one-shot. Re-schedule it LAST so a habit change doesn't silently drop
    // it (ordering race). Lazy require breaks the notifier↔dayClose import cycle.
    const { syncDayClose } = require("./dayClose") as typeof import("./dayClose");
    await syncDayClose();
  } catch {
    // Expo Go may warn on Android; scheduling is non-critical to the in-app flow.
  }
}

/** A no-op recorder — the STT/OIDC-style stub for environments without the native module. */
export function stubNotifier(): Notifier & {
  calls: { sync: Habit[][]; dayClose: (PlannedDayClose | null)[] };
  fire: (r: NotificationResponse) => void;
} {
  const calls = { sync: [] as Habit[][], dayClose: [] as (PlannedDayClose | null)[] };
  const subs = new Set<(r: NotificationResponse) => void>();
  return {
    calls,
    fire: (r) => subs.forEach((cb) => cb(r)),
    async getPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async sync(habits) {
      calls.sync.push(habits);
    },
    async syncDayClose(planned) {
      calls.dayClose.push(planned);
    },
    onResponse(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
