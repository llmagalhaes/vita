/**
 * Evening recap card (APP-088 §7.2) — the dark, expandable summary that sits
 * above the Home hero after 18:00 when the day has at least one log. Body copy is
 * `recapLine` (the same line the 20:30 notification uses). No scores, no judgment —
 * "estimates, not scores", "Tomorrow starts fresh." The card owns only its
 * expand/collapse state; Home decides visibility.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Chevron, Text, colors, fonts, shadowDark } from "../../ui";

export function RecapCard({
  line,
  kcalIn,
  spent,
  onSeeTrends,
}: {
  line: string;
  kcalIn: number;
  spent: number;
  onSeeTrends: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Animated.View entering={ZoomIn.duration(400)} style={{ borderRadius: 24, ...shadowDark, shadowOpacity: 0.18 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("home.recapLabel")} onPress={() => setOpen((o) => !o)}>
        <LinearGradient
          colors={[colors.recap.bg1, colors.recap.bg2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, paddingVertical: 15, paddingHorizontal: 17, gap: 9 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* gold crescent moon */}
            <Svg width={14} height={14} viewBox="0 0 14 14">
              <Path d="M11.5 8.6 A5 5 0 1 1 6.4 2.5 A4 4 0 1 0 11.5 8.6 Z" fill={colors.toastUndo} />
            </Svg>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", flex: 1 }} color={colors.recap.label}>
              {t("home.recapLabel")}
            </Text>
            <Chevron open={open} color={colors.recap.label} />
          </View>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 14.5, lineHeight: 21 }} color={colors.recap.text}>
            {line}
          </Text>
          <Text style={{ fontSize: 12 }} color="rgba(247,240,228,0.65)">
            {t("home.recapFresh")}
          </Text>
          {open && (
            <Animated.View
              entering={FadeIn.duration(250)}
              style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: colors.recap.dashed, paddingTop: 9, gap: 9 }}
            >
              <Text style={{ fontSize: 12.5 }} color={colors.recap.text}>
                {t("home.recapKcal", { in: kcalIn, out: spent })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onSeeTrends}
                style={{ alignSelf: "flex-start", backgroundColor: colors.recap.pill, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.toastUndo}>
                  {t("home.recapTrends")}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
