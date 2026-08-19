import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { tabsPagerRef } from "../nav/pagerRef";

/** Touch x → the BAR under the finger (`floor`, the prototype's `mkI`). Pure/tested. */
export const indexFromX = (x: number, width: number, count: number): number => {
  "worklet";
  return width <= 0 || count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.floor((x / width) * count)));
};

/**
 * Touch x → the NEAREST VERTEX (`round`, the prototype's `wtI`). The weight line has
 * points, not columns, so it snaps to the closest reading instead of the slot the
 * finger is inside — a deliberate difference from the bars, not an oversight.
 */
export const nearestIndexFromX = (x: number, width: number, count: number): number => {
  "worklet";
  return width <= 0 || count <= 1 ? 0 : Math.max(0, Math.min(count - 1, Math.round((x / width) * (count - 1))));
};

/**
 * Scrub-and-PIN overlay (APP-100). Absolute-fills its chart; the same gesture-handler
 * Pan + runOnJS pattern as Slider, no new deps.
 *
 * The v4 rule (README §3): pointer-down selects, a move updates AND marks the gesture
 * as moved, release clears the selection **only if it moved** — so a tap PINS the bar
 * and a drag is transient. The pinned index is owned by the panel (one pin across all
 * four charts), which is why this component holds no selection state of its own.
 *
 * It wins the horizontal drag against the panel edge-swipe: `blocksExternalGesture`
 * makes the shell's pan wait for this one to fail, and `activeOffsetX`/`failOffsetY`
 * claim clear horizontal moves only — a vertical drag falls through to the ScrollView.
 */
export function ScrubOverlay({
  count,
  snap = "bar",
  onScrub,
  onEnd,
  accessibilityLabel,
}: {
  count: number;
  /** `bar` = the column under the finger · `vertex` = the nearest point (weight line). */
  snap?: "bar" | "vertex";
  onScrub: (index: number) => void;
  /** Release after a real drag — the panel drops the pin. Not called on a tap. */
  onEnd?: () => void;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const startIdx = useSharedValue(-1);
  const lastIdx = useSharedValue(-1);
  const moved = useSharedValue(false);

  const vertex = snap === "vertex";

  const pan = Gesture.Pan()
    .blocksExternalGesture(tabsPagerRef)
    .activeOffsetX([-10, 10])
    .failOffsetY([-16, 16])
    .onBegin((e) => {
      const i = vertex ? nearestIndexFromX(e.x, width, count) : indexFromX(e.x, width, count);
      startIdx.value = i;
      lastIdx.value = i;
      moved.value = false;
      runOnJS(onScrub)(i);
    })
    .onUpdate((e) => {
      const i = vertex ? nearestIndexFromX(e.x, width, count) : indexFromX(e.x, width, count);
      if (i !== startIdx.value) moved.value = true;
      if (i !== lastIdx.value) {
        lastIdx.value = i;
        runOnJS(onScrub)(i);
      }
    })
    .onFinalize(() => {
      const drag = moved.value;
      startIdx.value = -1;
      lastIdx.value = -1;
      moved.value = false;
      if (drag && onEnd) runOnJS(onEnd)(); // a tap keeps the pin; a drag lets go
    });

  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}
