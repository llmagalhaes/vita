import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/**
 * Horizontal reference bar (macros, micros, energy). `pct` is clamped 0–100 and
 * the fill tweens to it (`transition: width` in the prototype); an optional
 * `delay` grows it in from 0 on mount (`vtGrowX`). Fable A2.
 */
export function Bar({ pct, color, height = 7, delay = 0 }: { pct: number; color: string; height?: number; delay?: number }) {
  const target = Math.max(0, Math.min(100, pct));
  const w = useSharedValue(delay > 0 ? 0 : target);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(target, { duration: 500 }));
  }, [target, delay, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}
