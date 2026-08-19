/**
 * Day panel — PLACEHOLDER shell (APP-096). Content ownership is APP-097's
 * (scenic header + parallax + Overview zone) and APP-098's (the "Your day"
 * timeline). Keep three things when you fill it in:
 *  1. the scroll padding `88px 20px 150px` (the panel tabs float at top 48),
 *  2. `<SwipeHint />` right under the header — it retires itself on the first swipe,
 *  3. the panel must own its own vertical scroll; the shell only pans horizontally.
 */
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SwipeHint } from "../nav/PanelTabs";
import { Text, colors, fonts, spacing, typeScale } from "../ui";

export function DayPanel() {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 150, gap: 13 }}
    >
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: typeScale.screenTitle }} color={colors.inkHeading}>
          {t("nav.panels.day")}
        </Text>
      </View>
      <SwipeHint />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}
