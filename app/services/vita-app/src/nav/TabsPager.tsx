import { useEffect, useRef, useState } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors } from "../ui";
import Home from "../tabs/Home";
import Trends from "../tabs/Trends";
import Habits from "../tabs/Habits";

/**
 * The three top-level tabs (Today / Trends / Habits) co-mounted in one
 * finger-following horizontal pager. Lives once in the (main) layout, above the
 * Stack, and is shown only while the current route is a tab. The Stack still
 * renders push/detail screens; the tab route files are null placeholders that
 * keep /home /trends /habits alive so usePathname()-based pill state and deep
 * links keep working. Swipe and pill-tap both animate and both stay in sync
 * with expo-router.
 *
 * GESTURE ARBITRATION — inner horizontal pans (trends scrub, etc.) win like so:
 *   import { tabsPagerRef } from "../nav/TabsPager";
 *   Gesture.Pan().blocksExternalGesture(tabsPagerRef)...
 * The pager waits for that gesture to fail before activating, so the inner drag
 * wins. The pager also only claims clearly-horizontal drags (activeOffsetX ±14)
 * and fails on vertical intent (failOffsetY ±18), so vertical ScrollViews and
 * the mic hold-drag are never stolen.
 */

export const TAB_ROUTES = ["/home", "/trends", "/habits"] as const;

/** Pure: route path → tab index; detail/unknown routes → -1. Tested. */
export function tabIndex(pathname: string): number {
  return TAB_ROUTES.indexOf(pathname as (typeof TAB_ROUTES)[number]);
}

// One pager instance app-wide → a module-level ref is safe. Inner gestures
// import this and pass it to .blocksExternalGesture().
export const tabsPagerRef: { current: GestureType | undefined } = { current: undefined };

const SPRING = { damping: 22, stiffness: 210, mass: 0.9 } as const;

export function TabsPager() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const active = tabIndex(pathname);
  const onTab = active >= 0;

  // Home eager; Trends (heavy) and Habits mount on first approach (pan begin) or
  // when navigated to directly, then stay mounted for instant returns.
  const [mounted, setMounted] = useState([true, false, false]);
  const ensure = (i: number) => {
    if (i < 0 || i > 2) return;
    setMounted((m) => (m[i] ? m : m.map((v, k) => v || k === i)));
  };

  const index = useSharedValue(active < 0 ? 0 : active); // page units; float mid-drag
  const start = useSharedValue(0);
  const idxRef = useRef(active < 0 ? 0 : active);

  const settle = (to: number) => {
    idxRef.current = to;
    if (TAB_ROUTES[to] !== pathname) router.replace(TAB_ROUTES[to]);
  };
  const ensureNeighbors = (from: number) => {
    ensure(from - 1);
    ensure(from + 1);
  };

  // Follow whatever route the app navigated to (pill tap / deep link / back).
  useEffect(() => {
    if (active < 0) return;
    ensure(active);
    if (idxRef.current !== active) {
      idxRef.current = active;
      index.value = withSpring(active, SPRING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pan = Gesture.Pan()
    .withRef(tabsPagerRef)
    .activeOffsetX([-14, 14])
    .failOffsetY([-18, 18])
    .onBegin(() => {
      start.value = index.value;
      runOnJS(ensureNeighbors)(idxRef.current);
    })
    .onUpdate((e) => {
      const raw = start.value - e.translationX / Math.max(width, 1);
      index.value = Math.max(-0.15, Math.min(2.15, raw)); // rubber-band past ends
    })
    .onEnd((e) => {
      const v = e.velocityX / Math.max(width, 1);
      const to = Math.max(0, Math.min(2, Math.round(index.value - v * 0.25)));
      index.value = withSpring(to, SPRING);
      runOnJS(settle)(to);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -index.value * width }],
  }));

  // Android back: from Trends/Habits → Today instead of exiting mid-flow.
  useEffect(() => {
    if (!onTab) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (idxRef.current > 0) {
        router.replace("/home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [onTab, router]);

  return (
    <View
      pointerEvents={onTab ? "auto" : "none"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bg,
        display: onTab ? "flex" : "none",
        overflow: "hidden",
      }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: "row", flex: 1, width: width * 3 }, rowStyle]}>
          <View style={{ width, flex: 1 }}>{mounted[0] && <Home />}</View>
          <View style={{ width, flex: 1 }}>{mounted[1] && <Trends />}</View>
          <View style={{ width, flex: 1 }}>{mounted[2] && <Habits />}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
