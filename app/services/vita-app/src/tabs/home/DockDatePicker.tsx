import { useEffect, useMemo } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, fonts, shadowTooltip, useAccent } from "../../ui";
import { tabsPagerRef } from "../../nav/pagerRef";
import { selectionTick } from "../../lib/haptics";
import {
  AMPLITUDE,
  IDLE_SELECTED_SCALE,
  LIFT_PX,
  NDAYS,
  dotCenter,
  gaussian,
  hoverIndex,
  offsetForIndex,
  spreadFor,
} from "./dock";

const ROW_H = 44;
const DOT = 7;
// The CSS spring `transform .55s cubic-bezier(.34,1.56,.64,1)` — an overshoot
// bezier. Driving the single `drag` value 1→0 with it reproduces the settle.
const SETTLE = { duration: 550, easing: Easing.bezier(0.34, 1.56, 0.64, 1) } as const;

/**
 * One dock dot. Its whole appearance is a blend between the drag state (pure
 * Gaussian magnifier under the finger) and the idle state (selected dot rests
 * at 1.85×, accent). `drag` (1 while held → 0 on release, via the overshoot
 * bezier) is the blend factor, so the release "spring back" is one animated
 * value — no per-frame withSpring. Grows upward via transformOrigin bottom.
 */
function Dot({
  i,
  fingerX,
  drag,
  rowWidth,
  selected,
  accent,
}: {
  i: number;
  fingerX: SharedValue<number>;
  drag: SharedValue<number>;
  rowWidth: SharedValue<number>;
  selected: SharedValue<number>;
  accent: string;
}) {
  const style = useAnimatedStyle(() => {
    const slot = rowWidth.value / NDAYS;
    const mag = slot > 0 ? gaussian(Math.abs(fingerX.value - dotCenter(i, slot)), spreadFor(slot)) : 0;
    const isSel = offsetForIndex(i) === selected.value ? 1 : 0;
    const d = drag.value;

    const dragScale = 1 + AMPLITUDE * mag;
    const idleScale = isSel ? IDLE_SELECTED_SCALE : 1;
    const scale = idleScale + (dragScale - idleScale) * d;

    const ty = -(LIFT_PX * mag) * d;

    const dragOpacity = 0.5 + 0.5 * mag;
    const idleOpacity = isSel ? 1 : 0.85;
    const opacity = idleOpacity + (dragOpacity - idleOpacity) * d;

    // colour: idle → accent if selected else dotIdle; drag → tint by mag.
    const colorT = isSel * (1 - d) + mag * d;
    return {
      transform: [{ translateY: ty }, { scale }],
      opacity,
      backgroundColor: interpolateColor(colorT, [0, 1], [colors.dotIdle, accent]),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          transformOrigin: "center bottom",
        },
        style,
      ]}
    />
  );
}

/** The per-dot tooltip pill — static text (`dayDates[9-i]`), shown only on the hover dot. */
function Tip({
  i,
  fingerX,
  dragging,
  rowWidth,
  label,
  accent,
}: {
  i: number;
  fingerX: SharedValue<number>;
  dragging: SharedValue<boolean>;
  rowWidth: SharedValue<number>;
  label: string;
  accent: string;
}) {
  const style = useAnimatedStyle(() => {
    const slot = rowWidth.value / NDAYS;
    const isHover = dragging.value && slot > 0 && hoverIndex(fingerX.value, slot) === i;
    return {
      opacity: withTiming(isHover ? 1 : 0, { duration: isHover ? 130 : 90 }),
      transform: [{ scale: withTiming(isHover ? 1 : 0.6, { duration: 200 }) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          bottom: 26,
          alignSelf: "center",
          backgroundColor: accent,
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: 9,
          ...shadowTooltip,
        },
        style,
      ]}
    >
      <Animated.Text
        style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 0.3, color: "#FFF9F1" }}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
      {/* downward triangle */}
      <View
        style={{
          position: "absolute",
          top: "100%",
          alignSelf: "center",
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderTopWidth: 5,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: accent,
        }}
      />
    </Animated.View>
  );
}

/**
 * Dock date picker (Home v2) — 10 dots, a macOS-magnifier Gaussian drag with a
 * per-crossing haptic tick + tooltip, committing the selected day only on
 * release. All continuous motion runs on the UI thread; React state changes
 * (goDay) fire once, on release, and only when the day actually changed. Owns
 * the touch from touch-down (like the prototype's `touch-action:none`).
 *
 * `dayDates` are the 10 tooltip labels indexed by dot (dot i → dayDates[i]);
 * the caller passes them newest-last so dayDates[9] is today.
 */
export function DockDatePicker({
  selectedOffset,
  goDay,
  dayDates,
}: {
  selectedOffset: number;
  goDay: (offset: number) => void;
  dayDates: string[];
}) {
  const accent = useAccent();
  const rowWidth = useSharedValue(0);
  const fingerX = useSharedValue(0);
  const drag = useSharedValue(0); // 1 held → 0 settled (blend factor)
  const dragging = useSharedValue(false); // instant flag, drives tooltip/hover
  const lastIdx = useSharedValue(-1);
  const selected = useSharedValue(selectedOffset);
  useEffect(() => {
    selected.value = selectedOffset;
  }, [selectedOffset, selected]);

  const dock = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((_e, mgr) => mgr.activate()) // own the touch from touch-down
        .shouldCancelWhenOutside(false) // finger may drift above the 44px strip
        .blocksExternalGesture(tabsPagerRef) // the pager waits for us within the row
        .onBegin((e) => {
          "worklet";
          const w = rowWidth.value;
          dragging.value = true;
          drag.value = 1;
          lastIdx.value = -1;
          fingerX.value = Math.max(0, Math.min(w, e.x));
        })
        .onUpdate((e) => {
          "worklet";
          const w = rowWidth.value;
          const x = Math.max(0, Math.min(w, e.x));
          fingerX.value = x;
          const slot = w / NDAYS;
          const i = hoverIndex(x, slot);
          if (i !== lastIdx.value) {
            lastIdx.value = i;
            runOnJS(selectionTick)(); // once per dot crossing — never per frame
          }
        })
        .onFinalize(() => {
          "worklet";
          const slot = rowWidth.value / NDAYS;
          const off = offsetForIndex(hoverIndex(fingerX.value, slot));
          dragging.value = false;
          drag.value = withTiming(0, SETTLE); // spring back to idle
          if (off !== selected.value) runOnJS(goDay)(off);
        }),
    // stable — reads live state via shared values, so a day-commit re-render
    // never recreates a mid-flight gesture.
    [goDay, rowWidth, fingerX, drag, dragging, lastIdx, selected],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    rowWidth.value = e.nativeEvent.layout.width;
  };

  return (
    <GestureDetector gesture={dock}>
      <View
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Select a day"
        style={{ flexDirection: "row", alignItems: "flex-end", height: ROW_H, paddingHorizontal: 6 }}
      >
        {Array.from({ length: NDAYS }, (_, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <Tip i={i} fingerX={fingerX} dragging={dragging} rowWidth={rowWidth} label={dayDates[i] ?? ""} accent={accent} />
            <Dot i={i} fingerX={fingerX} drag={drag} rowWidth={rowWidth} selected={selected} accent={accent} />
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}
