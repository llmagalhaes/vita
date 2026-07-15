import { useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { backdropOpacityAt, shouldDismiss } from "../capture/sheet";
import { motion } from "./tokens";

const CLOSE_MS = 260; // slide-out duration for a programmatic (save/confirm) close
const FALLBACK_HEIGHT = 700; // used until the sheet has laid out and measured itself

/**
 * The one bottom-sheet transition driver: spring-in on open, finger-follow drag,
 * and — the point of this hook — a programmatic close (save/confirm flips
 * `visible` false) that slides the sheet DOWN + fades the backdrop the SAME way a
 * drag-dismiss does, instead of unmounting instantly (the abrupt close, APP-042).
 *
 * One shared `translateY` powers all three paths. The component stays mounted via
 * the returned `rendered` flag until the slide-out finishes, so `return null`
 * happens AFTER the animation, not before. Only `close()`/`setRendered` cross to
 * JS via runOnJS — the finger-follow and spring-back stay on the UI thread.
 * `onSheetLayout` measures the real height so the exit clears the screen exactly.
 */
export function useSheetTransition(visible: boolean, close: () => void) {
  const translateY = useSharedValue(0);
  const height = useSharedValue(FALLBACK_HEIGHT);
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      translateY.value = height.value; // start off-screen…
      setRendered(true); // …mount…
      translateY.value = withSpring(0, { damping: 20, stiffness: 210 }); // …and rise
    } else if (rendered) {
      translateY.value = withTiming(
        height.value,
        { duration: CLOSE_MS, easing: Easing.bezier(...motion.pop.bezier) },
        (finished) => {
          if (finished) runOnJS(setRendered)(false); // unmount only after the slide-out
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) height.value = h + 24; // + the sheet's outer margin, so it fully clears
  };

  const dragGesture = Gesture.Pan()
    .activeOffsetY(10) // only claim a clear downward drag — button taps still work
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (shouldDismiss(e.translationY, e.velocityY)) {
        // Hand off to the same programmatic path: close() flips visible→false and
        // the effect above continues the slide-out from wherever the finger left it.
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacityAt(translateY.value, height.value) }));

  return { rendered, sheetStyle, backdropStyle, dragGesture, onSheetLayout };
}
