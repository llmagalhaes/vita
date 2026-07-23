import { useEffect, useRef, useState } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors } from "../ui";
import { setNavSwiped } from "../db/plan";
import { tabsPagerRef } from "./pagerRef";
import Today from "../tabs/Today";
import Home from "../tabs/Home";
import Trends from "../tabs/Trends";
import Habits from "../tabs/Habits";
import Integrations from "../tabs/Integrations";

/**
 * The six top-level tabs (Today · Home · Trends · Workout · Habits · Integrations)
 * co-mounted in one finger-following horizontal pager (v3 nav, APP-084). Lives once
 * in the (main) layout above the Stack, shown only while the route is a tab. Route
 * files stay null placeholders that keep the pathname alive for the dot strip and
 * deep links. Swipe and dot-tap both animate and stay in sync with expo-router.
 *
 * The Workout slot is referenced BY ROUTE via a deferred require — the other v3
 * builder owns src/tabs/WorkoutHub; the require resolves at runtime when that slot
 * first mounts, so this file never statically imports it.
 *
 * GESTURE ARBITRATION unchanged: inner horizontal pans (Trends scrub, Timeline day
 * swipe) win via `Gesture.Pan().blocksExternalGesture(tabsPagerRef)`; the pager
 * only claims clearly-horizontal drags (activeOffsetX ±14) and fails on vertical.
 */

export const TAB_ROUTES = ["/today", "/home", "/trends", "/workout", "/habits", "/integrations"] as const;
const LAST = TAB_ROUTES.length - 1;

/** Pure: route path → tab index; detail/unknown routes → -1. Tested. */
export function tabIndex(pathname: string): number {
  return TAB_ROUTES.indexOf(pathname as (typeof TAB_ROUTES)[number]);
}

/** The slots to keep mounted around `active` (self ± 1, clamped). Tested. */
export function neighborsToMount(active: number): number[] {
  return [active - 1, active, active + 1].filter((i) => i >= 0 && i <= LAST);
}

const SNAP_DIST_FRAC = 0.5; // dragged past half a page → commit to the neighbour
const SNAP_VEL = 500; // px/s flick threshold

/**
 * Pure snap decision (worklet-safe, tested). One swipe moves AT MOST one page from
 * the page the drag STARTED on — no velocity-projected multi-page jumps (APP-043).
 * translationX/velocityX follow gesture-handler signs. Returns a clamped [0,LAST].
 */
export function snapTarget(startPage: number, translationX: number, velocityX: number, width: number): number {
  "worklet";
  const base = Math.round(startPage);
  const w = Math.max(width, 1);
  const dragToNext = -translationX / w;
  const flickToNext = -velocityX;
  let dir = 0;
  if (dragToNext > SNAP_DIST_FRAC || flickToNext > SNAP_VEL) dir = 1;
  else if (dragToNext < -SNAP_DIST_FRAC || flickToNext < -SNAP_VEL) dir = -1;
  return Math.max(0, Math.min(LAST, base + dir));
}

const SPRING = { damping: 22, stiffness: 210, mass: 0.9 } as const;

/** Deferred require so the Workout slot references its route without a static import. */
function WorkoutSlot() {
  const WorkoutHub = (require("../tabs/WorkoutHub") as { default: React.ComponentType }).default;
  return <WorkoutHub />;
}

export function TabsPager() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const active = tabIndex(pathname);
  const onTab = active >= 0;
  const startIdx = active < 0 ? 1 : active;

  // Lazy mount: co-mounting 6 chart-heavy screens is the perf risk. Start with only
  // the current slot; grow to current ± 1 from a DEFERRED effect after settle (never
  // mid-gesture — the setState recreates the pan and eats the swipe, session-6).
  const [mounted, setMounted] = useState<boolean[]>(() => {
    const arr = Array<boolean>(TAB_ROUTES.length).fill(false);
    arr[startIdx] = true;
    return arr;
  });
  const ensure = (i: number) => {
    if (i < 0 || i > LAST) return;
    setMounted((m) => (m[i] ? m : m.map((v, k) => v || k === i)));
  };

  const index = useSharedValue(startIdx); // page units; float mid-drag
  const start = useSharedValue(0);
  const gestureDriven = useSharedValue(false);
  const idxRef = useRef(startIdx);

  // JS-thread mirror of "a pan is active". Growing the mounted set mid-swipe recreates
  // the pan and eats the gesture (session-6 dead-swipe). We defer neighbour mounts
  // until no pan is active; `gesturing` re-arms the effect when the pan ends.
  const [gesturing, setGesturing] = useState(false);
  const gesturingRef = useRef(false);
  useEffect(() => {
    gesturingRef.current = gesturing;
  }, [gesturing]);

  const settle = (to: number, viaGesture: boolean) => {
    idxRef.current = to;
    if (viaGesture) setNavSwiped(); // a real swipe retires the one-time SWIPE hint
    if (TAB_ROUTES[to] !== pathname) router.replace(TAB_ROUTES[to]);
  };

  useEffect(() => {
    if (active < 0) return;
    ensure(active);
    if (idxRef.current !== active) {
      idxRef.current = active;
      index.value = withSpring(active, SPRING);
    }
    const id = setTimeout(() => {
      if (gesturingRef.current) return; // a pan started — the pan-end effect re-arms this
      ensure(active - 1);
      ensure(active + 1);
    }, 350);
    return () => clearTimeout(id);
    // `gesturing` in deps so a settled pan re-runs the deferred neighbour mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, gesturing]);

  const pan = Gesture.Pan()
    .withRef(tabsPagerRef)
    .activeOffsetX([-14, 14])
    .failOffsetY([-18, 18])
    .onBegin(() => {
      start.value = index.value;
      gestureDriven.value = false;
      runOnJS(setGesturing)(true);
    })
    .onUpdate((e) => {
      const raw = start.value - e.translationX / Math.max(width, 1);
      index.value = Math.max(-0.15, Math.min(LAST + 0.15, raw)); // rubber-band past ends
      if (Math.abs(e.translationX) > 4) gestureDriven.value = true;
    })
    .onEnd((e) => {
      const to = snapTarget(start.value, e.translationX, e.velocityX, width);
      index.value = withSpring(to, SPRING);
      runOnJS(settle)(to, true);
    })
    .onFinalize(() => {
      runOnJS(setGesturing)(false); // pan done → let the effect grow neighbours
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -index.value * width }],
  }));

  // Android back: from any non-Home tab → Home instead of exiting mid-flow.
  useEffect(() => {
    if (!onTab) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (idxRef.current !== 1) {
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
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, display: onTab ? "flex" : "none", overflow: "hidden" }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: "row", flex: 1, width: width * TAB_ROUTES.length }, rowStyle]}>
          <View style={{ width, flex: 1 }}>{mounted[0] && <Today />}</View>
          <View style={{ width, flex: 1 }}>{mounted[1] && <Home />}</View>
          <View style={{ width, flex: 1 }}>{mounted[2] && <Trends />}</View>
          <View style={{ width, flex: 1 }}>{mounted[3] && <WorkoutSlot />}</View>
          <View style={{ width, flex: 1 }}>{mounted[4] && <Habits />}</View>
          <View style={{ width, flex: 1 }}>{mounted[5] && <Integrations />}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
