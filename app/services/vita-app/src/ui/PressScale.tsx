import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that springs to `scale` on press-in and back on release — the
 * prototype's `style-active: scale(...)` touch feedback, which the app was
 * missing everywhere (Fable A1, the #1 "dead to the touch" gap). Drop-in for
 * Pressable with an object `style`. Adopted by Button/Chip and any tappable card.
 */
export function PressScale({
  scale = 0.97,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, "style"> & { scale?: number; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      onPressIn={(e) => {
        s.value = withTiming(scale, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 15, stiffness: 320 });
        onPressOut?.(e);
      }}
      style={[style, animStyle]}
      {...rest}
    />
  );
}
