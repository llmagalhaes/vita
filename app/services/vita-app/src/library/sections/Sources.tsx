/**
 * "Connected sources" (APP-103, prototype lines 823–833) — ONE real row: Health
 * Connect. No Garmin, no Strava, no Flo, and never Apple Health on Android; the
 * v3 Integrations screen with its placeholder list is gone.
 *
 * On iOS the whole section is hidden (CEO Q3: "hide" — no empty section, no Apple
 * Health placeholder), because Vita has no iOS health source to offer yet.
 *
 * The permission/availability internals stay in src/health/healthConnect.ts —
 * APP-107 owns them; this row only flips the pref and reports honestly.
 */
import { useMemo } from "react";
import { Platform, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { Text, Toggle, colors, fonts, showToast } from "../../ui";
import { integrationEnabled, setIntegrationEnabled } from "../../db/settings";
import { logChanged, useLogVersion } from "../../db/notify";
import { clearHealthSnapshot, connectHealthConnect, openHealthConnectStore } from "../../health/healthConnect";
import { IconWell, ListCard, SectionLabel } from "../parts";

/** Prototype's 18×18 "link" glyph. */
const LinkGlyph = () => (
  <Svg width={18} height={18}>
    <Path
      d="M7.2 10.8 L10.8 7.2 M6.4 9.4 L4.6 11.2 a2.9 2.9 0 0 0 4.1 4.1 L10.5 13.5 M11.6 8.6 L13.4 6.8 a2.9 2.9 0 0 0 -4.1 -4.1 L7.5 4.5"
      fill="none"
      stroke={colors.green.ink}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </Svg>
);

export function Sources() {
  const { t } = useTranslation();
  const version = useLogVersion();
  const on = useMemo(() => integrationEnabled("healthConnect"), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== "android") return null; // CEO Q3 — hidden entirely, not empty

  // Toggling on checks the provider, asks for read permission, then pulls today's
  // data; off clears the cached snapshot. Every failure reverts the switch and says
  // what to do next — the toggle never claims a connection it doesn't have.
  const toggle = (next: boolean) => {
    setIntegrationEnabled("healthConnect", next);
    if (!next) {
      clearHealthSnapshot();
      showToast(t("library.sources.offToast"));
      return;
    }
    void connectHealthConnect().then((res) => {
      if (res.ok) {
        showToast(res.hasData ? t("library.sources.onToast") : t("integrations.healthConnectNoData"));
        return;
      }
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
    <>
      <SectionLabel>{t("library.sources.title")}</SectionLabel>
      <ListCard style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
        <IconWell bg={colors.green.bg}>
          <LinkGlyph />
        </IconWell>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>
            {t("integrations.source.healthConnect")}
          </Text>
          <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
            {on ? t("library.sources.hcOn") : t("library.sources.hcOff")}
          </Text>
        </View>
        <Toggle
          on={on}
          onToggle={() => toggle(!on)}
          onColor={colors.green.fill}
          offColor={colors.sandLight}
          accessibilityLabel={t("integrations.source.healthConnect")}
        />
      </ListCard>
    </>
  );
}
