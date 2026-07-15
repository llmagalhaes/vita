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
import { Platform } from "react-native";
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

export interface HealthReader {
  /** Is Health Connect installed and usable on this device right now? */
  isAvailable(): Promise<boolean>;
  /** Ask (once) for the read permissions; true if any were granted. */
  requestPermissions(): Promise<boolean>;
  /** Read today's active energy / steps / sessions, or null if unavailable. */
  readToday(today?: Date): Promise<HealthSnapshot | null>;
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
    async isAvailable() {
      return false;
    },
    async requestPermissions() {
      return false;
    },
    async readToday() {
      return null;
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
    async isAvailable() {
      // 3 == SdkAvailabilityStatus.SDK_AVAILABLE (installed & usable).
      const status = await HC().getSdkStatus();
      return status === (HC().SdkAvailabilityStatus?.SDK_AVAILABLE ?? 3);
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
    if (!(await r.isAvailable())) return;
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
 * Connect flow from the Integrations toggle: request permission, then read.
 * Returns whether permission was granted so the screen can stay honest.
 */
export async function connectHealthConnect(): Promise<boolean> {
  try {
    const r = getHealthReader();
    if (!(await r.isAvailable())) return false;
    const ok = await r.requestPermissions();
    if (ok) await refreshHealthConnect();
    return ok;
  } catch {
    return false;
  }
}
