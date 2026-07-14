import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/**
 * The earthy on/off switch from the prototype (integrations, notifications).
 * Knob slides and the track colour tweens over 220ms (`transition .25s`) rather
 * than snapping — Fable A6.
 */
export function Toggle({
  on,
  onToggle,
  accessibilityLabel,
  onColor = colors.accent,
}: {
  on: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
  onColor?: string;
}) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(on ? 1 : 0, { duration: 220 });
  }, [on, p]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [colors.track, onColor]),
  }));
  const knob = useAnimatedStyle(() => ({ left: 3 + p.value * 19 }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
    >
      <Animated.View style={[{ width: 46, height: 27, borderRadius: 15, justifyContent: "center" }, track]}>
        <Animated.View
          style={[
            { position: "absolute", top: 3, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.card },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
