/**
 * Vacation mode (APP-030 → APP-103, standing decision D1).
 *
 * The date RANGES persist server-side (`GET/PUT /me/vacations`, replace-on-write)
 * so a reinstalled device gets them back; the server stores them as an opaque
 * encrypted blob and never reads them (BE-025). Everything else — the duration
 * choice, whether the water card stays live — is device-local.
 *
 * v4 (CEO Q7 "make vacation semantics real"): the sheet no longer asks for two
 * dates, it asks for a DURATION. "This week" writes a 7-day range, so it expires
 * by itself — expiry is structural, there is no timer and nothing to sweep.
 * "Until I end it" writes an open-ended range that only `endVacation()` closes.
 * `keepWater` (was `keepCheckins`) is real behaviour now: the water card and its
 * reminder stay live while everything else pauses.
 *
 * The local kv copy is the display/behaviour source (offline-first, same shape as
 * src/db/plan.ts): writes go to kv first (instant) then push to the server
 * fire-and-forget; `syncVacation` hydrates the ranges on mount and keeps them on
 * 404/offline. Starting/ending a trip flips the single accent token and reschedules
 * notifications through the one gate in the notifier.
 */
import { api } from "../api";
import type { VacationRange } from "../api/client";
import { dayKey, vacationExcluder } from "../trends/aggregate";
import { setVacationAccent } from "../ui/accent";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "./kv";
import { logChanged } from "./notify";

/** Prototype's two chips. "thisWeek" = today + 6 days; "untilEnded" = open-ended. */
export type VacationDuration = "thisWeek" | "untilEnded";

export type VacationConfig = {
  ranges: VacationRange[]; // YYYY-MM-DD; the only part that leaves the device
  duration: VacationDuration; // which chip was picked (drives the row subtitle)
  keepWater: boolean; // keep the water card + its reminder live (device-local)
};

const KEY = "vacation";
const empty: VacationConfig = { ranges: [], duration: "thisWeek", keepWater: false };

/** "This week" = 7 days counting today. */
export const THIS_WEEK_DAYS = 7;
/** Open-ended end date — sorts after every real day, so only "End" closes the trip. */
export const OPEN_ENDED_END = "9999-12-31";

export const getVacation = (): VacationConfig => ({ ...empty, ...(kvGet<VacationConfig>(KEY) ?? {}) });

/** A day (inclusive) inside any stored range → on vacation. */
export function isVacationActive(today: Date = new Date()): boolean {
  return vacationExcluder(getVacation().ranges)(dayKey(today));
}

/** Ranges for the trends vacation-day excluder (D1/slice-6 hook). */
export const vacationRanges = (): VacationRange[] => getVacation().ranges;

/** True while a keep-water trip is running — the water card and its reminder stay. */
export const vacationKeepsWater = (): boolean => isVacationActive() && getVacation().keepWater;

function persist(cfg: VacationConfig): void {
  kvSet(KEY, cfg);
  setDirty(KEY);
  setVacationAccent(isVacationActive());
  logChanged();
  // Reschedule through the single notifier gate (lazy require breaks the cycle).
  void require("../habits/notifier").refreshNotifications();
  // Ranges are the only server-persisted part (D1) — replace-on-write.
  void pushVacations();
}

/** Push the current ranges; clears dirty on success (failure keeps it dirty). */
async function pushVacations(): Promise<void> {
  try {
    await api.putVacations(getVacation().ranges);
    clearDirty(KEY);
  } catch {
    /* offline — stays dirty, re-pushed on next sync */
  }
}

/** Save the whole config (dates + local prefs). */
export function saveVacation(cfg: VacationConfig): void {
  persist(cfg);
}

/**
 * Start a trip from the Library sheet: the duration IS the range, so "This week"
 * simply stops being active on day 8 — no expiry job, no stale flag to clear.
 */
export function startVacation(duration: VacationDuration, keepWater: boolean, today: Date = new Date()): void {
  const end = new Date(today);
  end.setDate(today.getDate() + THIS_WEEK_DAYS - 1);
  persist({
    ranges: [{ start: dayKey(today), end: duration === "thisWeek" ? dayKey(end) : OPEN_ENDED_END }],
    duration,
    keepWater,
  });
}

/** End the trip: drop the ranges (kv + server), keep no local prefs lingering. */
export function endVacation(): void {
  persist({ ...getVacation(), ranges: [] });
}

/**
 * Hydrate ranges from the server; keep local prefs and the cache on 404/offline.
 * A dirty local edit is re-pushed and kept, never overwritten by the server copy
 * (audit 1.4) — an offline start/end of a trip must survive the next online open.
 */
export async function syncVacation(): Promise<void> {
  // Reflect the local cache immediately (offline cold start with an active trip).
  setVacationAccent(isVacationActive());
  if (isDirty(KEY)) return void pushVacations();
  try {
    const ranges = await api.getVacations();
    const cur = getVacation();
    kvSet(KEY, { ...cur, ranges });
    setVacationAccent(isVacationActive());
  } catch {
    // offline / never set → keep the cached config
  }
}
