import { type ComponentProps } from "react";
import { Pressable, Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { motion } from "./tokens";

/**
 * The one blurred backdrop behind every sheet / pop-up (CEO batch #2, audit B12).
 * Mirrors the prototype's `backdrop-filter: blur(13px)` over a soft cream tint
 * (image 2). expo-blur's BlurView ships inside Expo Go SDK 56, so this works there;
 * if a surface can't blur (older Android with blurMethod:none) the tint scrim below
 * still dims the background — the previous behaviour, never worse.
 */
export function SheetBackdrop({
  onClose,
  closeLabel,
  intensity = 52, // denser macros/sheet blur — CEO asked for a bit more (was 40)
  scrim = "light",
  style,
}: {
  onClose: () => void;
  closeLabel?: string;
  intensity?: number;
  /** Prototype has two scrims: a light cream one behind bottom-sheets / the Macros
   *  pop-up (`rgba(247,242,233,.45)` blur 13), and a darker one behind the check-in
   *  deck (`rgba(60,50,38,.38)` blur 4). Pick per surface. */
  scrim?: "light" | "dark";
  /** Driven opacity from the sheet transition. When set, it (not FadeIn) owns the fade,
   *  so the backdrop fades OUT in step with the sheet's slide-out on a programmatic close. */
  style?: ComponentProps<typeof Animated.View>["style"];
}) {
  const dark = scrim === "dark";
  const android = Platform.OS === "android";
  // Prototype scrim = a light cream field at rgba(247,242,233,.45) WITH backdrop-filter
  // blur(13). iOS BlurView reproduces that faithfully, so the .45 tint is right there.
  // On Android BlurView is weak/unreliable (fought since APP-063 — blurReductionFactor
  // did NOT fix it per the CEO), so instead of a see-through .45 tint that lets the
  // colourful background bleed through — reading as "not blurred" AND leaving the card's
  // shadow no field to sit against — we lean on a near-opaque frosted tint that reliably
  // muted the background. Same muted-cream result, no BlurView dependency.
  const scrimBg = dark
    ? android
      ? "rgba(60,50,38,0.55)"
      : "rgba(60,50,38,0.38)"
    : android
      ? "rgba(247,242,233,0.92)" // denser cream frost — CEO wanted more obscuring (was .86)
      : "rgba(247,242,233,0.45)";
  return (
    <Animated.View
      entering={style ? undefined : FadeIn.duration(motion.fade.durationMs)}
      style={[{ position: "absolute", inset: 0 }, style]}
    >
      {!android && (
        <BlurView
          intensity={dark ? 16 : intensity}
          tint={dark ? "dark" : "light"}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ flex: 1, backgroundColor: scrimBg }} />
    </Animated.View>
  );
}
