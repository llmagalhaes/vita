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
import Svg, { Path } from "react-native-svg";
import { Button, Text, colors, fonts, motion, spacing } from "../ui";
import type { VoiceStatus } from "./useVoiceCapture";

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
  onTypeInstead,
  onDismiss,
}: {
  status: VoiceStatus;
  transcript: string;
  willCancel: boolean;
  onTypeInstead: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
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
        <View style={{ alignItems: "center", gap: spacing.lg }}>
          <MicPulse cancel={willCancel} />
          <Text
            variant="title"
            style={{ fontSize: 19, textAlign: "center", maxWidth: 320 }}
            color={colors.card}
          >
            {status === "transcribing"
              ? t("capture.voice.transcribing")
              : transcript || t("capture.voice.listening")}
          </Text>
          {status === "listening" && (
            <Text
              variant="label"
              style={{ fontFamily: willCancel ? fonts.extraBold : fonts.semiBold, textAlign: "center" }}
              color={willCancel ? "#F0C6B4" : "rgba(247,242,233,0.75)"}
            >
              {willCancel ? t("capture.voice.releaseToCancel") : t("capture.voice.slideToCancel")}
            </Text>
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
