/**
 * Library panel — PLACEHOLDER shell (APP-096). Content ownership is APP-103
 * (What Vita keeps · Eating plan · Programs · Habits · Health Connect · Away &
 * sharing · Account). Scroll padding is the prototype's `88px 20px 120px`.
 */
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, fonts, typeScale } from "../ui";

export function LibraryPanel() {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 120, gap: 13 }}
    >
      <View>
        <Text style={{ fontFamily: fonts.bold, fontSize: typeScale.screenTitle }} color={colors.inkHeading}>
          {t("nav.panels.library")}
        </Text>
      </View>
    </ScrollView>
  );
}
