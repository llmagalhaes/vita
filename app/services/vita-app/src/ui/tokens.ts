/**
 * Vita design tokens — single source: docs/v4/README.md §2 (Design tokens, complete),
 * values cross-checked against docs/v4/Vita Prototype v4.dc.html.
 * Light-only (CEO Round 5). Every colour/duration the v4 handoff names lives here;
 * no screen may carry a literal hex.
 */

export const colors = {
  // ── Surfaces ────────────────────────────────────────────────────────────────
  canvas: "#F7F2E9", // panel background (v4)
  panel: "#F7F2E9",
  sheet: "#FBF6EC",
  card: "#FFFDF7",
  input: "#FBF6EC",
  desk: "#EDE5D6", // the "desk" behind the phone bezel
  bezel: "#332D26",
  /** @deprecated v3 name for the desk colour. v4 canvas is `canvas`/`surface`. */
  bg: "#EDE5D6",
  surface: "#F7F2E9",

  // ── Ink ramp ────────────────────────────────────────────────────────────────
  inkHeading: "#453E35",
  ink: "#4A4238", // body
  inkMuted: "#6E6355",
  muted: "#8A7E70", // secondary
  faint: "#B7AB9C",
  disabled: "#CFC5B4",
  sand: "#D9CFBD",
  sandLight: "#E4DCCB",
  labelMuted: "#B7AB9C", // uppercase section labels (v3 alias of `faint`)

  // ── Accent ──────────────────────────────────────────────────────────────────
  accent: "#C4704E",
  accentHover: "#A85A3B",
  accentOptions: ["#8CA58A", "#C98A3F", "#D6926B"] as const,
  vacationAccent: "#3E8FA3", // sea tone — vacation mode swaps the accent to this
  vacation: {
    accent: "#3E8FA3",
    bg: "#E3EEF0",
    bannerFrom: "#EAF3F4",
    bannerTo: "#DFECEE",
    ink: "#3A4C51",
    inkSoft: "#6B8087",
  },

  // ── Green (done / water) ────────────────────────────────────────────────────
  green: { bg: "#E7EDE1", ink: "#5F7A61", fill: "#8CA58A", fillSoft: "#A9BC9B", track: "#EDF1E7" },
  greens: ["#7A9377", "#8CA58A", "#AABB9B"] as const,

  // ── Amber (adjusted) / peach (kcal bars, weight line) ───────────────────────
  amber: { bg: "#F7E7D4", ink: "#A66A3F", fill: "#C98A3F" },
  peach: "#E0A375",
  peachSoft: "#E8B48C",
  estimateBg: "#F7E7D4",
  estimateInk: "#A66A3F",
  sun: "#F2B45C",

  // ── Sand / neutral fills ────────────────────────────────────────────────────
  sandChip: "#F0EDE2",
  well: "#F3EBDD", // icon wells (parsing doc, sun, leaf)
  chartEmpty: "#EDE8DC",
  muscleEmpty: "#ECE6D8",
  muscleEmptyAlt: "#EDE6D8",
  barIdle: "#D5CBB8",
  track: "#F0E9DA", // empty bar/donut track (v3)
  dotIdle: "#D9CFBD", // dock date-picker idle (unmagnified) dot

  // ── Danger ──────────────────────────────────────────────────────────────────
  danger: "#B0563F",
  dangerBorder: "rgba(176,86,63,0.35)",

  // ── Dark surfaces ───────────────────────────────────────────────────────────
  dark: {
    bg: "#453E35", // toast pill / segmented-active
    ink: "#F7F0E4",
    undo: "#F2C08C",
  },
  toastUndo: "#F2C08C",
  recap: {
    bg1: "#3E3A46",
    bg2: "#5C4A4A",
    angleDeg: 135,
    text: "#F7F0E4",
    /** Quiet cream on the recap gradient (`rgba(247,240,228,.65)`) — the recap footer. */
    textSoft: "rgba(247,240,228,0.65)",
    label: "#D8C9B4",
    dashed: "rgba(247,240,228,0.22)",
    pill: "rgba(247,240,228,0.14)",
  },

  // ── Hairlines & scrims ──────────────────────────────────────────────────────
  border: "rgba(120,100,75,0.10)", // cards .06–.10
  borderFaint: "rgba(120,100,75,0.06)",
  borderControl: "rgba(120,100,75,0.14)",
  borderControlStrong: "rgba(120,100,75,0.16)",
  dashedBorder: "rgba(120,100,75,0.22)",
  divider: "rgba(120,100,75,0.16)", // dashed dividers
  rail: "rgba(120,100,75,0.10)", // timeline connecting line
  ringNoRecord: "rgba(120,100,75,0.35)", // calendar "no record" ring
  scrubGuide: "rgba(69,62,53,0.4)",
  progressUpcoming: "rgba(74,66,56,0.13)",

  // ── Macros ──────────────────────────────────────────────────────────────────
  macro: { protein: "#8CA58A", carbs: "#C98A3F", fat: "#E0A375" },
} as const;

/**
 * Scenic home scenes — header gradient `180deg A 0% → B 55% → C 100%`
 * (prototype `SCN`). `dark: true` scenes flip the status bar + panel tabs.
 */
export const scenes = {
  morning: { a: "#DFEDE9", b: "#F3E3CB", c: "#F2C9A2", sun: "#FFF6DE", hill1: "#BFD0BB", hill2: "#93AE9A", ink: "#48493E", dark: false },
  afternoon: { a: "#CDE3E4", b: "#EFDFBE", c: "#EBC493", sun: "#FFF8E4", hill1: "#CFC291", hill2: "#A89F66", ink: "#5C4A3A", dark: false },
  evening: { a: "#2F2C40", b: "#6B4A4E", c: "#C98A6B", sun: "#F2C08C", hill1: "#4A4258", hill2: "#5C4A55", ink: "#F7F0E4", dark: true },
} as const;

export type SceneName = keyof typeof scenes;

/** Scene geometry + chrome the scenic header paints (README §2 "Scenic scenes"). */
export const scenic = {
  gradientStops: [0, 0.55, 1] as const,
  sun: { cx: 196, cy: 46, r: 30, opacity: 0.92, haloR: 48, haloOpacity: 0.22 },
  hills: {
    viewBox: { width: 390, height: 120 },
    front: { d: "M0 70 Q70 40 140 66 T290 60 T390 74 V120 H0 Z", opacity: 0.85 },
    back: { d: "M0 92 Q90 66 190 88 T390 92 V120 H0 Z", opacity: 1 },
  },
  stars: { count: 8, minR: 1, maxR: 1.5, color: "#F7F0E4", minOpacity: 0.5, maxOpacity: 1, fadeMs: 300 },
  textShadow: "rgba(30,22,16,0.35)",
  glassChip: { bg: "rgba(30,24,18,0.22)", blur: 8, border: "rgba(255,253,247,0.14)", radius: 15, padV: 6, padH: 13 },
  /** The "rolling card" seam over the scene. */
  sheetCap: { height: 38, bg: "#F7F2E9", radius: 30, marginTop: -34, marginX: -20, marginBottom: -13 },
  /** Sun/hills/stars translateY = min(340, scrollTop) × 0.38 (≈0.62× exit speed). */
  parallax: { factor: 0.38, maxScroll: 340, thresholdPx: 1 },
} as const;

/** Floating panel tabs (Trends | Day | Library) — light and dark-scene variants. */
export const panelTabs = {
  light: {
    bg: "rgba(255,253,247,0.55)",
    blur: 14,
    saturate: 1.4,
    border: "rgba(120,100,75,0.12)",
    activeBg: "#FFFDF7",
    idleInk: "#8A7E70",
  },
  dark: {
    bg: "rgba(40,34,28,0.30)",
    blur: 14,
    saturate: 1.4,
    border: "rgba(255,253,247,0.22)",
    activeBg: "rgba(255,253,247,0.20)",
    activeInk: "#F7F0E4",
    idleInk: "rgba(247,240,228,0.65)",
  },
  radius: 20,
  padding: 3,
  chipRadius: 16,
  chipPadV: 6,
  chipPadH: 13,
} as const;

/** Frosted capture pill (README §3). */
export const capturePill = {
  bg: "rgba(255,253,247,0.55)",
  blur: 20,
  saturate: 1.5,
  border: "rgba(255,253,247,0.72)",
  radius: 32,
  buttonBg: "rgba(69,62,53,0.08)",
  buttonInk: "#453E35",
  buttonSize: 40,
  micSize: 52,
} as const;

/** Timeline rail + meal-state dot colours (README §3 "Timeline"). */
export const dayState = {
  done: "#8CA58A",
  adjusted: "#C98A3F",
  skipped: "#D9CFBD",
  future: "#E4DCCB",
  railWidth: 40,
  railLineWidth: 2,
  dotSize: 9,
} as const;

export { mixOklab } from "./oklab";
import { mixOklab } from "./oklab";

/**
 * @deprecated v3 name — `mixOklab` is the real `color-mix(in oklab, …)` and now
 * backs this alias. Import `mixOklab` directly; this goes after the v4 wave.
 */
export const tint = mixOklab;

/** Soft card shadow lifted from the prototype (`0 10px 26px rgba(105,84,60,.08)`). */
export const shadow = {
  shadowColor: "#69543C",
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 3, // Android
} as const;

/**
 * v4 card shadow — `0 1px 2px rgba(105,84,60,.05), 0 14px 30px rgba(105,84,60,.10)`.
 * RN takes one shadow, so the 14/30 .10 layer wins (the 1px contact layer is
 * invisible on Android elevation anyway).
 * ponytail: single layer, not two stacked Views — revisit only if a device pass flags it.
 */
export const shadowCard = {
  shadowColor: "#69543C",
  shadowOpacity: 0.1,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 14 },
  elevation: 4,
} as const;

/** Water card raise (`0 16px 34px rgba(105,84,60,.11)`). */
export const shadowWaterCard = {
  shadowColor: "#69543C",
  shadowOpacity: 0.11,
  shadowRadius: 34,
  shadowOffset: { width: 0, height: 16 },
  elevation: 4,
} as const;

/** Bottom sheet (`0 -10px 44px rgba(80,60,40,.20)`). */
export const shadowSheet = {
  shadowColor: "#503C28",
  shadowOpacity: 0.2,
  shadowRadius: 44,
  shadowOffset: { width: 0, height: -10 },
  elevation: 12,
} as const;

/** Modal (`0 14px 34px rgba(105,84,60,.14)`). */
export const shadowModal = {
  shadowColor: "#69543C",
  shadowOpacity: 0.14,
  shadowRadius: 34,
  shadowOffset: { width: 0, height: 14 },
  elevation: 10,
} as const;

/** Toast pill (`0 12px 30px rgba(60,45,30,.3)`). */
export const shadowToast = {
  shadowColor: "#3C2D1E",
  shadowOpacity: 0.3,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
} as const;

/** Active panel-tab chip (`0 3px 8px rgba(105,84,60,.14)`). */
export const shadowTab = {
  shadowColor: "#69543C",
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

/** Floating panel-tab container (`0 8px 22px rgba(50,38,26,.12)`, prototype line 119). */
export const shadowPanelTabs = {
  shadowColor: "#32261A",
  shadowOpacity: 0.12,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;

/** Capture pill (`0 12px 34px rgba(50,38,26,.25)`). */
export const shadowPill = {
  shadowColor: "#32261A",
  shadowOpacity: 0.25,
  shadowRadius: 34,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
} as const;

/** Scenic sheet cap seam (`0 -12px 26px -8px rgba(50,36,22,.18)`). */
export const shadowCap = {
  shadowColor: "#322416",
  shadowOpacity: 0.18,
  shadowRadius: 26,
  shadowOffset: { width: 0, height: -12 },
  elevation: 6,
} as const;

/** Home v2 timeline meal/workout row shadow (`0 8px 20px rgba(105,84,60,.07)`). */
export const shadowRow = {
  shadowColor: "#69543C",
  shadowOpacity: 0.07,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

/** Dock tooltip pill shadow (`0 6px 16px rgba(120,80,50,.28)`). */
export const shadowTooltip = {
  shadowColor: "#785032",
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;

/**
 * Raised-control shadows the prototype gives every button/CTA (APP-054).
 * `shadowCta` is a fn: the prototype tints a primary CTA's shadow with the accent
 * itself (`0 10px 22–24px accent@30–32%`), so it must follow the active accent
 * (incl. the vacation sea tone) — pass the color.
 */
export const shadowCta = (color: string) =>
  ({ shadowColor: color, shadowOpacity: 0.32, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 5 }) as const;
/** Mic button raise (`0 8px 20px accent@40%`). */
export const shadowMic = (color: string) =>
  ({ shadowColor: color, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 }) as const;
/** Light neutral raise: inputs, ghost tiles, secondary buttons (`0 6px 18px rgba(105,84,60,.07)`). */
export const shadowSoft = {
  shadowColor: "#69543C",
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;
/** Dark button / toast raise (`0 10px 24px rgba(60,45,30,.28)`). */
export const shadowDark = {
  shadowColor: "#3C2D1E",
  shadowOpacity: 0.28,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const;
/** Centered pop-up card (`0 20px 50px rgba(105,84,60,.20)`) — Macros/portion pops. */
export const shadowPop = {
  shadowColor: "#69543C",
  shadowOpacity: 0.2,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 12 },
  elevation: 10,
} as const;
/** Check-in deck's deep card raise (`0 26px 60px rgba(60,45,30,.30)`). */
export const shadowDeck = {
  shadowColor: "#3C2D1E",
  shadowOpacity: 0.3,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: 20 },
  elevation: 12,
} as const;

/**
 * Per-entry-kind palette for timeline cards and wave illustrations
 * (prototype `tl` mapping). Workout is green per the design handoff.
 */
export const entryPalette = {
  meal: { c1: "#F0C9A8", c2: "#E8B48C", line: "#C98A3F", badgeBg: "#F7E7D4", badgeInk: "#A66A3F", dot: "#E0A375" },
  water: { c1: "#C9D6BE", c2: "#A9BC9B", line: "#5F7A61", badgeBg: "#E7EDE1", badgeInk: "#5F7A61", dot: "#A9BC9B" },
  workout: { c1: "#F0D8CB", c2: "#E4B7A0", line: "#C4704E", badgeBg: "#E7EDE1", badgeInk: "#5F7A61", dot: "#8CA58A" },
} as const;

/**
 * Motion tokens — the prototype's exact keyframe durations and beziers
 * (README §2 Keyframes; durations verified by grepping every `animation:` in
 * `Vita Prototype v4.dc.html`). Use with Reanimated: `Easing.bezier(...bezier)`.
 * Where the prototype uses a range, `durationMs` is the dominant value and the
 * range is noted; `ease` = CSS `ease` = cubic-bezier(.25,.1,.25,1).
 */
export const motion = {
  // v3 names other screens still import — kept until the v4 rebuild lands.
  pop: { durationMs: 350, bezier: [0.2, 0.8, 0.3, 1] as const },
  unfold: { durationMs: 450, bezier: [0.22, 0.9, 0.32, 1] as const },
  fade: { durationMs: 250 },
  enter: { durationMs: 350, offsetY: 16 },
  breath: { durationMs: 1600, scale: 1.07 },

  /** CSS `ease`. */
  ease: [0.25, 0.1, 0.25, 1] as const,

  /** 16px rise + fade — screen/step first paint. Prototype: .3s (also .35s, .5s+.15s delay). */
  vtIn: { durationMs: 300, longMs: 350, offsetY: 16 },
  /** 8px rise + fade, staggered `i × 70ms` on lists. Prototype: .25s / .3s / .35s / .4s / .5s. */
  vtFade: { durationMs: 250, longMs: 400, offsetY: 8, staggerMs: 70, timelineStaggerMs: 45 },
  /** scale .92 → 1. Prototype: .3s (also .25/.35/.4s). */
  vtPop: { durationMs: 300, fromScale: 0.92 },
  /** scale 1 ↔ 1.07, 1.6s loop — parsing icons. */
  vtBreath: { durationMs: 1600, toScale: 1.07 },
  /** Tooltip spring: translateY 7 → −3 → 0, scale .5 → 1.08 → 1 (keyframe at 55%). */
  vtTip: {
    durationMs: 320,
    bezier: [0.34, 1.56, 0.64, 1] as const,
    offsetsY: [7, -3, 0] as const,
    scales: [0.5, 1.08, 1] as const,
    midpoint: 0.55,
  },
  /** translateY 105% → 0. Prototype: .38s (one .35s). */
  vtSheetUp: { durationMs: 380, shortMs: 350, bezier: [0.22, 0.9, 0.32, 1] as const, fromPercent: 105 },
  /** scaleY .3 ↔ 1, 1s loop, delays i × .13s — mic bars. */
  vtWave: { durationMs: 1000, fromScaleY: 0.3, staggerMs: 130 },
  /** Capture pill max-width 54 → 280px, opacity .5 → 1. */
  vtPillX: { durationMs: 500, bezier: [0.22, 0.9, 0.32, 1] as const, fromWidth: 54, toWidth: 280, fromOpacity: 0.5 },
  /** Pill side buttons: scale .4 pop, delays .3s / .38s. */
  vtPillBtn: { durationMs: 350, fromScale: 0.4, delaysMs: [300, 380] as const },

  /** Panel carousel snap (README §1). */
  panelSnap: { durationMs: 450, bezier: [0.22, 0.9, 0.32, 1] as const },
  /** Dock magnifier release spring (README §3). */
  dockRelease: { durationMs: 550, bezier: [0.34, 1.56, 0.64, 1] as const, tintMs: 300 },
  /** Water bottle fill height. */
  waterFill: { durationMs: 600 },
} as const;

/** Panel edge-swipe gesture thresholds (README §1). */
export const panelGesture = {
  edgePx: 34,
  minDxPx: 8,
  verticalVetoPx: 12,
  verticalVetoRatio: 1.1,
  commitPx: 90,
  rubberBandDivisor: 3.5,
} as const;

/** Nunito (200–800) loaded in the root layout via @expo-google-fonts/nunito. */
export const fonts = {
  extraLight: "Nunito_200ExtraLight",
  light: "Nunito_300Light",
  regular: "Nunito_400Regular",
  semiBold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extraBold: "Nunito_800ExtraBold",
} as const;

/** `Text` component variants — keys drive `Text.tsx`'s weight map, don't extend. */
export const fontSizes = {
  caption: 12,
  label: 14,
  body: 16,
  title: 20,
  display: 28,
} as const;

/** v4 one-off screen sizes (README §2 Typography) — not `Text` variants. */
export const typeScale = {
  screenTitle: 21,
  heroClassic: 82,
  heroScenic: 72,
  heroLock: 64,
  heroCounter: 44, // Trends record counter
  micro: 11.5, // micro-labels 9–11.5/800 uppercase
  railTime: 10,
  chartAxis: 9,
} as const;

/** Letter-spacing for the display/micro type (README §2). */
export const letterSpacing = {
  heroClassic: -2.5,
  heroScenic: -2.2,
  micro: 1.2,
  zoneLabel: 1.4,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
  // v4 (README §2 Radii)
  card: 24,
  cardLarge: 26,
  sheetTop: 30,
  sheetBottom: 42,
  modal: 22,
  innerBlock: 20,
  innerBlockTight: 16,
  chip: 17,
  chipTight: 7,
  bezelOuter: 56,
  bezelScreen: 46,
} as const;

/** Minimum hit targets (README §2 Typography). */
export const hit = { min: 34, button: 42, buttonLarge: 52 } as const;
