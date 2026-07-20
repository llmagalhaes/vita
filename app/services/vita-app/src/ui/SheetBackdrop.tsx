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
  intensity = 40, // stronger, "strongly blurred" macros/sheet backdrop (APP-063)
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
  return (
    <Animated.View
      entering={style ? undefined : FadeIn.duration(motion.fade.durationMs)}
      style={[{ position: "absolute", inset: 0 }, style]}
    >
      <BlurView
        intensity={dark ? 16 : intensity}
        tint={dark ? "dark" : "light"}
        blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        // Android divides the perceived blur by blurReductionFactor (default 4),
        // which made release builds read as barely-blurred — the CEO's "not blurred"
        // flag (APP-063). 1 keeps the full intensity, closer to iOS / the prototype.
        blurReductionFactor={Platform.OS === "android" ? 1 : undefined}
        style={{ position: "absolute", inset: 0 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        // Prototype macros/sheet scrim: light cream rgba(247,242,233,.45). This tint
        // is also the guaranteed fallback if a device can't blur at all.
        style={{ flex: 1, backgroundColor: dark ? "rgba(60,50,38,0.38)" : "rgba(247,242,233,0.45)" }}
      />
    </Animated.View>
  );
}
