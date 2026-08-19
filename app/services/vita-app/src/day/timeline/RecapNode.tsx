/**
 * APP-098 — the "Day closed" recap node (prototype lines 692–711): the one dark
 * surface on the Day panel, on the recap gradient (`colors.recap`).
 *
 * It is a COUNT, never a verdict — the line comes from APP-094's `recapLine`, the
 * footer is the philosophy in one sentence, and `Reopen` is always there because a
 * closed day is a statement you are allowed to take back.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { ZoomIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { PressScale, Text, colors, fonts, motion, radii, shadowDark } from "../../ui";

/** The prototype's crescent, filled with the toast-undo amber. */
function Moon() {
  return (
    <Svg width={14} height={14}>
      <Path d="M11.5 9.2 A5 5 0 1 1 6.3 2 A4 4 0 0 0 11.5 9.2 Z" fill={colors.toastUndo} />
    </Svg>
  );
}

export function RecapNode({ line, onReopen }: { line: string; onReopen: () => void }) {
  const { t } = useTranslation();
  // Raise: `0 12px 30px rgba(60,45,30,.18)` — the dark shadow at the prototype's opacity.
  return (
    <Animated.View entering={ZoomIn.duration(motion.vtPop.durationMs + 100)} style={{ borderRadius: radii.card, ...shadowDark, shadowOpacity: 0.18 }}>
      <LinearGradient
        colors={[colors.recap.bg1, colors.recap.bg2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radii.card, paddingVertical: 15, paddingHorizontal: 17, gap: 9 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Moon />
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.recap.label}>
            {t("timeline.recap.label")}
          </Text>
          <View style={{ flex: 1 }} />
          <PressScale
            accessibilityRole="button"
            onPress={onReopen}
            style={{ backgroundColor: colors.recap.pill, borderRadius: 11, paddingVertical: 5, paddingHorizontal: 10 }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 10.5 }} color={colors.toastUndo}>
              {t("timeline.recap.reopen")}
            </Text>
          </PressScale>
        </View>

        {line ? (
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 14.5, lineHeight: 21 }} color={colors.recap.text}>
            {line}.
          </Text>
        ) : null}

        <Text style={{ fontSize: 12 }} color={colors.recap.textSoft}>
          {t("timeline.recap.footer")}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}
