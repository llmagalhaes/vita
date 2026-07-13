import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Card, Chip, Text, spacing } from "../src/ui";

export default function Home() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" }}>
      <Text variant="display">{t("home.greeting")}</Text>
      <Card style={{ gap: spacing.sm }}>
        <Text variant="body">{t("home.tagline")}</Text>
        <Chip label={t("home.estimate")} />
      </Card>
    </View>
  );
}
