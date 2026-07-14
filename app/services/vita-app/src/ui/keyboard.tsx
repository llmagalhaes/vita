import { useEffect, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * One keyboard mechanism for the whole app. In Expo Go SDK 56 with Android
 * edge-to-edge, `android:windowSoftInputMode=adjustResize` is NOT applied — the
 * window never resizes for the keyboard — so we can't lean on that. Everything
 * here is driven by RN's `Keyboard` events (guaranteed to fire in Expo Go, and
 * `endCoordinates.height` is the real keyboard height regardless of resize):
 *
 *  - `useKeyboardHeight()` — the live keyboard height in px, smoothed with
 *    Reanimated. iOS fires `*Will*` with a duration we match; Android only fires
 *    `*Did*`, so the lift lands just after the keyboard on Android.
 *  - `<KeyboardLift>` — translate an element pinned to the screen bottom up by
 *    that height (the capture pill, bottom sheets). Reanimated, so it rides the
 *    same value smoothly.
 *  - `<KeyboardAvoider>` — RN's stdlib KeyboardAvoidingView for fields that live
 *    inside a ScrollView / bottom-aligned view; shrinks the viewport so the
 *    focused field stays visible.
 */
export function useKeyboardHeight(): SharedValue<number> {
  const height = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      height.value = withTiming(e.endCoordinates.height, {
        duration: e.duration || 220,
        easing: Easing.out(Easing.cubic),
      });
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      height.value = withTiming(0, {
        duration: e.duration || 180,
        easing: Easing.out(Easing.cubic),
      });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height]);
  return height;
}

/**
 * Lift `children` above the keyboard. For overlays pinned to the bottom (pill,
 * sheets). `enabled` gates the lift so an always-mounted overlay (the pill) only
 * rises when its own field is the one that opened the keyboard.
 */
export function KeyboardLift({
  children,
  enabled = true,
  style,
}: {
  children: ReactNode;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const kb = useKeyboardHeight();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: enabled ? -kb.value : 0 }] }));
  return <Animated.View style={[style, lift]}>{children}</Animated.View>;
}

/**
 * Keep a focused field inside a ScrollView / bottom-aligned view visible. Plain
 * stdlib KeyboardAvoidingView (padding) — no adjustResize needed; it pads from
 * its own Keyboard-event measurement.
 * ponytail: `behavior="padding"` covers both platforms; if edge-to-edge Android
 * ever leaves a nav-bar-sized gap, add a keyboardVerticalOffset here.
 */
export function KeyboardAvoider({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}
