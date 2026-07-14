import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/** Shared 0↔1 loop for the blob morphs. */
function useMorph(durationMs: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t, durationMs]);
  return t;
}

/**
 * Organic morphing blob that also breathes — the prototype's `vtBlob` + `vtBreath`
 * combo used on the capture "making sense" state, photo scanning, and the auth /
 * onboarding heroes (Fable A8). RN can't animate the CSS blob's paired-radius
 * syntax, so we tween the four corner radii independently (a good approximation)
 * plus a gentle scale breath.
 */
export function MorphBlob({ size = 56, color = colors.accent }: { size?: number; color?: string }) {
  const t = useMorph(3200);
  const style = useAnimatedStyle(() => {
    const pct = (n: number) => (n / 100) * size;
    return {
      transform: [{ scale: 1 + 0.07 * t.value }],
      borderTopLeftRadius: pct(40 + 18 * t.value),
      borderTopRightRadius: pct(58 - 16 * t.value),
      borderBottomRightRadius: pct(44 + 14 * t.value),
      borderBottomLeftRadius: pct(52 - 12 * t.value),
    };
  });
  return <Animated.View style={[{ width: size, height: size, backgroundColor: color, opacity: 0.85 }, style]} />;
}

/**
 * Slow organic corner-radius morph AROUND children — the prototype's hero blocks
 * (`vtBlob 9s` on the auth/onboarding illustration containers). Children keep
 * rendering (SVG scene); only the container silhouette breathes.
 */
export function MorphContainer({
  children,
  style,
  durationMs = 9000,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  durationMs?: number;
}) {
  const t = useMorph(durationMs);
  const morph = useAnimatedStyle(() => ({
    borderTopLeftRadius: 34 + 22 * t.value,
    borderTopRightRadius: 52 - 24 * t.value,
    borderBottomRightRadius: 40 + 18 * t.value,
    borderBottomLeftRadius: 50 - 20 * t.value,
  }));
  return <Animated.View style={[style, { overflow: "hidden" }, morph]}>{children}</Animated.View>;
}
