import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { motion } from "./tokens";
import { SheetBackdrop } from "./SheetBackdrop";
import { useSheetPresence } from "./sheetPresence";

/**
 * The app's one CENTERED pop-up chrome (prototype `vtPop`) — distinct from the
 * bottom-anchored `SheetOverlay`. A card scales in from .92 + fades over a blurred
 * backdrop, vertically centered; tapping the backdrop closes it. Used by the Macros
 * pop-up (APP-051 — the CEO's thrice-flagged "should be a pop-up, not a sheet") and
 * the eating-plan portion pop-up. No drag-to-dismiss (the prototype pops have none);
 * surfaces that need drag (check-in deck) keep their bespoke gesture.
 *
 * Children supply their own card(s) + shadow, so a pop can be one card (Macros) or a
 * stack (portion: totals card + slider card). Stays mounted through the exit tween.
 */
export function PopOverlay({
  visible,
  onClose,
  children,
  closeLabel,
  scrim = "light",
  paddingHorizontal = 26,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  scrim?: "light" | "dark";
  paddingHorizontal?: number;
}) {
  const progress = useSharedValue(0); // 0 hidden → 1 shown
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      progress.value = withTiming(1, {
        duration: motion.pop.durationMs, // 300–350ms — vtPop
        easing: Easing.bezier(...motion.pop.bezier), // (.2,.8,.3,1)
      });
    } else if (rendered) {
      progress.value = withTiming(0, { duration: motion.fade.durationMs }, (finished) => {
        if (finished) runOnJS(setRendered)(false); // unmount only after the fade-out
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useSheetPresence(visible); // hide the floating tab bar while the pop is up (CEO #1)

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!rendered) return null;
  return (
    <View style={{ position: "absolute", inset: 0, justifyContent: "center", paddingHorizontal, zIndex: 60 }}>
      <SheetBackdrop onClose={onClose} closeLabel={closeLabel} scrim={scrim} style={backdropStyle} />
      <Animated.View style={cardStyle}>{children}</Animated.View>
    </View>
  );
}
