import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

/** Touch x (px within the chart) → the day index under the finger. Pure/tested. */
export const indexFromX = (x: number, width: number, count: number): number =>
  width <= 0 || count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.floor((x / width) * count)));

/**
 * Scrub-by-drag overlay — same gesture-handler Pan + runOnJS pattern as Slider.
 * Absolute-fills its parent chart; onScrub fires the day index per frame,
 * onEnd on release (so the card can clear its readout). No new deps.
 */
export function ScrubOverlay({
  count,
  onScrub,
  onEnd,
  accessibilityLabel,
}: {
  count: number;
  onScrub: (index: number) => void;
  onEnd?: () => void;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pick = (x: number) => onScrub(indexFromX(x, width, count));

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(pick)(e.x))
    .onUpdate((e) => runOnJS(pick)(e.x))
    .onFinalize(() => onEnd && runOnJS(onEnd)());

  return (
    <GestureDetector gesture={pan}>
      <View
        accessibilityLabel={accessibilityLabel}
        onLayout={onLayout}
        style={StyleSheet.absoluteFill}
      />
    </GestureDetector>
  );
}
