/**
 * Which scenic scene the Day header is painting right now (morning / afternoon /
 * evening). The prototype exposes `daytime` as a demo tweak; the real app reads the
 * clock — this module is the one place that answers "which scene".
 *
 * Scenic-only (CEO): the prototype's `homeStyle:"classic"` flat header is a demo
 * comparison, not a product mode, so there is no switch here.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { kvGet, kvSet } from "../db/kv";
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

// ── TEST-ONLY scene override (CEO batch #1) ─────────────────────────────────
// ponytail: dev affordance, not a product feature — the evening scene only exists
// after 18:00, which makes the dark header impossible to review at 11am. To remove:
// delete this block, the `override ??` in useSceneName, and the Library's dev row.
export type SceneOverride = SceneName | "auto";
const OVERRIDE_KEY = "dev.scene";
let cached: SceneOverride | null = null;
const listeners = new Set<() => void>();

export const getSceneOverride = (): SceneOverride => (cached ??= kvGet<SceneOverride>(OVERRIDE_KEY) ?? "auto");

export function setSceneOverride(v: SceneOverride): void {
  cached = v;
  kvSet(OVERRIDE_KEY, v);
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** The live scene: re-resolves when the clock crosses the next boundary. */
export function useSceneName(): SceneName {
  const [scene, setScene] = useState(() => sceneFor(new Date().getHours()));
  useEffect(() => {
    // +1s so the timer never fires a hair early and re-arms on the same scene.
    const id = setTimeout(() => setScene(sceneFor(new Date().getHours())), msUntilNextScene(new Date()) + 1000);
    return () => clearTimeout(id);
  }, [scene]);
  const override = useSyncExternalStore(subscribe, getSceneOverride, getSceneOverride);
  return override === "auto" ? scene : override;
}

/**
 * Evening is the dark scene — panel tabs and the status bar flip to light ink.
 * Beach evening carries the same sky-top (#2F2C40) and ink, so the flip is scene-only:
 * vacation never changes what `dark` answers.
 */
export const isDarkScene = (scene: SceneName): boolean => scenes[scene].dark;

// ── The vacation (beach) scene · handoff v4.1 §1 ────────────────────────────
/**
 * `VSCN` — same A/B/C/sun/ink/dark shape as `scenes`, so the header reads ONE palette
 * object. `sea/sea2/sand` only exist here; `hill1/hill2` only exist on `scenes` (the
 * beach draws no hills, the hills never draw water).
 */
export const beachScenes = {
  morning: { a: "#DCEEEC", b: "#EDEBD4", c: "#BFE2DB", sun: "#FFF6DE", sea: "#7EC0BC", sea2: "#5CA8A7", sand: "#EFE0B8", ink: "#3F5350", dark: false },
  afternoon: { a: "#C7E2E4", b: "#EAE9CB", c: "#A9D8D2", sun: "#FFF8E4", sea: "#55AEAC", sea2: "#3A9295", sand: "#EBD5A4", ink: "#33504F", dark: false },
  evening: { a: "#2F2C40", b: "#6B4A5E", c: "#B0766B", sun: "#F2C08C", sea: "#35425C", sea2: "#2A3750", sand: "#5E5352", ink: "#F7F0E4", dark: true },
} as const;

/** `vacationOn ? VSCN[daytime] : SCN[daytime]` — the one place the two palettes meet. */
export const scenePalette = (scene: SceneName, vacationOn: boolean) => (vacationOn ? beachScenes[scene] : scenes[scene]);

// ── Layered parallax + positional sun · handoff v4.1 §2 ─────────────────────
/**
 * Four layers, each a share of the scroll: a BIGGER y factor lags more, so it reads as
 * more distant. The near layer (0.16) leaves the frame almost at content speed and
 * scales up from its bottom edge, which is what sells "passing close by".
 */
export const parallaxLayers = {
  maxScroll: 340,
  sky: { y: 0.7, x: 0.05 }, // sky / stars
  sun: { y: 0.6, x: -0.02 }, // sun / moon
  mid: { y: 0.4 }, // far hills / sea
  near: { y: 0.16, scale: 0.00035 }, // front hill / sand — origin 50% 100%
} as const;

/** Sun/moon centre in the 390×120 scene viewBox; the beach horizon sits 5px higher. */
export const sunPos = (scene: SceneName, vacationOn = false) => {
  const p = { morning: { x: 84, y: 62 }, afternoon: { x: 214, y: 28 }, evening: { x: 302, y: 44 } }[scene];
  return { x: p.x, y: vacationOn ? p.y - 5 : p.y, moonX: p.x + 11, moonY: p.y - 8 };
};

/** 1.000 at rest → 0.452 at the 340px cap. Worklet: the sun layer reads it per frame. */
export function sunFade(s: number): number {
  "worklet";
  return 1 - s / 620;
}

/** Scene SVG geometry the header paints (390×120 viewBox, bottom-anchored). */
export const scenery = {
  /** Far hills — two `hill1` washes; the near hill keeps `scenic.hills.back.d`. */
  hillsFar: [
    { d: "M0 66 Q60 44 122 62 T244 56 T390 70 V120 H0 Z", opacity: 0.55 },
    { d: "M0 74 Q70 46 140 68 T290 62 T390 78 V120 H0 Z", opacity: 0.9 },
  ],
  sun: { haloR: 46, haloOpacity: 0.2, r: 29, opacity: 0.93, moonR: 24 },
  beach: {
    sea: "M0 64 H390 V120 H0 Z",
    /** Glints ride `sunX`, so the moon reflects right and the morning sun left. */
    glints: [
      { cy: 70, rx: 30, ry: 3, opacity: 0.4 },
      { cy: 76, rx: 19, ry: 2.2, opacity: 0.26 },
    ],
    sail: { d: "M84 58 l7 -11 v11 Z", fill: "#FFFDF7", opacity: 0.9 },
    hull: { d: "M79 58 h17 l-3 3.5 h-11 Z", fill: "#3A4C51", opacity: 0.55 },
    wave: { d: "M0 82 Q65 76 130 82 T260 82 T390 80 V120 H0 Z", opacity: 0.85 },
    sand: "M0 104 Q100 88 210 100 T390 96 V120 H0 Z",
    foam: { d: "M0 104 Q100 88 210 100 T390 96", stroke: "#FFFDF7", width: 2.2, opacity: 0.55 },
  },
} as const;
