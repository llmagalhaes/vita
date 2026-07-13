import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, spacing } from "../../src/ui";

export default function Habits() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, padding: spacing.xl, paddingTop: 72, gap: spacing.sm }}>
      <Text variant="display">{t("habits.title")}</Text>
      <Text variant="body" color={colors.muted}>
        {t("habits.notYet")}
      </Text>
    </View>
  );
}
