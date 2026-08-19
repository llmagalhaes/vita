/**
 * v4 three-panel shell (APP-096) — Trends · Day · Library co-mounted in one row
 * that the edge-swipe drags 1:1. Replaces the v3 `TabsPager` + `NavDots`.
 *
 * Lives once in `(main)/_layout` above the Stack and is shown only while the route
 * is a panel route; pushes (account, plan-setup, details) hide it. The route stays
 * the source of truth, so deep links and `router.replace` keep working.
 *
 * WHAT THIS FILE HAS BROKEN — do not undo:
 *  · session 6: growing the mounted-panel set mid-gesture recreated the pan and ate
 *    the swipe. v4 has three panels, so all three are simply always mounted — there
 *    is no `mounted` state to grow, and no setState runs during a drag.
 *    (ponytail: mount-always is the whole fix. If the Trends charts make the first
 *    paint heavy, defer *inside* TrendsPanel — never remount the slot.)
 *  · session 11: arbitration. Inner horizontal gestures (dock date picker, Trends
 *    scrub, timeline) still win via `blocksExternalGesture(tabsPagerRef)` — that ref
 *    now points at this pan, so `scrub.tsx` / `DockDatePicker.tsx` need zero edits.
 *  · CEO batch #1 (device): BOTH ways in were dead on the Samsung.
 *    - Tabs: `settle()` wrote `idxRef.current` BEFORE `router.replace`, so the
 *      route→panel effect below saw `idxRef.current === active` and returned — the
 *      route changed, the tab highlighted, and the row never translated. The drag
 *      path is the ONLY one allowed to pre-write `idxRef` (it already moved the row);
 *      every other move goes through `pick` and lets the effect animate.
 *    - Swipe: the prototype's 34px edge gate is unreachable on Android. Gesture
 *      navigation owns both screen edges (Samsung lets the user widen that inset
 *      further), so an edge drag is swallowed by the system back gesture and the
 *      user lands on the launcher. All three panels now pan from anywhere; the
 *      inner horizontal gestures still win through `blocksExternalGesture`.
 *
 * All decisions are the pure helpers in `panelPan.ts` (unit-tested); everything
 * here is shared-value work on the UI thread.
 */
import { useEffect, useRef } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, isDarkScene, motion, useAnySheetOpen, useSceneName } from "../ui";
import { setNavSwiped } from "../db/plan";
import { DayPanel } from "../day/DayPanel";
import { LibraryPanel } from "../library/LibraryPanel";
import { TrendsPanel } from "../trends/TrendsPanel";
import { PanelTabs } from "./PanelTabs";
import { tabsPagerRef } from "./pagerRef";
import { DAY_PANEL, PANEL_ROUTES, commitTarget, isVerticalVeto, panelIndex, rubberBand, shouldEngage } from "./panelPan";

const SNAP = { duration: motion.panelSnap.durationMs, easing: Easing.bezier(...motion.panelSnap.bezier) };

export function PanelShell() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const active = panelIndex(pathname);
  const onPanel = active >= 0;
  const scene = useSceneName();
  // Dark chrome only on the Day panel's evening scene (prototype `darkTop`).
  const dark = active === DAY_PANEL && isDarkScene(scene);
  // A sheet owns the screen while it is up: no panning underneath it.
  const sheetOpen = useAnySheetOpen();

  const startIdx = active < 0 ? DAY_PANEL : active;
  const idxRef = useRef(startIdx);

  const panel = useSharedValue(startIdx); // committed index, UI thread
  const tx = useSharedValue(-startIdx * width); // row translateX in px
  const startTx = useSharedValue(0);
  const engaged = useSharedValue(false); // passed |dx| ≥ 8
  const dead = useSharedValue(false); // vertical veto — dead for this gesture

  /** The drag committed: the row is already animating, so record the index here and
   *  let the route catch up (the effect below then no-ops). */
  const settle = (to: number) => {
    idxRef.current = to;
    setNavSwiped(); // the first real swipe retires the hint
    if (PANEL_ROUTES[to] !== pathname) router.replace(PANEL_ROUTES[to]);
  };

  /** Tab tap (and anything else that just wants a panel): change the route ONLY —
   *  the effect below owns the move. Writing `idxRef` here is what killed the tabs. */
  const pick = (to: number) => {
    if (PANEL_ROUTES[to] !== pathname) router.replace(PANEL_ROUTES[to]);
  };

  // Route → panel (tab tap, deep link, "Open this day →"). Same timing as the drag
  // snap, never the drag path.
  useEffect(() => {
    if (active < 0 || idxRef.current === active) return;
    idxRef.current = active;
    panel.value = active;
    tx.value = withTiming(-active * width, SNAP);
  }, [active, width, panel, tx]);

  // Rotation / resize: re-place the row without animating.
  useEffect(() => {
    if (!engaged.value) tx.value = -idxRef.current * width;
  }, [width, tx, engaged]);

  const pan = Gesture.Pan()
    .withRef(tabsPagerRef)
    .enabled(onPanel && !sheetOpen)
    .activeOffsetX([-8, 8]) // engage at |dx| ≥ 8 (panelGesture.minDxPx)
    .failOffsetY([-12, 12]) // and give up to a clearly vertical drag (the scroll wins)
    .onBegin(() => {
      engaged.value = false;
      dead.value = false;
      startTx.value = -panel.value * width;
    })
    .onUpdate((e) => {
      if (dead.value) return;
      if (!engaged.value) {
        // The veto only applies before engaging; after that the pointer is ours.
        if (isVerticalVeto(e.translationX, e.translationY)) {
          dead.value = true;
          return;
        }
        if (!shouldEngage(e.translationX)) return;
        engaged.value = true;
      }
      tx.value = startTx.value + rubberBand(panel.value, e.translationX, width);
    })
    .onEnd(() => {
      if (!engaged.value) return;
      const to = commitTarget(panel.value, tx.value - startTx.value);
      panel.value = to;
      tx.value = withTiming(-to * width, SNAP);
      runOnJS(settle)(to);
    })
    .onFinalize(() => {
      // A dead gesture may have nudged nothing, but snap back defensively.
      if (!engaged.value) tx.value = withTiming(-panel.value * width, SNAP);
      engaged.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  // Android back: from Trends/Library → Day, instead of exiting mid-flow.
  useEffect(() => {
    if (!onPanel) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (idxRef.current !== DAY_PANEL) {
        router.replace(PANEL_ROUTES[DAY_PANEL]);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [onPanel, router]);

  return (
    <View
      pointerEvents={onPanel ? "auto" : "none"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.canvas,
        display: onPanel ? "flex" : "none",
        overflow: "hidden",
      }}
    >
      {onPanel ? <StatusBar style={dark ? "light" : "dark"} /> : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: "row", flex: 1, width: width * PANEL_ROUTES.length }, rowStyle]}>
          <View style={{ width, flex: 1 }}>
            <TrendsPanel />
          </View>
          <View style={{ width, flex: 1 }}>
            <DayPanel />
          </View>
          <View style={{ width, flex: 1 }}>
            <LibraryPanel />
          </View>
        </Animated.View>
      </GestureDetector>
      <PanelTabs panel={active < 0 ? idxRef.current : active} dark={dark} onPick={pick} />
    </View>
  );
}
