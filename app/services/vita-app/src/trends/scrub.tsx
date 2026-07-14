import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { colors } from "../ui";
import { tabsPagerRef } from "../nav/pagerRef";

/** Touch x (px within the chart) → the day index under the finger. Pure/tested. */
export const indexFromX = (x: number, width: number, count: number): number =>
  width <= 0 || count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.floor((x / width) * count)));

/**
 * Scrub-by-drag overlay — same gesture-handler Pan + runOnJS pattern as Slider.
 * Absolute-fills its parent chart; onScrub fires the day index per frame,
 * onEnd on release (so the card can clear its readout). No new deps.
 *
 * Only mounted while a Trends card is open, so it never fights the tab-swipe pager
 * for a closed card. When open it wins the horizontal drag: `blocksExternalGesture`
 * makes the pager wait for this to fail, and `activeOffsetX`/`failOffsetY` claim
 * clear horizontal moves only — a vertical drag falls through to the ScrollView.
 * A 2px guide line marks the active day (prototype parity, CEO bug #6 / Fable B3).
 */
export function ScrubOverlay({
  count,
  active,
  onScrub,
  onEnd,
  accessibilityLabel,
}: {
  count: number;
  active?: number | null;
  onScrub: (index: number) => void;
  onEnd?: () => void;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pick = (x: number) => onScrub(indexFromX(x, width, count));

  const pan = Gesture.Pan()
    .blocksExternalGesture(tabsPagerRef)
    .activeOffsetX([-10, 10])
    .failOffsetY([-16, 16])
    .onBegin((e) => runOnJS(pick)(e.x))
    .onUpdate((e) => runOnJS(pick)(e.x))
    .onFinalize(() => onEnd && runOnJS(onEnd)());

  // Guide line at the active day's column centre.
  const guideX = active != null && count > 0 && width > 0 ? ((active + 0.5) / count) * width : null;

  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={StyleSheet.absoluteFill}>
        {guideX != null && (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, bottom: 0, left: guideX - 1, width: 2, backgroundColor: colors.scrubGuide }}
          />
        )}
      </View>
    </GestureDetector>
  );
}
