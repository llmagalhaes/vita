/**
 * Trends panel — PLACEHOLDER shell (APP-096). Content ownership is APP-099
 * (W/M/Y rail, record counter, charts, muscle focus, habit strips, weight line).
 * Scroll padding is the prototype's `88px 20px 120px`; the whole surface pans back
 * to Day, so any inner horizontal gesture must `blocksExternalGesture(tabsPagerRef)`.
 */
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, fonts, typeScale } from "../ui";

export function TrendsPanel() {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 120, gap: 13 }}
    >
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: typeScale.screenTitle }} color={colors.inkHeading}>
          {t("nav.panels.trends")}
        </Text>
        <Text style={{ fontSize: 13, marginTop: 1 }} color={colors.muted}>
          {t("trends.subtitle")}
        </Text>
      </View>
    </ScrollView>
  );
}
