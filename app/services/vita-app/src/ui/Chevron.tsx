import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/**
 * Disclosure chevron that rotates between closed (points right, −90°) and open
 * (points down, 0°) over 250ms — replaces the instant `▸/▾` glyph swaps the app
 * used everywhere (Fable A6). `flip` uses the down↔up convention instead
 * (closed 0° ▾ → open 180° ▴, the habits-row affordance). Plain glyph so it
 * inherits the text pipeline.
 */
export function Chevron({
  open,
  color = colors.labelMuted,
  size = 10,
  flip = false,
}: {
  open: boolean;
  color?: string;
  size?: number;
  flip?: boolean;
}) {
  const deg = (o: boolean) => (flip ? (o ? 180 : 0) : o ? 0 : -90);
  const r = useSharedValue(deg(open));
  useEffect(() => {
    r.value = withTiming(deg(open), { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flip, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.Text style={[{ fontSize: size, color, lineHeight: size + 2 }, style]} accessibilityElementsHidden>
      ▾
    </Animated.Text>
  );
}
