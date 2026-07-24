import { type ReactNode, useEffect, useId, useState } from "react";
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
import { setPopNode } from "./popHost";

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
  const id = useId();
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

  useSheetPresence(rendered); // hold the tab-bar hide through the fade-OUT (rendered, not
  // visible) so it doesn't pop back behind a still-fading backdrop — the abrupt-close flash (CEO)

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const overlay: ReactNode = rendered ? (
    <View key={id} style={{ position: "absolute", inset: 0, justifyContent: "center", paddingHorizontal, zIndex: 60 }}>
      <SheetBackdrop onClose={onClose} closeLabel={closeLabel} scrim={scrim} style={backdropStyle} />
      <Animated.View style={cardStyle}>{children}</Animated.View>
    </View>
  ) : null;

  // Portal the overlay to the app-root PopHost so it centers on the SCREEN, not the
  // tall ScrollView content it's declared inside (the "abre fora de foco" bug). Push
  // fresh every render; clear on unmount. (RN Modal would ANR here — see popHost.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPopNode(id, overlay));
  useEffect(() => () => setPopNode(id, null), [id]);

  return null;
}
