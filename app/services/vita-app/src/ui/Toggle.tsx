import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "./tokens";

/** Prototype switch geometry: the Library's habit rows use the small one (38×23). */
const SIZES = {
  md: { w: 46, h: 27, r: 15, knob: 21, travel: 19 },
  sm: { w: 38, h: 23, r: 13, knob: 17, travel: 15 },
} as const;

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
  offColor = colors.track,
  size = "md",
}: {
  on: boolean;
  onToggle: () => void;
  accessibilityLabel?: string;
  onColor?: string;
  offColor?: string;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(on ? 1 : 0, { duration: 220 });
  }, [on, p]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [offColor, onColor]),
  }));
  const knob = useAnimatedStyle(() => ({ left: 3 + p.value * s.travel }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
    >
      <Animated.View style={[{ width: s.w, height: s.h, borderRadius: s.r, justifyContent: "center" }, track]}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 3,
              width: s.knob,
              height: s.knob,
              borderRadius: s.knob / 2,
              backgroundColor: colors.card,
              // prototype knob shadow `0 2px 6px rgba(60,45,30,.25)`
              shadowColor: "#3C2D1E",
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
