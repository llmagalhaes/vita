import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";
import { useStartOnLayout } from "./useStartOnLayout";

/**
 * Horizontal reference bar (macros, micros, energy). `pct` is clamped 0–100 and
 * the fill tweens to it (`transition: width` in the prototype); an optional
 * `delay` grows it in from 0 (`vtGrowX`). Fable A2. The mount grow starts from
 * onLayout so it can't race view attachment (see useStartOnLayout).
 */
export function Bar({ pct, color, height = 7, delay = 0 }: { pct: number; color: string; height?: number; delay?: number }) {
  const target = Math.max(0, Math.min(100, pct));
  const grow = delay > 0;
  const w = useSharedValue(grow ? 0 : target);
  const started = useRef(!grow);
  const onLayout = useStartOnLayout(() => {
    if (grow) w.value = withDelay(delay, withTiming(target, { duration: 500 }));
    started.current = true;
  });
  useEffect(() => {
    if (started.current) w.value = withTiming(target, { duration: 500 });
  }, [target, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View onLayout={onLayout} style={{ height, borderRadius: height / 2, backgroundColor: colors.track, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}
