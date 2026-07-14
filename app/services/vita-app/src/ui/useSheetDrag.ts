import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { shouldDismiss } from "../capture/sheet";

/**
 * Drag-down-to-dismiss for bottom sheets. Both the finger-follow and the release
 * decision run inside the gesture worklet (UI thread), so the spring-back never
 * round-trips to JS — only `close()` crosses. That JS hop on release was the jank
 * (CEO bug #3). Shared by the Capture / Check-in / Review sheets.
 */
export function useSheetDrag(close: () => void) {
  const dragY = useSharedValue(0);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));
  const dragGesture = Gesture.Pan()
    .activeOffsetY(10) // only claim a clear downward drag — button taps still work
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (shouldDismiss(e.translationY, e.velocityY)) {
        dragY.value = 0; // sheet is persistently mounted — reset so it reopens at rest
        runOnJS(close)();
      } else {
        dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });
  return { dragGesture, sheetStyle };
}
