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
