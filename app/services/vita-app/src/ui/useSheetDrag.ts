import { useEffect, useRef, useState } from "react";
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
 * Sheet entrance curve — the prototype's vtSheetUp: a monotone decelerate bezier,
 * zero overshoot (control-point y-values 0.9, 1 ≤ 1). A `withTiming`, NOT a spring:
 * springs underdamp and bounce (the APP-050 regression). Exported so the no-overshoot
 * regression test can assert the entrance stays a timing curve, not a spring.
 */
export const ENTRANCE_ANIM = {
  durationMs: motion.unfold.durationMs, // 450ms
  bezier: motion.unfold.bezier, // (.22,.9,.32,1)
} as const;

/**
 * The one bottom-sheet transition driver: rises on open (prototype vtSheetUp:
 * 450ms decelerate bezier, no overshoot), finger-follow drag,
 * and — the point of this hook — a programmatic close (save/confirm flips
 * `visible` false) that slides the sheet DOWN + fades the backdrop the SAME way a
 * drag-dismiss does, instead of unmounting instantly (the abrupt close, APP-042).
 *
 * One shared `translateY` powers all three paths. The component stays mounted via
 * the returned `rendered` flag until the slide-out finishes, so `return null`
 * happens AFTER the animation, not before. Only `close()`/`setRendered` cross to
 * JS via runOnJS — the finger-follow and spring-back stay on the UI thread.
 * `onSheetLayout` measures the real height so the exit clears the screen exactly.
 *
 * The ENTRANCE starts from `onSheetLayout`, not from the effect (CEO device round 3:
 * "é possível ver as etapas da renderização"). Flipping `visible` does not put a sheet
 * on screen — it takes three React commits (effect → `setRendered` → `usePortal`'s
 * `setPopNode` → PopHost) plus the native mount of the whole sheet body before a
 * single pixel exists. The old code started the 450ms tween in the first of those, so
 * the mount landed ON TOP of the running animation: the sheet's first visible frame
 * was already mid-flight, then each heavy child (a catalog list, a calendar grid)
 * appeared as it mounted — the "render stages". Waiting for layout costs the mount
 * time up front and buys a clean, uninterrupted UI-thread slide. It also fixes the
 * travel distance: the first open used to slide from FALLBACK_HEIGHT (700px) whatever
 * the sheet's real height, so short sheets hung off-screen and then whipped in.
 */
export function useSheetTransition(visible: boolean, close: () => void) {
  const translateY = useSharedValue(0);
  const height = useSharedValue(FALLBACK_HEIGHT);
  const [rendered, setRendered] = useState(visible);
  const entered = useRef(false); // this open's entrance has been started

  /** The rise itself. Idempotent per open, and always from the CURRENT height. */
  const rise = () => {
    entered.current = true;
    translateY.value = height.value; // exact travel — measured, not guessed
    translateY.value = withTiming(0, {
      duration: ENTRANCE_ANIM.durationMs, // 450ms — prototype vtSheetUp
      easing: Easing.bezier(...ENTRANCE_ANIM.bezier), // (.22,.9,.32,1) decelerate — no overshoot
    });
  };

  useEffect(() => {
    if (visible) {
      const mounted = rendered && entered.current; // reopened mid-close-animation
      translateY.value = height.value; // park off-screen…
      entered.current = false;
      // Mid-close the subtree never unmounted, so no layout event is coming and there
      // is nothing to wait for — it is already mounted and measured. Every other open
      // (including a sheet that mounts already-visible) waits for onSheetLayout.
      if (mounted) rise();
      else setRendered(true); // …mount, and rise from onSheetLayout below
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
    if (h <= 0) return;
    height.value = h + 24; // + the sheet's outer margin, so it fully clears
    if (!visible || entered.current) return; // later layouts (keyboard lift, content) only re-measure
    rise();
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
        translateY.value = withSpring(0, { damping: 30, stiffness: 220 }); // ζ≈1: settles, never overshoots
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacityAt(translateY.value, height.value) }));

  return { rendered, sheetStyle, backdropStyle, dragGesture, onSheetLayout };
}
