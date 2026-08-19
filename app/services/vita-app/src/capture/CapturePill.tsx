/**
 * v4 capture pill (APP-104) — the frosted, Samsung-Health-like bar floating over
 * the Day panel. README §3 "Capture pill" + prototype lines 866–878 (`pillOn`):
 * container `rgba(255,253,247,.55)` blur 20 saturate 1.5, border `rgba(255,253,247,.72)`,
 * r32, shadow `0 12px 34px rgba(50,38,26,.25)`; entry `vtPillX` (max-width 54→280,
 * .5s) with the Aa/camera buttons popping via `vtPillBtn` at .3s / .38s; Aa + camera
 * 40px `rgba(69,62,53,.08)`, mic 52px accent + `0 8px 20px accent@40%`.
 *
 * The v3 three-shortcut nav row is GONE — the panel tabs own navigation now. Text
 * capture moved into the sheet (prototype `capTextOn`), so the pill is exactly the
 * prototype's three controls.
 *
 * Visible ONLY on today's Day panel with no sheet open (README §3).
 */
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import {
  Button,
  Text,
  capturePill,
  colors,
  fonts,
  motion,
  shadowPill,
  spacing,
  useAccent,
  useAnySheetOpen,
} from "../ui";
import { selectionTick } from "../lib/haptics";
import { dayKey } from "../day/record";
import { useSelectedDate } from "../day/selection";
import { useCapture } from "./CaptureContext";
import { PhotoSheet } from "./PhotoSheet";
import { CANCEL_THRESHOLD, useVoiceCapture } from "./useVoiceCapture";
import { VoiceOverlay } from "./VoiceOverlay";

// A press shorter than this is a tap (open the text field); longer starts voice.
const HOLD_MS = 240;

/** Same Android blur ladder as PanelTabs (APP-096 D1) — translucent fill ships first. */
const ANDROID_BLUR = false;
const blurOn = Platform.OS !== "android" || ANDROID_BLUR;

const pillX = { duration: motion.vtPillX.durationMs, easing: Easing.bezier(...motion.vtPillX.bezier) };
const btnPop = { duration: motion.vtPillBtn.durationMs, easing: Easing.out(Easing.ease) };

/** Aa / camera — 40px `rgba(69,62,53,.08)` circle popping in via `vtPillBtn`. */
function SideButton({
  label,
  delayMs,
  onPress,
  children,
}: {
  label: string;
  delayMs: number;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const s = useSharedValue<number>(motion.vtPillBtn.fromScale);
  useEffect(() => {
    s.value = withDelay(delayMs, withTiming(1, btnPop));
  }, [delayMs, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: s.value }));
  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          width: capturePill.buttonSize,
          height: capturePill.buttonSize,
          borderRadius: capturePill.buttonSize / 2,
          backgroundColor: capturePill.buttonBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function CapturePill() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const capture = useCapture();
  const accent = useAccent();

  // Slide-to-cancel: UI-thread horizontal follow while recording (dragX ≤ 0),
  // plus flags the pan worklet reads without touching JS per frame.
  const dragX = useSharedValue(0);
  const recording = useSharedValue(0);
  const armed = useSharedValue(0);

  // Slide the whole pill away while any sheet/pop-up is open — the prototype's
  // floating pill disappears under a sheet (README §3: "no sheet open").
  const anySheet = useAnySheetOpen();
  const hide = useSharedValue(0);
  useEffect(() => {
    hide.value = withTiming(anySheet ? 1 : 0, { duration: 200 });
  }, [anySheet, hide]);
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hide.value * 120 }],
    opacity: 1 - hide.value,
  }));

  // vtPillX — the shell grows 54 → 280 as it arrives.
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(1, pillX);
  }, [grow]);
  const growStyle = useAnimatedStyle(() => ({
    maxWidth: motion.vtPillX.fromWidth + grow.value * (motion.vtPillX.toWidth - motion.vtPillX.fromWidth),
    opacity: motion.vtPillX.fromOpacity + grow.value * (1 - motion.vtPillX.fromOpacity),
  }));

  // Photo capture: the camera button → "Add from a photo" (camera vs library).
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<null | "denied" | "error">(null);

  // Hold-to-talk: press-and-hold the mic → voice; a quick tap opens the text field.
  const voice = useVoiceCapture((transcript) => capture.submit(transcript));
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const beginPress = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      recording.value = 1; // arm the UI-thread finger-follow
      void voice.holdStart();
    }, HOLD_MS);
  };
  const crossCancel = (x: number) => {
    voice.holdMove(x); // flips willCancel + ref for the overlay copy/tint
    selectionTick(); // a calm tick as the drag crosses the cancel line
  };
  const endPress = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (held.current) voice.holdEnd(); // reads willCancel → submit or abort
    else capture.requestTextEntry(); // quick tap opens the sheet's field
  };

  // Slide-to-cancel (WhatsApp-idiomatic, leftward). The horizontal drag is tracked
  // into dragX on the UI thread so the overlay's mic + hint follow the finger with
  // zero JS round-trips; JS is touched only at the three edges above.
  const micGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin(() => {
      "worklet";
      dragX.value = 0;
      armed.value = 0;
      runOnJS(beginPress)();
    })
    .onUpdate((e) => {
      "worklet";
      if (recording.value === 0) return;
      const x = Math.min(0, e.translationX); // leftward drag only
      dragX.value = x;
      const next = x < -CANCEL_THRESHOLD ? 1 : 0;
      if (next !== armed.value) {
        armed.value = next;
        runOnJS(crossCancel)(x);
      }
    })
    .onFinalize(() => {
      "worklet";
      runOnJS(endPress)();
      recording.value = 0;
      armed.value = 0;
      dragX.value = withTiming(0, { duration: motion.unfold.durationMs, easing: Easing.bezier(...motion.unfold.bezier) });
    });

  // Today's Day panel only. Past days are a record, not a capture surface.
  const selectedDate = useSelectedDate();
  const onDay = pathname === "/day" || pathname === "/home"; // /home still redirects to /day (APP-108)
  const visible = onDay && selectedDate === dayKey();

  const shell = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: capturePill.radius,
    borderWidth: 1,
    borderColor: capturePill.border,
    overflow: "hidden",
  } as const;

  const inner = (
    <>
      <SideButton label={t("capture.textEntry")} delayMs={motion.vtPillBtn.delaysMs[0]} onPress={() => capture.requestTextEntry()}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 13 }} color={capturePill.buttonInk}>
          Aa
        </Text>
      </SideButton>

      <GestureDetector gesture={micGesture}>
        <View
          accessibilityRole="button"
          accessibilityLabel={t("capture.log")}
          accessibilityHint={t("capture.voice.a11yHint")}
          onAccessibilityTap={() => capture.requestTextEntry()}
          style={{
            width: capturePill.micSize,
            height: capturePill.micSize,
            borderRadius: capturePill.micSize / 2,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: accent,
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <Svg width={20} height={21} viewBox="0 0 20 21">
            <Rect x={7.4} y={1.6} width={5.2} height={10} rx={2.6} fill="#FFF9F1" />
            <Path d="M4 9.4 a6 6 0 0 0 12 0" fill="none" stroke="#FFF9F1" strokeWidth={1.8} strokeLinecap="round" />
            <Path d="M10 16.2 v3" stroke="#FFF9F1" strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </View>
      </GestureDetector>

      <SideButton label={t("capture.photo.a11yLabel")} delayMs={motion.vtPillBtn.delaysMs[1]} onPress={() => setPhotoSheetOpen(true)}>
        <Svg width={17} height={15} viewBox="0 0 17 15">
          <Rect x={1} y={3.4} width={15} height={10.4} rx={3} fill="none" stroke={capturePill.buttonInk} strokeWidth={1.5} />
          <Path d="M6 3.4 L7.4 1.4 h2.2 L11 3.4" fill="none" stroke={capturePill.buttonInk} strokeWidth={1.5} strokeLinejoin="round" />
          <Circle cx={8.5} cy={8.4} r={2.6} fill="none" stroke={capturePill.buttonInk} strokeWidth={1.5} />
        </Svg>
      </SideButton>
    </>
  );

  return (
    <>
      <VoiceOverlay
        status={voice.status}
        transcript={voice.transcript}
        willCancel={voice.willCancel}
        drag={dragX}
        onTypeInstead={() => {
          voice.dismiss();
          capture.requestTextEntry();
        }}
        onDismiss={voice.dismiss}
      />
      <PhotoSheet
        visible={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        onPicked={(photo) => {
          setPhotoSheetOpen(false);
          capture.submitPhoto(photo);
        }}
        onDenied={() => {
          setPhotoSheetOpen(false);
          setPhotoNotice("denied");
        }}
        onError={() => {
          setPhotoSheetOpen(false);
          setPhotoNotice("error");
        }}
      />
      {photoNotice && (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 96, alignItems: "center", paddingHorizontal: 24 }}
        >
          <Animated.View
            entering={FadeIn.duration(motion.fade.durationMs)}
            style={{
              backgroundColor: colors.sheet,
              borderRadius: 22,
              padding: spacing.lg,
              gap: spacing.md,
              maxWidth: 340,
              shadowColor: "#69543C",
              shadowOpacity: 0.18,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 12 },
              elevation: 6,
            }}
          >
            <Text variant="body" style={{ textAlign: "center", lineHeight: 21 }} color={colors.muted}>
              {t(photoNotice === "denied" ? "capture.photo.denied" : "capture.photo.error")}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm + 2, justifyContent: "center" }}>
              <Button label={t("common.cancel")} variant="ghost" onPress={() => setPhotoNotice(null)} />
              <Button
                label={t("capture.photo.typeInstead")}
                onPress={() => {
                  setPhotoNotice(null);
                  capture.requestTextEntry();
                }}
              />
            </View>
          </Animated.View>
        </View>
      )}
      {visible && (
        <View
          pointerEvents={anySheet ? "none" : "box-none"}
          style={{ position: "absolute", left: 0, right: 0, bottom: 26, alignItems: "center", zIndex: 55 }}
        >
          <Animated.View style={[hideStyle, shadowPill]}>
            <Animated.View style={growStyle}>
              {blurOn ? (
                <BlurView
                  intensity={capturePill.blur}
                  tint="light"
                  blurReductionFactor={1}
                  experimentalBlurMethod="dimezisBlurView"
                  style={[shell, { backgroundColor: capturePill.bg }]}
                >
                  {inner}
                </BlurView>
              ) : (
                // Android fallback: same translucent fill, no blur (APP-096 pattern).
                <View style={[shell, { backgroundColor: capturePill.bg }]}>{inner}</View>
              )}
            </Animated.View>
          </Animated.View>
        </View>
      )}
    </>
  );
}
