import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { Button, Text, colors, fonts, motion, spacing } from "../ui";
import { useCapture } from "./CaptureContext";
import { pickPhoto } from "./photo";
import { useVoiceCapture } from "./useVoiceCapture";
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
  const ink = active ? colors.card : "#6E6355";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        width: 66,
        height: 56,
        borderRadius: 28,
        backgroundColor: active ? colors.accent : "transparent",
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
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const progress = useSharedValue(0);

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

  // Photo capture: pick → downscale → parse. Calm states for decline/error.
  const [photoNotice, setPhotoNotice] = useState<null | "denied" | "error">(null);
  const onCameraPress = async () => {
    const r = await pickPhoto();
    if (r.status === "picked") capture.submitPhoto(r.photo);
    else if (r.status === "denied") setPhotoNotice("denied");
    else if (r.status === "error") setPhotoNotice("error");
    // cancelled → no notice, stay calm
  };
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

  const micGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .maxPointers(1)
    .onBegin(() => {
      held.current = false;
      holdTimer.current = setTimeout(() => {
        held.current = true;
        void voice.holdStart();
      }, HOLD_MS);
    })
    .onUpdate((e) => {
      if (held.current) voice.holdMove(e.translationY);
    })
    .onFinalize(() => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      if (held.current) voice.holdEnd();
      else setExpanded((e) => !e); // quick tap
    });

  return (
    <>
      <VoiceOverlay
        status={voice.status}
        transcript={voice.transcript}
        willCancel={voice.willCancel}
        onTypeInstead={() => {
          voice.dismiss();
          setExpanded(true);
        }}
        onDismiss={voice.dismiss}
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
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 22 }}
      >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "rgba(255,253,247,0.94)",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 36,
          padding: 6,
          shadowColor: "#69543C",
          shadowOpacity: 0.2,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 18 },
          elevation: 8,
        }}
      >
        <GestureDetector gesture={micGesture}>
          <View
            accessibilityRole="button"
            accessibilityLabel={t("capture.log")}
            accessibilityHint={t("capture.voice.a11yHint")}
            onAccessibilityTap={() => setExpanded((e) => !e)}
            style={{
              width: 66,
              height: 56,
              borderRadius: 28,
              backgroundColor: expanded || voice.status !== "idle" ? colors.estimateBg : "transparent",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <Svg width={16} height={18} viewBox="0 0 16 18">
              <Path d="M5.6 1.5 h4.8 a2.4 2.4 0 0 1 2.4 2.4 v3.6 a2.4 2.4 0 0 1 -2.4 2.4 h-4.8 a2.4 2.4 0 0 1 -2.4 -2.4 v-3.6 a2.4 2.4 0 0 1 2.4 -2.4 Z" fill={colors.accent} />
              <Path d="M3 8 a5 5 0 0 0 10 0" fill="none" stroke={colors.accent} strokeWidth={1.6} strokeLinecap="round" />
              <Path d="M8 14 v2.5" stroke={colors.accent} strokeWidth={1.6} strokeLinecap="round" />
            </Svg>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 10 }} color={colors.accent}>
              {t("capture.log")}
            </Text>
          </View>
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
            onPress={onCameraPress}
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
      </View>
      </View>
    </>
  );
}
