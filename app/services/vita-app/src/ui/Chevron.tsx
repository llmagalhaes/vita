import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/**
 * Disclosure chevron that rotates between closed (points right, −90°) and open
 * (points down, 0°) over 250ms — replaces the instant `▸/▾` glyph swaps the app
 * used everywhere (Fable A6). A plain glyph so it inherits the text pipeline.
 */
export function Chevron({ open, color = colors.labelMuted, size = 10 }: { open: boolean; color?: string; size?: number }) {
  const r = useSharedValue(open ? 0 : -90);
  useEffect(() => {
    r.value = withTiming(open ? 0 : -90, { duration: 250 });
  }, [open, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.Text style={[{ fontSize: size, color, lineHeight: size + 2 }, style]} accessibilityElementsHidden>
      ▾
    </Animated.Text>
  );
}
