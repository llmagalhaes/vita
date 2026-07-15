/**
 * Integrations (APP-029). Honest UI-only toggles: Vita has no real health-source
 * sync yet (that needs a dev build + platform accounts — blocked appendix / APP-007).
 * The toggles persist a local preference and never fabricate synced data; the copy
 * says so ("connect a health source", "arrives with the full app").
 */
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { BackButton, Card, Text, Toggle, colors, fonts } from "../../src/ui";
import { integrationEnabled, setIntegrationEnabled } from "../../src/db/settings";
import { useLogVersion } from "../../src/db/notify";
import { clearHealthSnapshot, connectHealthConnect } from "../../src/health/healthConnect";

// id → mono badge palette; all are honest UI-only sources (no real sync in v1).
const SOURCES = [
  { id: "appleHealth", mono: "He", bg: "#EAEDE3", ink: "#5F7A61" },
  { id: "healthConnect", mono: "HC", bg: "#E7EDE1", ink: "#5F7A61" },
  { id: "strava", mono: "St", bg: "#F7E7D4", ink: "#A66A3F" },
  { id: "garmin", mono: "Ga", bg: "#E7EDE1", ink: "#5F7A61" },
  { id: "flo", mono: "Fl", bg: "#F3DFCB", ink: "#A66A3F" },
  { id: "gym", mono: "FZ", bg: "#E7EDE1", ink: "#5F7A61" },
] as const;

export default function Integrations() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  // Re-read toggle state after each change.
  const enabled = useMemo(() => Object.fromEntries(SOURCES.map((s) => [s.id, integrationEnabled(s.id)])), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Health Connect is the ONE real integration (APP-038): toggling it on asks for
  // read permission and pulls today's data; off clears the cached snapshot. Every
  // other source stays an honest UI-only preference. In Expo Go / iOS the connect
  // call is a no-op stub (returns false) — no fabricated data.
  const toggle = (id: string, next: boolean) => {
    setIntegrationEnabled(id, next);
    if (id !== "healthConnect") return;
    if (next) void connectHealthConnect();
    else clearHealthSnapshot();
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 60, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BackButton onPress={() => router.back()} label={t("account.back")} />
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }} color={colors.labelMuted}>
          {t("integrations.title")}
        </Text>
      </View>
      <Text variant="caption" style={{ fontSize: 13, paddingHorizontal: 2 }} color={colors.muted}>{t("integrations.intro")}</Text>

      {SOURCES.map((s) => {
        const on = enabled[s.id];
        return (
          <Card key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: s.bg, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 12.5 }} color={s.ink}>{s.mono}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ fontSize: 14.5 }}>{t(`integrations.source.${s.id}`)}</Text>
              <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
                {s.id === "healthConnect"
                  ? on ? t("integrations.healthConnectOn") : t("integrations.healthConnectOff")
                  : on ? t("integrations.connectPrompt") : t("integrations.notConnected")}
              </Text>
            </View>
            <Toggle on={on} onToggle={() => toggle(s.id, !on)} accessibilityLabel={t(`integrations.source.${s.id}`)} />
          </Card>
        );
      })}

      <Text variant="caption" style={{ textAlign: "center", paddingHorizontal: 16, paddingTop: 6, lineHeight: 17 }} color={colors.labelMuted}>
        {t("integrations.honestNote")}
      </Text>
    </ScrollView>
  );
}
