/**
 * APP-097 — the bits the four Overview cards share. Values from README §2
 * (Radii & shadows, base palette); no card here carries a literal hex.
 */
import { Text, colors, fonts, radii, shadowCard, shadowWaterCard, typeScale } from "../../ui";

/** Card surface: `#FFFDF7`, radius 24, hairline `rgba(120,100,75,.06)`, v4 card shadow. */
export const cardSurface = {
  backgroundColor: colors.card,
  borderRadius: radii.card,
  borderWidth: 1,
  borderColor: colors.borderFaint,
  ...shadowCard,
} as const;

/** The water/macros row sits a little higher off the canvas (`0 16px 34px .11`). */
export const cardSurfaceRaised = { ...cardSurface, ...shadowWaterCard } as const;

/** Uppercase micro-label inside a card — 11.5/800 ls 1 `#B7AB9C`. */
export function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{ fontFamily: fonts.extraBold, fontSize: typeScale.micro, letterSpacing: 1, textTransform: "uppercase" }}
      color={colors.faint}
    >
      {children}
    </Text>
  );
}

/**
 * The big soft number both the water and weight cards use — 21/300 ls −.5.
 * Shrinks rather than clips: the vessel leaves a narrow text column and "1,250 ml"
 * used to truncate on narrow devices (APP-066).
 */
export function BigValue({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{ fontFamily: fonts.light, fontSize: 21, letterSpacing: -0.5 }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {children}
    </Text>
  );
}
