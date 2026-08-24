import { type ComponentProps } from "react";
import { Platform, Pressable } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { appBlurTarget } from "./blurTarget";
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
  intensity,
  scrim = "light",
  style,
}: {
  onClose: () => void;
  closeLabel?: string;
  /** iOS-only override of the material intensity (0–100). Android always uses the recipe radius. */
  intensity?: number;
  /** Handoff v4.1 §6 — three recipes, never mixed: `light` = centered dialogs
   *  (`rgba(247,242,233,.45)` blur 13, the "paper veil"), `dark` = bottom sheets
   *  (`rgba(60,50,38,.35)` blur 4), `capture` = the capture sheet
   *  (`rgba(60,50,38,.32)` blur 3). */
  scrim?: "light" | "dark" | "capture";
  /** Driven opacity from the sheet transition. When set, it (not FadeIn) owns the fade,
   *  so the backdrop fades OUT in step with the sheet's slide-out on a programmatic close. */
  style?: ComponentProps<typeof Animated.View>["style"];
}) {
  const light = scrim === "light";
  // Android needs blurMethod+blurTarget or expo-blur renders NO blur (the root cause
  // behind every failed blur attempt since APP-063), and its `intensity` IS the dimezis
  // radius in px (BlurModule.kt: setBlurRadius(intensity)) — so Android takes the
  // handoff's real radii while iOS keeps its 0-100 material scale.
  const recipe = {
    light: { bg: "rgba(247,242,233,0.45)", radius: 13, ios: 52 },
    dark: { bg: "rgba(60,50,38,0.35)", radius: 4, ios: 16 },
    capture: { bg: "rgba(60,50,38,0.32)", radius: 3, ios: 12 },
  }[scrim];
  return (
    <Animated.View
      entering={style ? undefined : FadeIn.duration(motion.fade.durationMs)}
      style={[{ position: "absolute", inset: 0 }, style]}
    >
      <BlurView
        intensity={Platform.OS === "android" ? recipe.radius : (intensity ?? recipe.ios)}
        tint={light ? "light" : "dark"}
        blurReductionFactor={1}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={appBlurTarget}
        style={{ position: "absolute", inset: 0 }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ flex: 1, backgroundColor: recipe.bg }} />
    </Animated.View>
  );
}
