import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { colors } from "./tokens";

// Pure slider math (exported for tests).
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
 * Minimal portion slider (gesture-handler Pan + pure math above). No native
 * slider dep — works in Expo Go. onChange fires per drag frame so totals
 * recompute live. ponytail: JS setState per frame is fine here; the recompute
 * is JS-side anyway and the surface is one item at a time.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const set = (x: number) => onChange(valueFromX(x, width, min, max, step));

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(set)(e.x))
    .onUpdate((e) => runOnJS(set)(e.x));

  const ratio = ratioOf(value, min, max);

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
          <View style={{ height: "100%", width: `${ratio * 100}%`, borderRadius: 4, backgroundColor: colors.accent }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${ratio * 100}%`,
            marginLeft: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.card,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
      </View>
    </GestureDetector>
  );
}
