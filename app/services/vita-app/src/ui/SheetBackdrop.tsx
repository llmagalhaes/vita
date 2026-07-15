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
  intensity = 26,
  style,
}: {
  onClose: () => void;
  closeLabel?: string;
  intensity?: number;
  /** Driven opacity from the sheet transition. When set, it (not FadeIn) owns the fade,
   *  so the backdrop fades OUT in step with the sheet's slide-out on a programmatic close. */
  style?: ComponentProps<typeof Animated.View>["style"];
}) {
  return (
    <Animated.View
      entering={style ? undefined : FadeIn.duration(motion.fade.durationMs)}
      style={[{ position: "absolute", inset: 0 }, style]}
    >
      <BlurView
        intensity={intensity}
        tint="light"
        blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={{ position: "absolute", inset: 0 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(237,229,214,0.4)" }}
      />
    </Animated.View>
  );
}
