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
} as const;

/** Soft card shadow lifted from the prototype (`0 10px 26px rgba(105,84,60,.08)`). */
export const shadow = {
  shadowColor: "#69543C",
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 3, // Android
} as const;

/**
 * Per-entry-kind palette for timeline cards and wave illustrations
 * (prototype `tl` mapping; workout color-mix values flattened for the
 * default accent — light-only v1).
 */
export const entryPalette = {
  meal: { c1: "#F0C9A8", c2: "#E8B48C", line: "#C98A3F", badgeBg: "#F7E7D4", badgeInk: "#A66A3F" },
  water: { c1: "#C9D6BE", c2: "#A9BC9B", line: "#5F7A61", badgeBg: "#E7EDE1", badgeInk: "#5F7A61" },
  workout: { c1: "#F0D8CB", c2: "#E4B7A0", line: "#C4704E", badgeBg: "#F7E9DF", badgeInk: "#C4704E" },
} as const;

/**
 * Motion tokens — the prototype's two cubic-beziers plus standard durations.
 * Use with Reanimated: Easing.bezier(...motion.pop.bezier).
 */
export const motion = {
  pop: { durationMs: 350, bezier: [0.2, 0.8, 0.3, 1] as const }, // vtPop / sheet entrance
  unfold: { durationMs: 450, bezier: [0.22, 0.9, 0.32, 1] as const }, // pill field expand
  fade: { durationMs: 250 },
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
