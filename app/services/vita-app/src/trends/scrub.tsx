import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { colors } from "../ui";
import { tabsPagerRef } from "../nav/pagerRef";

/** Touch x (px within the chart) → the day index under the finger. Pure/tested. */
export const indexFromX = (x: number, width: number, count: number): number => {
  "worklet";
  return width <= 0 || count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.floor((x / width) * count)));
};

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
  gap = 3,
  onScrub,
  onEnd,
  accessibilityLabel,
}: {
  count: number;
  active?: number | null;
  /** Inter-bar gap (px) of the chart below, so the guide lands on the true column centre. */
  gap?: number;
  onScrub: (index: number) => void;
  onEnd?: () => void;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Touch x lives on the UI thread so the guide tracks the finger without a JS
  // round-trip (APP-044). onScrub still fires for the readout, but only when the
  // day index actually changes — cuts a per-frame JS hop to one hop per column.
  const touchX = useSharedValue<number | null>(null);
  const lastIdx = useSharedValue(-1);

  const pan = Gesture.Pan()
    .blocksExternalGesture(tabsPagerRef)
    .activeOffsetX([-10, 10])
    .failOffsetY([-16, 16])
    .onBegin((e) => {
      touchX.value = e.x;
      const i = indexFromX(e.x, width, count);
      lastIdx.value = i;
      runOnJS(onScrub)(i);
    })
    .onUpdate((e) => {
      touchX.value = e.x;
      const i = indexFromX(e.x, width, count);
      if (i !== lastIdx.value) {
        lastIdx.value = i;
        runOnJS(onScrub)(i);
      }
    })
    .onFinalize(() => {
      touchX.value = null;
      lastIdx.value = -1;
      if (onEnd) runOnJS(onEnd)();
    });

  // Guide SNAPS to a bar's column centre (prototype parity: `calGuideX = 4 + i*step`,
  // never the raw finger). While dragging it tracks `lastIdx` (the column under the
  // finger, UI thread); otherwise it follows the externally-selected `active`. The
  // centre is gap-aware — columns are `flex:1` separated by `gap`, so the true centre
  // of column i is `i*(colW+gap) + colW/2`, not the gapless `(i+0.5)/count*width`.
  const guideStyle = useAnimatedStyle(() => {
    const idx = touchX.value != null ? lastIdx.value : active ?? -1;
    if (idx < 0 || width <= 0 || count <= 0) return { opacity: 0, transform: [{ translateX: 0 }] };
    const colW = (width - (count - 1) * gap) / count;
    const cx = idx * (colW + gap) + colW / 2;
    return { opacity: 1, transform: [{ translateX: cx - 1 }] }; // -1 centres the 2px line on cx
  });

  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={StyleSheet.absoluteFill}>
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, backgroundColor: colors.scrubGuide }, guideStyle]}
        />
      </View>
    </GestureDetector>
  );
}
