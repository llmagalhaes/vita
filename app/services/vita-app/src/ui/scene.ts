/**
 * Which scenic scene the Day header is painting right now (morning / afternoon /
 * evening). The prototype exposes `daytime` as a demo tweak; the real app reads
 * the clock.
 *
 * ponytail: stub for APP-096 — the panel tabs and the status-bar ink need the
 * dark-scene flag before the scenic header exists. APP-097 owns the header and may
 * refine the boundaries (and the classic/scenic switch); keep this the one place
 * that answers "which scene".
 */
import { scenes, type SceneName } from "./tokens";

/** 00:00–11:59 morning · 12:00–17:59 afternoon · 18:00+ evening. */
export function sceneFor(hour: number): SceneName {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export function useSceneName(): SceneName {
  return sceneFor(new Date().getHours());
}

/** Evening is the dark scene — panel tabs and the status bar flip to light ink. */
export const isDarkScene = (scene: SceneName): boolean => scenes[scene].dark;
