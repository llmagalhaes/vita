import { type ComponentProps } from "react";
import { Pressable } from "react-native";
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
  // Prototype scrim = a light cream field at rgba(247,242,233,.45) WITH backdrop-filter
  // blur(13). iOS BlurView reproduces that natively; Android needs the explicit
  // `experimentalBlurMethod` — without it expo-blur renders NO blur there, which is
  // why every earlier intensity/reduction-factor tweak (APP-063…) changed nothing and
  // we shipped a near-opaque cream frost instead. The CEO flagged that frost as far
  // from the mockup (2026-08-24), so both platforms now share the real blur + the
  // prototype's see-through tint.
  const scrimBg = dark ? "rgba(60,50,38,0.38)" : "rgba(247,242,233,0.45)";
  return (
    <Animated.View
      entering={style ? undefined : FadeIn.duration(motion.fade.durationMs)}
      style={[{ position: "absolute", inset: 0 }, style]}
    >
      <BlurView
        intensity={dark ? 16 : intensity}
        tint={dark ? "dark" : "light"}
        blurReductionFactor={1}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={appBlurTarget}
        style={{ position: "absolute", inset: 0 }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ flex: 1, backgroundColor: scrimBg }} />
    </Animated.View>
  );
}
