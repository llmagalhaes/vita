/**
 * Vita design tokens — single source: docs/product-brief.md §Design tokens.
 * Light-only in v1 (CEO Round 5).
 */

export const colors = {
  bg: "#EDE5D6",
  surface: "#F7F2E9",
  card: "#FFFDF7",
  ink: "#4A4238",
  muted: "#8A7E70",
  accent: "#C4704E", // default; user-selectable options below
  accentOptions: ["#8CA58A", "#C98A3F", "#D6926B"] as const,
  vacationAccent: "#3E8FA3", // sea tone — vacation mode swaps the accent to this
  greens: ["#7A9377", "#8CA58A", "#AABB9B"] as const,
  sun: "#F2B45C",
  macro: {
    protein: "#8CA58A",
    carbs: "#C98A3F",
    fat: "#E0A375",
  },
  // Supporting neutrals/accents lifted from the prototype
  labelMuted: "#B7AB9C", // uppercase section labels
  track: "#F0E9DA", // empty bar/donut track
  estimateBg: "#F7E7D4",
  estimateInk: "#A66A3F",
  border: "rgba(120,100,75,0.10)",
  sheet: "#FBF6EC",
  scrubGuide: "rgba(69,62,53,0.4)", // vertical guide line under the scrub finger
  dotIdle: "#D9CFBD", // Home v2 dock date-picker idle (unmagnified) dot
} as const;

/**
 * `color-mix(in oklab, accent N%, base)` equivalent — a per-channel sRGB lerp
 * (hex in/hex out). At N ≤ 35% the delta vs true oklab is < 2 RGB steps on this
 * palette. Always call `tint(useAccent(), N)` so vacation mode swaps every tint
 * at once — never hardcode the mixed color.
 * ponytail: sRGB lerp, not oklab — upgrade to a ~20-line oklab converter only if a
 * device pass flags a tint.
 */
export function tint(accent: string, pct: number, base = "#FFFDF7"): string {
  const parse = (h: string): [number, number, number] => {
    const s = h.replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(accent);
  const [br, bg, bb] = parse(base);
  const f = pct / 100;
  const mix = (a: number, b: number) => Math.round(a * f + b * (1 - f));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(ar, br))}${hex(mix(ag, bg))}${hex(mix(ab, bb))}`.toUpperCase();
}

/** Soft card shadow lifted from the prototype (`0 10px 26px rgba(105,84,60,.08)`). */
export const shadow = {
  shadowColor: "#69543C",
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 3, // Android
} as const;

/** Home v2 timeline meal/workout row shadow (`0 8px 20px rgba(105,84,60,.07)`). */
export const shadowRow = {
  shadowColor: "#69543C",
  shadowOpacity: 0.07,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

/** Home v2 dock tooltip pill shadow (`0 6px 16px rgba(120,80,50,.28)`). */
export const shadowTooltip = {
  shadowColor: "#785032",
  shadowOpacity: 0.28,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const;

/**
 * Raised-control shadows the prototype gives every button/CTA (APP-054). The app
 * shipped Button/Toggle with none. `shadowCta` is a fn: the prototype tints a
 * primary CTA's shadow with the accent itself (`0 10px 22px accent@35%`), so it
 * must follow the active accent (incl. the vacation sea tone) — pass the color.
 */
export const shadowCta = (color: string) =>
  ({ shadowColor: color, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 }) as const;
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
 * (prototype `tl` mapping; workout color-mix values flattened for the
 * default accent — light-only v1).
 */
export const entryPalette = {
  // `dot` = Home v2 timeline spine dot (reuses the macro palette per the handoff,
  // a colour system distinct from `line`, which drives WaveIllustration crests).
  // `badge` = icon tile + kcal chip. Workout is green (`#E7EDE1`/`#5F7A61`) per the
  // design handoff (CEO: movement is green, not terracotta — reconciled app-wide).
  meal: { c1: "#F0C9A8", c2: "#E8B48C", line: "#C98A3F", badgeBg: "#F7E7D4", badgeInk: "#A66A3F", dot: "#E0A375" },
  water: { c1: "#C9D6BE", c2: "#A9BC9B", line: "#5F7A61", badgeBg: "#E7EDE1", badgeInk: "#5F7A61", dot: "#A9BC9B" },
  workout: { c1: "#F0D8CB", c2: "#E4B7A0", line: "#C4704E", badgeBg: "#E7EDE1", badgeInk: "#5F7A61", dot: "#8CA58A" },
} as const;

/**
 * Motion tokens — the prototype's two cubic-beziers plus standard durations.
 * Use with Reanimated: Easing.bezier(...motion.pop.bezier).
 */
export const motion = {
  pop: { durationMs: 350, bezier: [0.2, 0.8, 0.3, 1] as const }, // vtPop / sheet entrance
  unfold: { durationMs: 450, bezier: [0.22, 0.9, 0.32, 1] as const }, // pill field expand
  fade: { durationMs: 250 },
  enter: { durationMs: 350, offsetY: 16 }, // vtIn — screen/step first paint (FadeInUp)
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

export const fontSizes = {
  caption: 12,
  label: 14,
  body: 16,
  title: 20,
  display: 28,
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
} as const;
