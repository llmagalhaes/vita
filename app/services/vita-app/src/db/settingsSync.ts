/**
 * user_settings blob sync (APP-110; contract 0.8.0 `GET/PUT /me/settings`, BE-056).
 *
 * ONE opaque JSON object, replace-on-write, last-write-wins, recovery-only
 * (single device — CEO Round-14). It carries exactly what the phone knows and the
 * server cannot rebuild: habit definitions, the composition flags, the two
 * notification switches, the recap hour, the vacation prefs and the plan's source
 * badge. Everything else already has a home (the log, the plan/program docs, the
 * vacation ranges, the name) or has no business leaving the device.
 *
 * SILENT by design: no screen, no toast, no error state. A failed push just stays
 * dirty and rides the next change, mount or reconnect.
 *
 * **HYDRATE BEFORE PUSH** — the one real hazard: a fresh install's stores are empty,
 * so a PUT before the first GET would wipe the stored blob and defeat the feature.
 * Nothing is ever PUT until a GET has resolved (`hydrated`); an offline GET leaves
 * the module unhydrated on purpose, and it retries on the next mount/reconnect.
 * A local edit written while offline is `dirty` and WINS over the server copy —
 * the same discipline plan/vacation already use (audit 1.4).
 *
 * NEVER in the blob: UI hints, caches, the outbox, the day overlay, Health Connect
 * data, and the integrations toggle (Round-14 #7 — a toggle without the matching OS
 * grant is a lie) — nor the name, which is already `GET /me`.
 *
 * ponytail: no outbox op. The blob is not a queue of edits, it is one
 * replace-on-write document with a single writer — a debounced PUT off the existing
 * `logChanged` signal plus the existing dirty flag is the whole mechanism, and it
 * coalesces a burst of toggles into one request for free. If a second device ever
 * becomes real, split habits out as their own resource (they already carry ids).
 */
import { api } from "../api";
import { getDomains } from "./domains";
import { listHabits, restoreHabit, type Habit } from "./habits";
import { clearDirty, isDirty, setDirty } from "./kv";
import { logChanged, onChange } from "./notify";
import { adoptPlanMeta, getPlanMeta, type PlanMeta } from "./plan";
import { getSettings, saveSettings, type Domains } from "./settings";
import { adoptVacationPrefs, getVacation, type VacationConfig } from "./vacation";

/** The blob's shape. Every field optional — the server stores whatever it is sent. */
export type SyncedSettings = {
  domains?: Domains;
  notificationsEnabled?: boolean;
  notifRecap?: boolean;
  recapStartHour?: number;
  /** Vacation PREFS only; the ranges have their own resource (`/me/vacations`). */
  vacation?: Pick<VacationConfig, "keepWater" | "duration">;
  planMeta?: PlanMeta;
  habits?: Habit[];
};

/** kv dirty-flag key only — the blob is assembled on demand, never stored twice. */
const KEY = "settings.blob";
/** Long enough to coalesce a burst of toggles, short enough to survive a quick kill. */
const DEBOUNCE_MS = 1500;

let hydrated = false;
let changedBeforeHydrate = false;
let lastPushed: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let inflight: Promise<void> | null = null;

const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/**
 * Key-sorted JSON — the "did anything actually change?" comparison. Postgres jsonb
 * does not preserve key order, so a plain stringify of what the server hands back
 * would differ from ours and buy a pointless PUT on every single launch.
 */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val,
  );

/** Read the synced stores into one plain object. */
export function assembleBlob(): SyncedSettings {
  const s = getSettings();
  const v = getVacation();
  return defined({
    domains: getDomains(),
    notificationsEnabled: s?.notificationsEnabled,
    notifRecap: s?.notifRecap,
    recapStartHour: s?.recapStartHour,
    vacation: { keepWater: v.keepWater, duration: v.duration },
    planMeta: getPlanMeta() ?? undefined,
    habits: listHabits(),
  });
}

/** Write a restored blob back into the local stores. Additive: it deletes nothing. */
export function adoptBlob(b: SyncedSettings): void {
  saveSettings({
    name: "",
    ...getSettings(),
    ...defined({
      domains: b.domains,
      notificationsEnabled: b.notificationsEnabled,
      notifRecap: b.notifRecap,
      recapStartHour: b.recapStartHour,
    }),
  });
  // INSERT OR REPLACE keyed on the habit's own id — restores ids and createdAt verbatim
  // so restored check-in entries (`habitId:date`) still point at their habit.
  for (const h of b.habits ?? []) restoreHabit(h);
  if (b.vacation) adoptVacationPrefs(defined(b.vacation));
  if (b.planMeta) adoptPlanMeta(b.planMeta);
  logChanged();
  // Restored habits must get their reminders back (lazy require breaks the cycle).
  void require("../notify/notifier").refreshNotifications();
}

/**
 * Debounced full-blob PUT. No-op until the first GET resolved (the hazard) and when
 * the assembled blob is byte-identical to the last one the server accepted — which
 * is why this can hang off the app-wide change signal without spamming the network.
 */
export function scheduleSettingsPush(): void {
  if (!hydrated || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  const blob = assembleBlob();
  const json = stable(blob);
  if (json === lastPushed) return;
  setDirty(KEY); // an unpushed change must not be adopted over on the next launch
  try {
    await api.putSettings(blob as Record<string, unknown>);
    lastPushed = json;
    clearDirty(KEY);
  } catch {
    /* offline — stays dirty; retried on the next change, mount or reconnect */
  }
}

/**
 * Hydrate once per launch, then keep pushing. Call it on session load (before any
 * local write can push), on Home mount and on reconnect — it is idempotent.
 */
export function syncSettings(): Promise<void> {
  if (hydrated) {
    scheduleSettingsPush(); // already live → just re-check for unpushed changes
    return Promise.resolve();
  }
  // Session load and Home mount fire within a frame of each other — one GET, shared.
  return (inflight ??= hydrate().finally(() => {
    inflight = null;
  }));
}

async function hydrate(): Promise<void> {
  // Subscribe BEFORE the await: a habit created while the GET is in flight must not
  // be mistaken for untouched fresh-install state below.
  unsubscribe ??= onChange(() => {
    changedBeforeHydrate ||= !hydrated;
    scheduleSettingsPush();
  });
  let blob: SyncedSettings;
  try {
    blob = (await api.getSettings()) as SyncedSettings;
  } catch {
    return; // offline / not signed in → stay unhydrated so nothing can PUT over the blob
  }
  const stored = blob && Object.keys(blob).length > 0;
  const localEdit = changedBeforeHydrate; // read before adopting — adoption signals too
  // A dirty local edit (written offline) wins and is re-pushed — never overwritten
  // by the server copy (the plan/vacation discipline, audit 1.4).
  if (stored && !isDirty(KEY)) adoptBlob(blob);
  hydrated = true;
  // Seed the "has anything changed?" baseline with what the SERVER holds, so whatever
  // the device carries on top of it still pushes. Nothing stored and nothing touched
  // yet ⇒ the baseline is our own defaults: a fresh install owes the server no PUT.
  lastPushed = isDirty(KEY) || localEdit ? null : stable(stored ? blob : assembleBlob());
  scheduleSettingsPush();
}

/**
 * Drop the launch state. Called on sign-out: `hydrated` and the baseline belong to
 * the account that was signed in, and re-using them for the next one would PUT its
 * blob over a different account's — the hazard again, one door further along.
 */
export function resetSettingsSync(): void {
  hydrated = false;
  changedBeforeHydrate = false;
  inflight = null;
  lastPushed = null;
  if (timer) clearTimeout(timer);
  timer = null;
  unsubscribe?.();
  unsubscribe = null;
}
