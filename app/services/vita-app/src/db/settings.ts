import { api } from "../api";
import { kvGet, kvSet } from "./kv";
import { logChanged } from "./notify";

/** Local user settings collected in onboarding (kv-backed; PATCH /me mirrors name). */
export type Settings = {
  name: string;
  keepTrack: { meals: boolean; water: boolean; workouts: boolean; habits: boolean; cycle: boolean };
  // Plan/program now live in src/db/plan.ts (persisted server-side, cached in kv).
  /** Master check-in reminder switch (drives the Notifier; default on). Added APP-029. */
  notificationsEnabled?: boolean;
  /** Integrations toggles — device-local prefs only; no real sync yet (APP-029). */
  integrations?: Record<string, boolean>;
};

export const getSettings = (): Settings | null => kvGet<Settings>("settings");
export const saveSettings = (s: Settings): void => kvSet("settings", s);

export const isOnboarded = (): boolean => kvGet<boolean>("onboarded") === true;
export const setOnboarded = (): void => kvSet("onboarded", true);

/** Merge a partial into settings, persist, and signal a re-read. */
function patch(p: Partial<Settings>): void {
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

export const integrationEnabled = (id: string): boolean => getSettings()?.integrations?.[id] === true;
export function setIntegrationEnabled(id: string, on: boolean): void {
  patch({ integrations: { ...(getSettings()?.integrations ?? {}), [id]: on } });
}
