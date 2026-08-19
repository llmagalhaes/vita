import { useEffect } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Button, Text, colors, fonts, motion, spacing } from "../ui";
import { CANCEL_THRESHOLD, type VoiceStatus } from "./useVoiceCapture";

/**
 * One `vtWave` bar — scaleY .3 ↔ 1 over 1s, delay `i × .13s` (README §2 Keyframes).
 * v4 prototype (line 985): 5 bars, 6×30px r3, accent.
 */
function WaveBar({ i, cancel }: { i: number; cancel: boolean }) {
  const s = useSharedValue<number>(motion.vtWave.fromScaleY);
  useEffect(() => {
    const run = () => {
      s.value = withRepeat(
        withTiming(1, { duration: motion.vtWave.durationMs / 2, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    };
    const id = setTimeout(run, i * motion.vtWave.staggerMs);
    return () => clearTimeout(id);
  }, [i, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }] }));
  return (
    <Animated.View style={[{ width: 6, height: 30, borderRadius: 3, backgroundColor: cancel ? "#F0C6B4" : colors.accent }, style]} />
  );
}

function Equalizer({ cancel }: { cancel: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 5, alignItems: "center", height: 34 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <WaveBar key={i} i={i} cancel={cancel} />
      ))}
    </View>
  );
}

function MicPulse({ cancel }: { cancel: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const tint = cancel ? "#B4694E" : colors.accent;
  return (
    <Animated.View
      style={[
        {
          width: 76,
          height: 76,
          borderRadius: 38,
          backgroundColor: cancel ? "#F2DAD0" : colors.estimateBg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Svg width={26} height={30} viewBox="0 0 16 18">
        <Path
          d="M5.6 1.5 h4.8 a2.4 2.4 0 0 1 2.4 2.4 v3.6 a2.4 2.4 0 0 1 -2.4 2.4 h-4.8 a2.4 2.4 0 0 1 -2.4 -2.4 v-3.6 a2.4 2.4 0 0 1 2.4 -2.4 Z"
          fill={tint}
        />
        <Path d="M3 8 a5 5 0 0 0 10 0" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" />
        <Path d="M8 14 v2.5" stroke={tint} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Full-screen voice capture surface. Pure/presentational: the pill owns the
 * hold gesture and passes state down. `onTypeInstead` is the graceful fallback
 * to text capture when recognition is denied/unavailable/errored.
 */
export function VoiceOverlay({
  status,
  transcript,
  willCancel,
  drag,
  onTypeInstead,
  onDismiss,
}: {
  status: VoiceStatus;
  transcript: string;
  willCancel: boolean;
  /** UI-thread horizontal drag (≤ 0) so the mic + hint follow the finger. */
  drag?: SharedValue<number>;
  onTypeInstead: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const zero = useSharedValue(0);
  const dx = drag ?? zero;
  // Mic slides left with the finger and fades as it nears the cancel line.
  const micFollow = useAnimatedStyle(() => {
    const p = Math.min(1, -dx.value / CANCEL_THRESHOLD);
    return { transform: [{ translateX: dx.value * 0.7 }], opacity: 1 - p * 0.55 };
  });
  // The hint trails the finger a touch less, so it reads as leading the mic out.
  const hintFollow = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value * 0.45 }] }));
  if (status === "idle") return null;

  const holding = status === "listening" || status === "transcribing";
  const fallback = status === "denied" || status === "unavailable" || status === "error";

  return (
    <Animated.View
      entering={FadeIn.duration(motion.fade.durationMs)}
      pointerEvents={holding ? "none" : "auto"}
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(60,50,38,0.44)",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 150,
        paddingHorizontal: spacing.xl,
      }}
    >
      {holding && (
        // Prototype `capListenOn` (line 983): the listening state is the capture
        // sheet itself — 5 accent wave bars, "Listening…", the example phrase, and
        // the release hint. The mic pulse + slide-to-cancel stay: they are the real
        // affordance the prototype's pointer-down/up shorthand stands for.
        <View
          style={{
            backgroundColor: colors.sheet,
            borderRadius: 30,
            paddingVertical: spacing.xl,
            paddingHorizontal: spacing.xl,
            gap: spacing.md + 2,
            alignItems: "center",
            width: "100%",
            maxWidth: 400,
          }}
        >
          <Animated.View style={micFollow}>
            <MicPulse cancel={willCancel} />
          </Animated.View>
          {status === "listening" && <Equalizer cancel={willCancel} />}
          <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, textAlign: "center" }} color={colors.inkHeading}>
            {status === "transcribing" ? t("capture.voice.transcribing") : t("capture.voice.listening")}
          </Text>
          <Text
            style={{ fontFamily: fonts.semiBold, fontSize: 13, fontStyle: "italic", textAlign: "center", maxWidth: 270, lineHeight: 19.5 }}
            color={colors.muted}
          >
            {transcript || t("capture.voice.example")}
          </Text>
          {status === "listening" && (
            <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, hintFollow]}>
              <Text
                style={{ fontFamily: willCancel ? fonts.extraBold : fonts.semiBold, fontSize: 11, textAlign: "center" }}
                color={willCancel ? colors.accent : colors.faint}
              >
                {willCancel ? t("capture.voice.releaseToCancel") : t("capture.voice.releaseHint")}
              </Text>
            </Animated.View>
          )}
        </View>
      )}

      {fallback && (
        <View
          style={{
            backgroundColor: colors.sheet,
            borderRadius: 26,
            padding: spacing.xl,
            gap: spacing.lg,
            width: "100%",
            maxWidth: 400,
          }}
        >
          <Text variant="body" style={{ textAlign: "center", lineHeight: 22 }} color={colors.muted}>
            {status === "denied" && t("capture.voice.denied")}
            {status === "unavailable" && t("capture.voice.unavailable")}
            {status === "error" && t("capture.voice.error")}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm + 2 }}>
            <View style={{ flex: 1 }}>
              <Button label={t("common.cancel")} variant="ghost" onPress={onDismiss} />
            </View>
            <View style={{ flex: 1.3 }}>
              <Button label={t("capture.voice.typeInstead")} onPress={onTypeInstead} />
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
}
