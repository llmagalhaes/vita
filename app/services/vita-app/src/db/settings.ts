import { api } from "../api";
import { kvGet, kvSet } from "./kv";
import { logChanged } from "./notify";

/**
 * Composition flags — "what Vita keeps" (APP-095, prototype `domRows`/`dom`).
 * One plain serializable object so APP-110 can sync it as a `user_settings` blob
 * without reshaping anything here. Read it through `src/db/domains.ts` (per-key
 * default ON); pre-v4 `keepTrack` (incl. `cycle`, the removed Flo row) has no
 * `domains` field, so old profiles simply fall back to all-on — same safe-ignore
 * pattern APP-071 used for the dropped `units` pref.
 */
export type Domains = { meals: boolean; water: boolean; move: boolean; habits: boolean; weight: boolean };

/** Local user settings collected in onboarding (kv-backed; PATCH /me mirrors name). */
export type Settings = {
  name: string;
  domains?: Domains;
  // Plan/program now live in src/db/plan.ts (persisted server-side, cached in kv).
  /** Master check-in reminder switch (drives the Notifier; default on). Added APP-029. */
  notificationsEnabled?: boolean;
  /** Evening-recap notification switch (default on). Added APP-089. */
  notifRecap?: boolean;
  /** Hour (0–23) the Home evening-recap card starts appearing. Default 20. Added APP-090. */
  recapStartHour?: number;
  /** Integrations toggles — device-local prefs only; no real sync yet (APP-029). */
  integrations?: Record<string, boolean>;
};

export const getSettings = (): Settings | null => kvGet<Settings>("settings");
export const saveSettings = (s: Settings): void => kvSet("settings", s);

export const isOnboarded = (): boolean => kvGet<boolean>("onboarded") === true;
export const setOnboarded = (): void => kvSet("onboarded", true);

/** Merge a partial into settings, persist, and signal a re-read. */
export function patch(p: Partial<Settings>): void {
  const cur = getSettings();
  if (!cur) return;
  saveSettings({ ...cur, ...p });
  logChanged();
}

/** Name applies everywhere locally and mirrors to the server (PATCH /me). */
export function setName(name: string): void {
  patch({ name });
  void api.patchMe({ name }).catch(() => {});
}

/** Notifications default ON when the field is absent (pre-APP-029 profiles). */
export const notificationsEnabled = (): boolean => getSettings()?.notificationsEnabled !== false;
export const setNotificationsEnabled = (on: boolean): void => patch({ notificationsEnabled: on });

/** Evening recap default ON when absent (APP-089). */
export const recapEnabled = (): boolean => getSettings()?.notifRecap !== false;
export const setRecapEnabled = (on: boolean): void => patch({ notifRecap: on });

/** Hour the recap card starts showing; default 20:00 when unset (APP-090). */
export const recapStartHour = (): number => getSettings()?.recapStartHour ?? 20;
export const setRecapStartHour = (h: number): void => patch({ recapStartHour: h });

export const integrationEnabled = (id: string): boolean => getSettings()?.integrations?.[id] === true;
export function setIntegrationEnabled(id: string, on: boolean): void {
  patch({ integrations: { ...(getSettings()?.integrations ?? {}), [id]: on } });
}
