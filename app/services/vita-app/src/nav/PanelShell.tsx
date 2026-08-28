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
 *      route changed, the tab highlighted, and the row never translated. The rule
 *      that came out of it and still holds: whoever writes `idxRef` MUST also move
 *      the row. The drag does it on the UI thread, `pick` does it inline, and the
 *      route→panel effect below does it for everything external (deep links, "Open
 *      this day →"), which is why that effect returns early when `idxRef` matches.
 *    - Swipe: the prototype's 34px edge gate is unreachable on Android. Gesture
 *      navigation owns both screen edges (Samsung lets the user widen that inset
 *      further), so an edge drag is swallowed by the system back gesture and the
 *      user lands on the launcher. All three panels now pan from anywhere; the
 *      inner horizontal gestures still win through `blocksExternalGesture`.
 *  · CEO device round 3 ("leve travadinha", both directions): the DRAG is pure UI
 *    thread, so the hitch was the SETTLE. `router.replace` fired one frame into the
 *    300ms snap tween and RN mounts a commit on the UI thread — so the tween shared
 *    the frame with (i) all three panel trees re-rendering (they were plain children
 *    of this render), (ii) TrendsPanel's focus epoch re-keying and REMOUNTING every
 *    chart, (iii) CapturePill + the Stack's screen swap, (iv) `setNavSwiped()`, a
 *    SYNCHRONOUS sqlite write, on every single commit. Fixes, in order of size:
 *      1. the three panels are `useMemo`'d, so re-rendering this shell no longer
 *         re-renders them (same element ref → React bails out of the subtree);
 *      2. the URL commit is deferred past the snap — nothing on screen depends on it,
 *         the row is already animating from shared values, and `shown` keeps the tabs
 *         in step immediately so the chip still tweens with the panel;
 *      3. the hint write is latched to once per session.
 *
 * All decisions are the pure helpers in `panelPan.ts` (unit-tested); everything
 * here is shared-value work on the UI thread.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { POP_ROUTE, colors, isDarkScene, motion, useAnySheetOpen, useSceneName } from "../ui";
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
  /** R19 (APP-142): `/pop` is a TRANSPARENT modal screen on the root stack — the panel
   *  it was opened from is what shows through it, so the shell must keep drawing (it
   *  already takes no touches off-panel). Without this the pop opens over bare canvas. */
  const under = pathname === POP_ROUTE;
  const scene = useSceneName();
  // A sheet owns the screen while it is up: no panning underneath it.
  const sheetOpen = useAnySheetOpen();

  const startIdx = active < 0 ? DAY_PANEL : active;
  const idxRef = useRef(startIdx);
  /** The panel the CHROME shows (tabs, status bar). Tracks the row, not the URL —
   *  the swipe's URL commit is deferred (see below) and the chip must not lag it. */
  const [shown, setShown] = useState(startIdx);
  // Dark chrome only on the Day panel's evening scene (prototype `darkTop`).
  const dark = shown === DAY_PANEL && isDarkScene(scene);

  const panel = useSharedValue(startIdx); // committed index, UI thread
  const tx = useSharedValue(-startIdx * width); // row translateX in px
  const startTx = useSharedValue(0);
  const engaged = useSharedValue(false); // passed |dx| ≥ 8
  const dead = useSharedValue(false); // vertical veto — dead for this gesture

  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintOwed = useRef(false); // a real swipe landed; retire the hint with the URL
  useEffect(() => () => { if (urlTimer.current) clearTimeout(urlTimer.current); }, []);

  /**
   * Land on panel `to`: index + chrome now, URL after the snap has finished.
   * The URL is the only part of the move nothing on screen is waiting for, and
   * committing it drags a whole React tree (Trends re-keys and REMOUNTS every chart,
   * the pill re-renders, the Stack swaps its placeholder screen) onto the UI thread
   * mid-tween — the CEO's "leve travadinha". `idxRef`/`shown` still move instantly, so
   * the tab chip tweens with the row exactly as before; only the URL lags, invisibly.
   *
   * NB the header's rule still holds: whoever pre-writes `idxRef` must also have moved
   * the row (the drag already did on the UI thread; `pick` does it below).
   */
  const goto = (to: number) => {
    idxRef.current = to;
    setShown(to); // cheap now: the memoized panels below bail out of this render
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      urlTimer.current = null;
      if (hintOwed.current) {
        hintOwed.current = false;
        setNavSwiped(); // the first real swipe retires the hint (a SYNCHRONOUS sqlite write)
      }
      const at = idxRef.current; // a second move may have landed inside the window
      if (PANEL_ROUTES[at] !== pathname) router.replace(PANEL_ROUTES[at]);
    }, SNAP.duration);
  };

  /** The drag committed: the row is already animating from the UI thread. */
  const settle = (to: number) => {
    hintOwed.current = true;
    goto(to);
  };

  /** Tab tap (and anything else that just wants a panel). It moves the row itself —
   *  the route→panel effect can't be relied on while the URL is deferred (tapping back
   *  to the panel the URL still points at would change nothing and leave the tab dead:
   *  the CEO-batch-#1 bug, one layer down). */
  const pick = (to: number) => {
    if (idxRef.current === to) return;
    panel.value = to;
    tx.value = withTiming(-to * width, SNAP);
    goto(to);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick; // the back handler subscribes once; keep it on the live closure

  // Route → panel (tab tap, deep link, "Open this day →"). Same timing as the drag
  // snap, never the drag path.
  useEffect(() => {
    if (active < 0 || idxRef.current === active) return;
    idxRef.current = active;
    setShown(active);
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

  /** The three panels are the app. Kept as ONE memoized element so that re-rendering
   *  this shell (route settle, sheet open/close, scene tick) hands `Animated.View` the
   *  same child reference and React bails out of all three subtrees instead of running
   *  a full render pass over them — the bulk of the settle frame. Only a width change
   *  (rotation) rebuilds them. */
  const panels = useMemo(
    () => (
      <>
        <View style={{ width, flex: 1 }}>
          <TrendsPanel />
        </View>
        <View style={{ width, flex: 1 }}>
          <DayPanel />
        </View>
        <View style={{ width, flex: 1 }}>
          <LibraryPanel />
        </View>
      </>
    ),
    [width],
  );

  // Android back: from Trends/Library → Day, instead of exiting mid-flow. Goes through
  // `pick` (not a bare replace) — pressed inside the deferred-URL window the route still
  // reads "/day" and a replace to it would change nothing, leaving back dead.
  useEffect(() => {
    if (!onPanel) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (idxRef.current === DAY_PANEL) return false;
      pickRef.current(DAY_PANEL);
      return true;
    });
    return () => sub.remove();
  }, [onPanel]);

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
        display: onPanel || under ? "flex" : "none",
        overflow: "hidden",
      }}
    >
      {onPanel || under ? <StatusBar style={dark ? "light" : "dark"} /> : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flexDirection: "row", flex: 1, width: width * PANEL_ROUTES.length }, rowStyle]}>
          {panels}
        </Animated.View>
      </GestureDetector>
      {/* Portaled to PopHost (blur target), so the shell's display:none can't hide it —
          mount it only on panel routes or the pill floats over pushed screens (builders,
          account, plan-setup; caught by the v4.2 emulator drive). */}
      {onPanel ? <PanelTabs panel={shown} dark={dark} onPick={pick} /> : null}
    </View>
  );
}
