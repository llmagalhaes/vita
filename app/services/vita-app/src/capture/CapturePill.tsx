import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, ZoomIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { Button, KeyboardLift, Text, colors, fonts, motion, spacing, useAccent, useAnySheetOpen } from "../ui";
import { selectionTick } from "../lib/haptics";
import { useCapture } from "./CaptureContext";
import { PhotoSheet } from "./PhotoSheet";
import { CANCEL_THRESHOLD, useVoiceCapture } from "./useVoiceCapture";
import { VoiceOverlay } from "./VoiceOverlay";

// A press shorter than this is a tap (toggle the text field); longer starts voice.
const HOLD_MS = 240;

const FIELD_W = 208; // input + camera button
const NAV_W = 198; // 3 × 66 shortcuts

const unfold = { duration: motion.unfold.durationMs, easing: Easing.bezier(...motion.unfold.bezier) };

function NavButton({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: "today" | "trends" | "habits";
}) {
  // Prototype active tab = calm brown tint + dark ink, NOT a solid accent pill.
  const ink = active ? "#453E35" : "#6E6355";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        width: 66,
        height: 56,
        borderRadius: 28,
        backgroundColor: active ? "rgba(120,100,75,0.12)" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Svg width={17} height={16} viewBox="0 0 17 16">
        {icon === "today" && (
          <Path d="M2 7.5 L8.5 2 L15 7.5 V14 H10.5 V10 H6.5 V14 H2 Z" fill="none" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
        )}
        {icon === "trends" && (
          <>
            <Path d="M2 12.5 L6.5 7.5 L9.5 10 L15 3.5" fill="none" stroke={ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={15} cy={3.5} r={1.5} fill={ink} />
          </>
        )}
        {icon === "habits" && (
          <>
            <Circle cx={8} cy={8} r={6.2} fill="none" stroke={ink} strokeWidth={1.6} />
            <Path d="M5.4 8.3 l1.8 1.8 L10.9 6" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </Svg>
      <Text style={{ fontFamily: fonts.bold, fontSize: 10 }} color={ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Capture pill v2 (CEO Round 5: the only chrome variant): mic bubble that
 * unfolds a text field, camera button, Today/Trends/Habits shortcuts.
 * Hold-to-talk lands with APP-012 — tap toggles the field for now.
 */
export function CapturePill() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const capture = useCapture();
  const accent = useAccent();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const progress = useSharedValue(0);
  // Slide-to-cancel: UI-thread horizontal follow while recording (dragX ≤ 0),
  // plus flags the pan worklet reads without touching JS per frame.
  const dragX = useSharedValue(0);
  const recording = useSharedValue(0);
  const armed = useSharedValue(0);

  // Slide the whole pill away while any sheet/pop-up is open — the prototype's
  // floating menu disappears under a sheet (CEO #1, image 2).
  const anySheet = useAnySheetOpen();
  const hide = useSharedValue(0);
  useEffect(() => {
    hide.value = withTiming(anySheet ? 1 : 0, { duration: 200 });
  }, [anySheet, hide]);
  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hide.value * 120 }],
    opacity: 1 - hide.value,
  }));

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, unfold);
  }, [expanded, progress]);

  // Adjust flow: phrase comes back into the field for editing.
  useEffect(() => {
    if (capture.prefill) {
      setText(capture.prefill);
      setExpanded(true);
      capture.clearPrefill();
    }
  }, [capture, capture.prefill]);

  const fieldStyle = useAnimatedStyle(() => ({
    maxWidth: progress.value * FIELD_W,
    opacity: progress.value,
  }));
  const navStyle = useAnimatedStyle(() => ({
    maxWidth: (1 - progress.value) * NAV_W,
    opacity: 1 - progress.value,
  }));

  const send = () => {
    if (!text.trim()) return;
    capture.submit(text);
    setText("");
    setExpanded(false);
  };

  // Photo capture: tap the camera → the "Add from a photo" sheet (camera vs
  // library, CEO #6). Each source picks → downscale → parse; calm decline/error.
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<null | "denied" | "error">(null);
  // "Type instead" from anywhere (photo decline, or the sheet's parse-fail) opens the field.
  useEffect(() => {
    if (capture.textEntryNonce > 0) {
      setPhotoNotice(null);
      setExpanded(true);
    }
  }, [capture.textEntryNonce]);

  // Hold-to-talk: press-and-hold the mic → voice; a quick tap toggles the field.
  const voice = useVoiceCapture((transcript) => capture.submit(transcript));
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  // Tap-vs-hold detection + async voice start/stop stay on JS; the gesture
  // worklets reach them via runOnJS — only on press-begin, threshold-cross and
  // release, never per frame.
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
    else setExpanded((e) => !e); // quick tap toggles the text field
  };

  // Slide-to-cancel (WhatsApp-idiomatic, leftward). The horizontal drag is
  // tracked into dragX on the UI thread so the overlay's mic + hint follow the
  // finger with zero JS round-trips; JS is touched only at the three edges above.
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
      dragX.value = withTiming(0, unfold); // settle the mic back home
    });

  return (
    <>
      <VoiceOverlay
        status={voice.status}
        transcript={voice.transcript}
        willCancel={voice.willCancel}
        drag={dragX}
        onTypeInstead={() => {
          voice.dismiss();
          setExpanded(true);
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
                  setExpanded(true);
                }}
              />
            </View>
          </Animated.View>
        </View>
      )}
      <View
        pointerEvents={anySheet ? "none" : "box-none"}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 22 }}
      >
      {/* Lift the whole pill above the keyboard while its own field is open. */}
      <KeyboardLift enabled={expanded}>
      {/* vtPop — the pill pops in on mount like the prototype; slides away under a sheet */}
      <Animated.View
        entering={ZoomIn.duration(motion.pop.durationMs).easing(Easing.bezier(...motion.pop.bezier).factory())}
        style={[hideStyle, {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgba(255,253,247,0.9)",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 36,
          padding: 6,
          // prototype's soft floating lift `0 18px 44px rgba(105,84,60,.20)` — the
          // radius was too tight (22) to read as a soft lift (APP-067). Active nav
          // colours already match the prototype (accent bg + cream ink).
          shadowColor: "#69543C",
          shadowOpacity: 0.2,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 18 },
          elevation: 9,
        }]}
      >
        <GestureDetector gesture={micGesture}>
          {(() => {
            // Log is the capture CTA, not a nav destination — in the prototype
            // its mic + label are always accent over a soft accent-tint bubble
            // (CEO: keep it prototype-faithful). Only the active NAV tab softens.
            const logInk = accent;
            return (
              <View
                accessibilityRole="button"
                accessibilityLabel={t("capture.log")}
                accessibilityHint={t("capture.voice.a11yHint")}
                onAccessibilityTap={() => setExpanded((e) => !e)}
                style={{
                  width: 66,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.estimateBg,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                <Svg width={16} height={18} viewBox="0 0 16 18">
                  <Path d="M5.6 1.5 h4.8 a2.4 2.4 0 0 1 2.4 2.4 v3.6 a2.4 2.4 0 0 1 -2.4 2.4 h-4.8 a2.4 2.4 0 0 1 -2.4 -2.4 v-3.6 a2.4 2.4 0 0 1 2.4 -2.4 Z" fill={logInk} />
                  <Path d="M3 8 a5 5 0 0 0 10 0" fill="none" stroke={logInk} strokeWidth={1.6} strokeLinecap="round" />
                  <Path d="M8 14 v2.5" stroke={logInk} strokeWidth={1.6} strokeLinecap="round" />
                </Svg>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 10 }} color={logInk}>
                  {t("capture.log")}
                </Text>
              </View>
            );
          })()}
        </GestureDetector>

        <Animated.View style={[{ flexDirection: "row", alignItems: "center", overflow: "hidden" }, fieldStyle]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            returnKeyType="send"
            placeholder={t("capture.placeholder")}
            placeholderTextColor={colors.labelMuted}
            accessibilityLabel={t("capture.placeholder")}
            style={{
              width: 154,
              paddingHorizontal: 8,
              fontFamily: fonts.regular,
              fontSize: 13.5,
              color: colors.ink,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("capture.photo.a11yLabel")}
            onPress={() => setPhotoSheetOpen(true)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: "#F0EDE2",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 4,
            }}
          >
            <Svg width={18} height={16} viewBox="0 0 18 16">
              <Path d="M2.5 4.75 h13 a1 1 0 0 1 1 1 v8 a1 1 0 0 1 -1 1 h-13 a1 1 0 0 1 -1 -1 v-8 a1 1 0 0 1 1 -1 Z" fill="none" stroke="#6E6355" strokeWidth={1.5} />
              <Path d="M6 4 L7.2 2 h3.6 L12 4" fill="none" stroke="#6E6355" strokeWidth={1.5} strokeLinejoin="round" />
              <Circle cx={9} cy={9.2} r={2.6} fill="none" stroke="#6E6355" strokeWidth={1.5} />
            </Svg>
          </Pressable>
        </Animated.View>

        <Animated.View style={[{ flexDirection: "row", alignItems: "center", overflow: "hidden" }, navStyle]}>
          <NavButton label={t("pill.today")} icon="today" active={pathname === "/home"} onPress={() => router.replace("/home")} />
          <NavButton label={t("pill.trends")} icon="trends" active={pathname === "/trends"} onPress={() => router.replace("/trends")} />
          <NavButton label={t("pill.habits")} icon="habits" active={pathname === "/habits"} onPress={() => router.replace("/habits")} />
        </Animated.View>
      </Animated.View>
      </KeyboardLift>
      </View>
    </>
  );
}
