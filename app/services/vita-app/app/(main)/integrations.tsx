/**
 * Integrations (APP-029 · cleaned up APP-072). Health Connect is the only real
 * health-source integration Vita has, and it is Android-only — so this screen
 * shows ONLY Health Connect, and only on Android. Apple Health / Strava / Garmin
 * / Flo / a gym app were UI-only stubs that never synced anything; per the "no
 * fake affordances" philosophy they are gone (they return when actually built).
 */
import { useMemo } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { BackButton, Card, Text, Toggle, colors, fonts } from "../../src/ui";
import { integrationEnabled, setIntegrationEnabled } from "../../src/db/settings";
import { logChanged, useLogVersion } from "../../src/db/notify";
import { clearHealthSnapshot, connectHealthConnect, openHealthConnectStore } from "../../src/health/healthConnect";
import { showToast } from "../../src/ui/toast";

export default function Integrations() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const isAndroid = Platform.OS === "android";
  const on = useMemo(() => integrationEnabled("healthConnect"), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Health Connect is the ONE real integration (APP-038/070): toggling on checks
  // the provider, requests read permission, and pulls today's data; off clears the
  // cached snapshot. The connect flow is honest about every failure — absent /
  // needs-setup (→ store) / permission denied / connected-but-no-data (sync off).
  const toggle = (next: boolean) => {
    setIntegrationEnabled("healthConnect", next);
    if (!next) {
      clearHealthSnapshot();
      return;
    }
    void connectHealthConnect().then((res) => {
      if (res.ok) {
        if (!res.hasData) showToast(t("integrations.healthConnectNoData"));
        return;
      }
      // Nothing actually connected — revert the switch and guide the next step.
      setIntegrationEnabled("healthConnect", false);
      logChanged();
      if (res.reason === "denied") {
        showToast(t("integrations.healthConnectDenied"));
      } else if (res.reason === "not_installed" || res.reason === "update_required") {
        showToast(t(res.reason === "not_installed" ? "integrations.healthConnectInstall" : "integrations.healthConnectUpdate"));
        openHealthConnectStore();
      } else {
        showToast(t("integrations.healthConnectUnavailable"));
      }
    });
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

      {isAndroid ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 12.5 }} color="#5F7A61">HC</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 14.5 }}>{t("integrations.source.healthConnect")}</Text>
            <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
              {on ? t("integrations.healthConnectOn") : t("integrations.healthConnectOff")}
            </Text>
          </View>
          <Toggle on={on} onToggle={() => toggle(!on)} accessibilityLabel={t("integrations.source.healthConnect")} />
        </Card>
      ) : (
        <Text variant="caption" style={{ paddingHorizontal: 2, paddingTop: 4 }} color={colors.muted}>
          {t("integrations.noneYet")}
        </Text>
      )}

      <Text variant="caption" style={{ textAlign: "center", paddingHorizontal: 16, paddingTop: 6, lineHeight: 17 }} color={colors.labelMuted}>
        {t("integrations.honestNote")}
      </Text>
    </ScrollView>
  );
}
