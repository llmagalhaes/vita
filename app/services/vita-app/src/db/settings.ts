import type { Units } from "../api/client";
import { kvGet, kvSet } from "./kv";

/** Local user settings collected in onboarding (kv-backed; PATCH /me mirrors name+units). */
export type Settings = {
  name: string;
  units: Units;
  keepTrack: { meals: boolean; water: boolean; workouts: boolean; habits: boolean; cycle: boolean };
  plan: string | null; // the user's own words, confirmed
  program: string | null;
  connected: { appleHealth: boolean; healthConnect: boolean };
};

export const getSettings = (): Settings | null => kvGet<Settings>("settings");
export const saveSettings = (s: Settings): void => kvSet("settings", s);

export const isOnboarded = (): boolean => kvGet<boolean>("onboarded") === true;
export const setOnboarded = (): void => kvSet("onboarded", true);
