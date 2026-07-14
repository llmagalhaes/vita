/**
 * Vacation mode (APP-030, standing decision D1).
 *
 * The date RANGES persist server-side (`GET/PUT /me/vacations`, replace-on-write)
 * so a reinstalled device gets them back; the server stores them as an opaque
 * encrypted blob and never reads them (BE-025). Everything else — whether to keep
 * check-in reminders, the habits added just for the trip — is device-local.
 *
 * The local kv copy is the display/behaviour source (offline-first, same shape as
 * src/db/plan.ts): writes go to kv first (instant) then push to the server
 * fire-and-forget; `syncVacation` hydrates the ranges on mount and keeps them on
 * 404/offline. Starting/ending a trip flips the single accent token and reschedules
 * notifications through the one gate in the notifier.
 */
import { api } from "../api";
import type { VacationRange } from "../api/client";
import { dayKey } from "../trends/aggregate";
import { setVacationAccent } from "../ui/accent";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "./kv";
import { logChanged } from "./notify";

export type VacationConfig = {
  ranges: VacationRange[]; // YYYY-MM-DD; the only part that leaves the device
  keepCheckins: boolean; // keep check-in reminders during the trip (device-local)
  tripHabitIds: string[]; // habits created just for this trip (device-local)
};

const KEY = "vacation";
const empty: VacationConfig = { ranges: [], keepCheckins: false, tripHabitIds: [] };

export const getVacation = (): VacationConfig => kvGet<VacationConfig>(KEY) ?? empty;

/** A day (inclusive) inside any stored range → on vacation. */
export function isVacationActive(today: Date = new Date()): boolean {
  const key = dayKey(today);
  return getVacation().ranges.some((r) => key >= r.start.slice(0, 10) && key <= r.end.slice(0, 10));
}

/** Ranges for the trends vacation-day excluder (D1/slice-6 hook). */
export const vacationRanges = (): VacationRange[] => getVacation().ranges;

export const vacationKeepsCheckins = (): boolean => getVacation().keepCheckins;

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
