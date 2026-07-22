/**
 * Health Connect read integration (APP-038). Samsung Health syncs its data into
 * Android Health Connect, and Google Fit's own APIs are deprecated in favour of
 * Health Connect (ADR-0004) — so this ONE Android integration covers Samsung +
 * Google fitness data. There is no separate Google Fit client.
 *
 * Same stub seam as voice (ADR-0003), OIDC and the notifier: the real reader
 * lazy-requires `react-native-health-connect` (a native module + config plugin
 * that CANNOT run in Expo Go); everywhere else — Expo Go, iOS, jest — an honest
 * stub reports "not available" and reads nothing. No fabricated data (philosophy).
 *
 * Scope is read-only: daily active energy, steps, exercise-session count. Data is
 * device-local (kv snapshot, NO outbox) — the committed contract sets EntrySource
 * server-side and health ingestion is a separate, not-yet-live contract, so HC
 * data never syncs to the backend. It feeds the Energy card "spent" as a labeled
 * estimate. Read happens on app open / connect — no background sync (CEO can ask).
 */
import { Linking, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { dayKey } from "../trends/aggregate";
import { integrationEnabled } from "../db/settings";
import { kvGet, kvSet } from "../db/kv";
import { logChanged } from "../db/notify";

/** Today's Health Connect totals, cached locally. Stale (date != today) → ignored. */
export type HealthSnapshot = {
  date: string; // YYYY-MM-DD the totals are for
  activeKcal: number; // Σ ActiveCaloriesBurned.energy.inKilocalories, rounded
  steps: number; // Σ Steps.count
  sessions: number; // ExerciseSession record count
  readAt: string; // ISO read time
};

/**
 * Health Connect presence on this device (APP-070). The CEO's recent Samsung
 * reported a false "not available": on Android 14+ / recent One UI, Health Connect
 * is a platform module reached via Settings, not the standalone Play Store app —
 * `getSdkStatus()` can return SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED (2) rather
 * than SDK_AVAILABLE (3), and the old check collapsed everything non-3 to "no".
 *  - "available"        (3) → provider present & usable → run the permission flow.
 *  - "update_required"  (2) → provider present but needs a setup/update → guidance
 *                              + open its store page (also the plain "needs setup").
 *  - "not_installed"    (1) → genuinely absent (old Android) → install deep-link.
 * A present-but-sync-off Samsung shows as "available" + granted + empty data (the
 * Energy card's "no data yet" is that state), because getSdkStatus can't see sync.
 */
export type HealthAvailability = "available" | "update_required" | "not_installed";

/** Result of the Integrations connect flow — drives the honest toast/deep-link. */
export type ConnectResult =
  | { ok: true; hasData: boolean }
  | { ok: false; reason: "denied" | "update_required" | "not_installed" | "error" };

/** One Health Connect ExerciseSession, mapped for the workout history list (APP-081). */
export type HcSession = {
  id: string;
  start: string; // ISO
  end: string; // ISO
  title: string | null;
  exerciseType: number | null;
};

export interface HealthReader {
  /** Provider presence right now (SDK_AVAILABLE / update-required / absent). */
  availability(): Promise<HealthAvailability>;
  /** Ask (once) for the read permissions; true if any were granted. */
  requestPermissions(): Promise<boolean>;
  /** Read today's active energy / steps / sessions, or null if unavailable. */
  readToday(today?: Date): Promise<HealthSnapshot | null>;
  /** Exercise sessions in a range, for the workout history list. Stub → []. */
  readSessions(start: Date, end: Date): Promise<HcSession[]>;
}

/**
 * Map react-native-health-connect's numeric SdkAvailabilityStatus to our states.
 * 3 = SDK_AVAILABLE, 2 = SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED, else unavailable.
 */
export function mapSdkStatus(status: number): HealthAvailability {
  if (status === 3) return "available";
  if (status === 2) return "update_required";
  return "not_installed";
}

// ---- pure mapping (unit-tested with plain objects; no native module) ----------

/** Fold raw HC record arrays into one day's snapshot. Missing fields count as 0. */
export function mapHealthToday(
  date: string,
  active: Array<{ energy?: { inKilocalories?: number } }>,
  steps: Array<{ count?: number }>,
  sessions: Array<unknown>,
  readAt: string = new Date().toISOString(),
): HealthSnapshot {
  return {
    date,
    activeKcal: Math.round(active.reduce((s, r) => s + (r.energy?.inKilocalories ?? 0), 0)),
    steps: steps.reduce((s, r) => s + (r.count ?? 0), 0),
    sessions: sessions.length,
    readAt,
  };
}

/** Local calendar-day bounds as ISO strings for a Health Connect time-range filter. */
export function dayBounds(day: Date): { start: string; end: string } {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ---- readers ------------------------------------------------------------------

/** Honest absence: Expo Go, iOS, jest, or any device without the native module. */
export function stubHealthReader(): HealthReader {
  return {
    async availability() {
      return "not_installed";
    },
    async requestPermissions() {
      return false;
    },
    async readToday() {
      return null;
    },
    async readSessions() {
      return []; // honest absence (Expo Go / iOS / jest) — captured workouts only (A8)
    },
  };
}

/** Real reader — lazily requires the native lib so tests/Expo Go never load it. */
function createHealthConnectReader(): HealthReader {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const HC = () => require("react-native-health-connect");
  const READ = [
    { accessType: "read", recordType: "ActiveCaloriesBurned" },
    { accessType: "read", recordType: "Steps" },
    { accessType: "read", recordType: "ExerciseSession" },
  ];

  return {
    async availability() {
      // Default provider package (com.google.android.apps.healthdata) is correct
      // on Android 14+ too — the platform ships HC under that same package — so we
      // read getSdkStatus() and honestly map 3/2/other instead of forcing a boolean.
      const status = await HC().getSdkStatus();
      return mapSdkStatus(status);
    },
    async requestPermissions() {
      await HC().initialize();
      const granted = await HC().requestPermission(READ);
      return Array.isArray(granted) && granted.length > 0;
    },
    async readToday(today = new Date()) {
      await HC().initialize();
      const { start, end } = dayBounds(today);
      const filter = { timeRangeFilter: { operator: "between", startTime: start, endTime: end } };
      const [active, steps, sessions] = await Promise.all([
        HC().readRecords("ActiveCaloriesBurned", filter),
        HC().readRecords("Steps", filter),
        HC().readRecords("ExerciseSession", filter),
      ]);
      return mapHealthToday(dayKey(today), active.records ?? [], steps.records ?? [], sessions.records ?? []);
    },
    async readSessions(start, end) {
      await HC().initialize();
      const filter = { timeRangeFilter: { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() } };
      const res = await HC().readRecords("ExerciseSession", filter);
      return (res.records ?? []).map(
        (r: { metadata?: { id?: string }; startTime: string; endTime: string; title?: string; exerciseType?: number }): HcSession => ({
          id: r.metadata?.id ?? `${r.startTime}-${r.exerciseType ?? "x"}`,
          start: r.startTime,
          end: r.endTime,
          title: r.title ?? null,
          exerciseType: r.exerciseType ?? null,
        }),
      );
    },
  };
}

/** Real reader only on an Android dev build; everywhere else the honest stub. */
function isHealthConnectSupported(): boolean {
  return Platform.OS === "android" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

let reader: HealthReader | null = null;
export function getHealthReader(): HealthReader {
  if (!reader) reader = isHealthConnectSupported() ? createHealthConnectReader() : stubHealthReader();
  return reader;
}
/** Tests / APP-007 dev-build verification inject a reader here. */
export function setHealthReader(r: HealthReader): void {
  reader = r;
}

// ---- local snapshot store (kv; NEVER the outbox — HC data stays on device) -----

const SNAP_KEY = "health.snapshot";
export const getHealthSnapshot = (): HealthSnapshot | null => kvGet<HealthSnapshot>(SNAP_KEY);
export const clearHealthSnapshot = (): void => kvSet(SNAP_KEY, null);

/** Active kcal from Health Connect for *today* only — a stale snapshot contributes 0. */
export function healthActiveKcalToday(today: Date = new Date()): number {
  const s = getHealthSnapshot();
  return s && s.date === dayKey(today) ? s.activeKcal : 0;
}

/** Today's snapshot if it's current, else null (drives the "N steps · from HC" readout). */
export function todaysHealthSnapshot(today: Date = new Date()): HealthSnapshot | null {
  const s = getHealthSnapshot();
  return s && s.date === dayKey(today) ? s : null;
}

/**
 * Read + cache today's Health Connect totals when the source is connected.
 * Best-effort: any failure (module absent, permission missing, HC not installed)
 * is a silent no-op — Vita simply shows no synced data.
 */
export async function refreshHealthConnect(today: Date = new Date()): Promise<void> {
  if (!integrationEnabled("healthConnect")) return;
  try {
    const r = getHealthReader();
    if ((await r.availability()) !== "available") return;
    const snap = await r.readToday(today);
    if (snap) {
      kvSet(SNAP_KEY, snap);
      logChanged();
    }
  } catch {
    // unavailable / not granted / no native module — honest no-op.
  }
}

/**
 * Connect flow from the Integrations toggle: check presence, request permission,
 * then read. Returns a discriminated result so the screen can stay honest — the
 * provider may be absent, need setup/update, deny permission, or connect with no
 * synced data yet (Samsung Health sync off).
 */
export async function connectHealthConnect(): Promise<ConnectResult> {
  try {
    const r = getHealthReader();
    const avail = await r.availability();
    if (avail !== "available") return { ok: false, reason: avail };
    const granted = await r.requestPermissions();
    if (!granted) return { ok: false, reason: "denied" };
    await refreshHealthConnect();
    return { ok: true, hasData: !!todaysHealthSnapshot() };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Open Health Connect's store page to install/update it (the remedy for
 * "not_installed" and "update_required"). market:// deep-link with an https
 * fallback for devices without the Play Store client.
 */
export function openHealthConnectStore(): void {
  const id = "com.google.android.apps.healthdata";
  void Linking.openURL(`market://details?id=${id}`).catch(() =>
    Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`),
  );
}
