import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { colors } from "./tokens";

// Pure slider math (exported for tests). Kept plain JS so the unit tests run
// without a worklet runtime; the gesture/animation paths inline the same math in
// worklets (below) so nothing crosses to the JS thread mid-drag.
export const clampSlider = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
export const quantize = (v: number, step: number): number =>
  step > 0 ? Math.round(v / step) * step : v;
/** Touch x (px within the track) → a quantized, clamped value. */
export const valueFromX = (x: number, width: number, min: number, max: number, step: number): number =>
  width <= 0 ? min : quantize(clampSlider(min + (x / width) * (max - min), min, max), step);
/** Value → 0..1 fill ratio for the track. */
export const ratioOf = (value: number, min: number, max: number): number =>
  max === min ? 0 : clampSlider((value - min) / (max - min), 0, 1);

/**
 * Portion slider (gesture-handler Pan). The live drag value lives on the UI thread
 * in the `live` shared value: the thumb + fill track the finger every frame with no
 * JS round-trip, and the parent's big qty readout reads the same shared value. Only
 * on release do we cross back to React (`onCommit`) — so the whole plan tree
 * re-renders once, not every frame (the device-jank fix, APP-portion-perf). The
 * exported math above stays plain JS for tests; the worklets inline it.
 */
export function Slider({
  value,
  live,
  min,
  max,
  step,
  onCommit,
  accessibilityLabel,
}: {
  /** Committed value — source of truth when idle (parent keeps `live` synced to it). */
  value: number;
  /** UI-thread live drag value, owned by the parent (also drives its big readout). */
  live: SharedValue<number>;
  min: number;
  max: number;
  step: number;
  /** Fires once, on finger-up, with the final quantized value. */
  onCommit: (next: number) => void;
  accessibilityLabel?: string;
}) {
  const width = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      "worklet";
      const w = width.value;
      const raw = w <= 0 ? min : min + (e.x / w) * (max - min);
      const c = Math.min(max, Math.max(min, raw));
      live.value = step > 0 ? Math.round(c / step) * step : c;
    })
    .onUpdate((e) => {
      "worklet";
      const w = width.value;
      const raw = w <= 0 ? min : min + (e.x / w) * (max - min);
      const c = Math.min(max, Math.max(min, raw));
      live.value = step > 0 ? Math.round(c / step) * step : c;
    })
    .onFinalize(() => {
      "worklet";
      runOnJS(onCommit)(live.value);
    });

  const fillStyle = useAnimatedStyle(() => {
    const r = max === min ? 0 : Math.min(1, Math.max(0, (live.value - min) / (max - min)));
    return { width: `${r * 100}%` };
  });
  const thumbStyle = useAnimatedStyle(() => {
    const r = max === min ? 0 : Math.min(1, Math.max(0, (live.value - min) / (max - min)));
    return { left: `${r * 100}%` };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value }}
        onLayout={onLayout}
        // Tall hit area; the visible track sits centered inside.
        style={{ height: 34, justifyContent: "center" }}
      >
        <View style={{ height: 8, borderRadius: 4, backgroundColor: "#F0E9DA", overflow: "hidden" }}>
          <Animated.View style={[{ height: "100%", borderRadius: 4, backgroundColor: colors.accent }, fillStyle]} />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              marginLeft: -11,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.card,
              borderWidth: 2,
              borderColor: colors.accent,
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
