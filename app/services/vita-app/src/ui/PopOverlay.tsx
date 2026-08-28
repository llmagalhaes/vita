import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
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
import { POP_ROUTE, isPopScreenOpen, setPopScreen } from "./popScreen";

type PopProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  scrim?: "light" | "dark";
  paddingHorizontal?: number;
  /**
   * R19 (APP-142) — present this pop as an OS modal screen (`/pop`, see `popScreen`)
   * instead of animating it here. Opt-in per surface: the two the CEO flagged as
   * stuttery (Macros, the meal PortionPop) take it; the small pops (water, weight, the
   * plan screen's portion pop) keep the JS chrome below, which nobody has complained
   * about and which costs nothing to leave alone.
   */
  native?: boolean;
};

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
 *
 * Two presentations behind one API: `native` (R19) hands the card to the OS as a
 * transparent modal SCREEN; without it the JS chrome below animates it in place.
 */
export function PopOverlay(props: PopProps) {
  return props.native ? <NativePop {...props} /> : <JsPop {...props} />;
}

/**
 * R19 — the same card, presented by the OS. Nothing animates here: the content goes
 * to the pop-screen store and `/pop` is pushed, so the fade runs on the platform's
 * animator. (RN `Modal` stays forbidden — session 21. A screens modal is a real screen
 * inside the same GestureHandlerRootView, so the slider's Pan still fires.)
 */
function NativePop({ visible, onClose, children, closeLabel, scrim = "light", paddingHorizontal = 26 }: PopProps) {
  const id = useId();
  const router = useRouter();
  const pushed = useRef(false);
  // The screen outlives `visible` (it is still fading out) and fires this on unmount:
  // it must be the CURRENT close, or the stale one would re-apply its write.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useSheetPresence(visible); // same contract as the JS pop: the capture pill hides under it

  const node = visible ? (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal }}>
      {/* `inline`: the screen renders INSIDE `AppBlurTarget` (the root Stack is its
          child), and an Android BlurView inside its own blur target is an hwui
          infinite recursion → RenderThread SIGSEGV (sessions 23 + 24). So Android
          keeps the scrim and drops the blur; iOS needs no target and keeps the real
          material. `style` (not the default FadeIn) because the OS already fades the
          whole screen — a second JS fade on top is exactly what R19 removes. */}
      <SheetBackdrop onClose={onClose} closeLabel={closeLabel} scrim={scrim} inline style={{ opacity: 1 }} />
      <View>{children}</View>
    </View>
  ) : null;

  // Pushed every render, like the PopHost portal, so the card's callbacks stay fresh.
  // Only while OPEN: on close the last card must keep drawing through the OS fade-out,
  // and `PopScreenContent`'s unmount is what clears it.
  // `!pushed.current` is the closed→open transition: this effect runs BEFORE the push
  // effect below in the same commit, so on the opening render the flag is still false.
  // It stamps a new open, which is what keeps a still-fading-out previous screen from
  // closing this one on ITS unmount (F1).
  useEffect(() => {
    if (visible) setPopScreen(id, node, closeRef, !pushed.current);
  });

  useEffect(() => {
    if (visible && !pushed.current) {
      pushed.current = true;
      router.push(POP_ROUTE);
    } else if (!visible && pushed.current) {
      pushed.current = false;
      // Dismissed from the inside (back gesture, hardware back) the screen is already
      // gone and `onClose` came FROM it — popping again would take the panel with it.
      if (isPopScreenOpen()) router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Owner unmounted with the pop up (a meal node re-keyed underneath it): don't strand
  // a modal with no content in it.
  useEffect(
    () => () => {
      setPopScreen(id, null, closeRef);
      if (pushed.current && isPopScreenOpen()) router.back();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  return null;
}

function JsPop({ visible, onClose, children, closeLabel, scrim = "light", paddingHorizontal = 26 }: PopProps) {
  const id = useId();
  const progress = useSharedValue(0); // 0 hidden → 1 shown
  const [rendered, setRendered] = useState(visible);
  const entered = useRef(false); // this open's entrance has been started

  /** Same rule as `useSheetTransition`: the tween starts once the card has actually
   *  mounted and laid out, never in the effect. `visible` only *schedules* a mount —
   *  the portal hop plus the card's own children still have to commit, and starting
   *  the 300ms tween before that made the pop appear mid-flight, in stages (CEO). */
  const rise = () => {
    entered.current = true;
    progress.value = withTiming(1, {
      duration: motion.pop.durationMs, // 300–350ms — vtPop
      easing: Easing.bezier(...motion.pop.bezier), // (.2,.8,.3,1)
    });
  };
  const onCardLayout = () => {
    if (visible && !entered.current) rise();
  };

  useEffect(() => {
    if (visible) {
      const mounted = rendered && entered.current; // reopened mid-fade-out: already laid out
      entered.current = false;
      if (mounted) rise();
      else setRendered(true); // rise from onCardLayout
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
      <Animated.View onLayout={onCardLayout} style={cardStyle}>
        {children}
      </Animated.View>
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
