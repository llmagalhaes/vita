/**
 * Which scenic scene the Day header is painting right now (morning / afternoon /
 * evening). The prototype exposes `daytime` as a demo tweak; the real app reads the
 * clock — this module is the one place that answers "which scene".
 *
 * Scenic-only (CEO): the prototype's `homeStyle:"classic"` flat header is a demo
 * comparison, not a product mode, so there is no switch here.
 */
import { useEffect, useState } from "react";
import { scenes, type SceneName } from "./tokens";

/** 00:00–11:59 morning · 12:00–17:59 afternoon · 18:00+ evening. */
export function sceneFor(hour: number): SceneName {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** Scene boundaries in local hours — also the greeting boundaries. */
const BOUNDARIES = [12, 18, 24] as const;

/** ms until the scene changes (noon / 18:00 / midnight), so an open app rolls over. */
export function msUntilNextScene(now: Date): number {
  const h = BOUNDARIES.find((b) => b > now.getHours()) ?? 24;
  const next = new Date(now);
  next.setHours(h, 0, 0, 0); // setHours(24) rolls into tomorrow 00:00 — exactly what we want
  return next.getTime() - now.getTime();
}

/** The live scene: re-resolves when the clock crosses the next boundary. */
export function useSceneName(): SceneName {
  const [scene, setScene] = useState(() => sceneFor(new Date().getHours()));
  useEffect(() => {
    // +1s so the timer never fires a hair early and re-arms on the same scene.
    const id = setTimeout(() => setScene(sceneFor(new Date().getHours())), msUntilNextScene(new Date()) + 1000);
    return () => clearTimeout(id);
  }, [scene]);
  return scene;
}

/** Evening is the dark scene — panel tabs and the status bar flip to light ink. */
export const isDarkScene = (scene: SceneName): boolean => scenes[scene].dark;
