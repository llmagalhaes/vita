/**
 * Local habit notifications (APP-026). Notifications stay 100% on-device (CEO:
 * no server push in v1). The `Notifier` interface isolates the native module so
 * Jest and the mock build never touch it, and so the ONE untrusted slice —
 * interactive lock-screen Yes/No actions — can degrade gracefully: scheduling
 * itself works in Expo Go SDK 56, but the action buttons need a dev build
 * (APP-007). If they don't render, the tap still opens the app to the in-app
 * check-in stack, which is the guaranteed working path.
 *
 * Note: src/db/notify.ts is a log-change signal despite its name — it does NOT
 * overlap with this file, so nothing there is folded in.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { listHabits, type Habit } from "../db/habits";
import { notificationsEnabled } from "../db/settings";
import { isVacationActive, vacationKeepsCheckins } from "../db/vacation";

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
  weekday: number; // 1 = Sunday … 7 = Saturday (expo-notifications convention)
  hour: number;
  minute: number;
};

export interface Notifier {
  getPermission(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  /** Cancel all and (re)schedule for the given habits. */
  sync(habits: Habit[]): Promise<void>;
}

/** Category id carrying the interactive Yes/No actions (best-effort, dev-build). */
export const CHECKIN_CATEGORY = "vita-checkin";

/**
 * Pure: expand habits into concrete alarms. days index 0 = Sunday maps to expo
 * weekday 1; a bad/empty time is skipped rather than scheduled at 00:00.
 */
export function plannedNotifications(habits: Habit[]): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const h of habits) {
    if (!h.enabled) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(h.time.trim());
    if (!m) continue;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) continue;
    h.days.forEach((on, i) => {
      if (on) out.push({ habitId: h.id, title: h.name, weekday: i + 1, hour, minute });
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
      // Best-effort interactive actions — render only in a dev build (APP-007).
      try {
        await Notifications.setNotificationCategoryAsync(CHECKIN_CATEGORY, [
          { identifier: "yes", buttonTitle: "Yes" },
          { identifier: "no", buttonTitle: "No" },
        ]);
      } catch {
        // ponytail: categories unsupported in Expo Go → skip; tap-to-open still works.
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const p of plannedNotifications(habits)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Vita",
            body: `${p.title} — a quick check-in`,
            categoryIdentifier: CHECKIN_CATEGORY,
            data: { habitId: p.habitId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: p.weekday,
            hour: p.hour,
            minute: p.minute,
          },
        });
      }
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
 * Notifications pause when the master switch is off (APP-029) or during a trip
 * whose check-ins the user didn't choose to keep (APP-030) — one gate, both inputs.
 */
export function notificationsPaused(): boolean {
  if (!notificationsEnabled()) return true;
  return isVacationActive() && !vacationKeepsCheckins();
}

/** Reschedule from the current habit set. Best-effort — never throws into the UI. */
export async function refreshNotifications(): Promise<void> {
  try {
    // Paused → cancel everything by syncing an empty set.
    await getNotifier().sync(notificationsPaused() ? [] : listHabits());
  } catch {
    // Expo Go may warn on Android; scheduling is non-critical to the in-app flow.
  }
}

/** A no-op recorder — the STT/OIDC-style stub for environments without the native module. */
export function stubNotifier(): Notifier & { calls: { sync: Habit[][] } } {
  const calls = { sync: [] as Habit[][] };
  return {
    calls,
    async getPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async sync(habits) {
      calls.sync.push(habits);
    },
  };
}
