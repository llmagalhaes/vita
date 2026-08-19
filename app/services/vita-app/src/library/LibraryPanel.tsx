/**
 * Library panel (APP-103, prototype lines 716–866) — the third panel: what Vita
 * keeps, your plan, your programs, your habits, the one real connected source,
 * away & sharing, and your account. In that order.
 *
 * Two rules the whole panel obeys:
 *  · **No fake row.** Only surfaces Vita actually implements appear — no Garmin,
 *    Strava, Flo, and no Apple Health on Android. The Connected-sources section is
 *    hidden outright on iOS (CEO Q3) rather than shown empty.
 *  · **Nothing is lost silently.** Every destructive action either has an Undo in
 *    its toast (habit removal, an added meal, a composition toggle) or a confirm
 *    (ending a trip, deleting your data).
 *
 * Sections gate on the composition flags (src/db/domains.ts) exactly like the Day:
 * turning Meals off hides the eating plan here too — it never deletes it.
 */
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, fonts, typeScale } from "../ui";
import { useDomains } from "../db/domains";
import { getSettings } from "../db/settings";
import { useLogVersion } from "../db/notify";
import { ExportSheet } from "../export/ExportSheet";
import { SectionLabel } from "./parts";
import { Account } from "./sections/Account";
import { AwaySharing } from "./sections/AwaySharing";
import { EatingPlan } from "./sections/EatingPlan";
import { Habits } from "./sections/Habits";
import { Keeps } from "./sections/Keeps";
import { Programs } from "./sections/Programs";
import { Sources } from "./sections/Sources";

export function LibraryPanel() {
  const { t } = useTranslation();
  const version = useLogVersion();
  void version;
  const domains = useDomains();
  const name = getSettings()?.name?.trim() || t("library.account.you");
  // One export sheet for the panel: the Away row and the delete-confirm's
  // "Export first" both open this instance.
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 120, gap: 13 }}
      >
        <View style={{ paddingHorizontal: 2 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: typeScale.screenTitle }} color={colors.inkHeading}>
            {t("nav.panels.library")}
          </Text>
          <Text style={{ fontSize: 13, marginTop: 1 }} color={colors.muted}>{t("library.subtitle", { name })}</Text>
        </View>

        <Keeps />
        {domains.meals ? <EatingPlan /> : null}
        {domains.move ? <Programs /> : null}
        {domains.habits ? <Habits /> : null}
        <Sources />
        <AwaySharing onExport={() => setExportOpen(true)} />
        <SectionLabel>{t("library.account.title")}</SectionLabel>
        <Account onExport={() => setExportOpen(true)} />

        <Text style={{ fontSize: typeScale.micro, textAlign: "center", paddingTop: 2, paddingHorizontal: 20 }} color={colors.labelMuted}>
          {t("library.footer")}
        </Text>
      </ScrollView>
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    </View>
  );
}
