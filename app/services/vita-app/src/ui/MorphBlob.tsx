import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/**
 * Organic morphing blob that also breathes — the prototype's `vtBlob` + `vtBreath`
 * combo used on the capture "making sense" state, photo scanning, and the auth /
 * onboarding heroes (Fable A8). RN can't animate the CSS blob's paired-radius
 * syntax, so we tween the four corner radii independently (a good approximation)
 * plus a gentle scale breath.
 */
export function MorphBlob({ size = 56, color = colors.accent }: { size?: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t]);
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
