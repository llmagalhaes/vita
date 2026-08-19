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
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, fonts, getSceneOverride, setSceneOverride, typeScale, type SceneOverride } from "../ui";
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
            {t("shell.panels.library")}
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

        <SceneSwitcher />
      </ScrollView>
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    </View>
  );
}

/**
 * TEST-ONLY (CEO batch #1): the evening scene only exists after 18:00, so the dark
 * header can't be reviewed in daylight. Writes the `dev.scene` kv override that
 * `useSceneName` honours; "Auto" hands the header back to the clock.
 *
 * ponytail: hard-coded English, no i18n keys, no settings row — delete this component
 * and its one call site above and the feature is gone.
 */
function SceneSwitcher() {
  const current = getSceneOverride();
  const opts: SceneOverride[] = ["auto", "morning", "afternoon", "evening"];
  return (
    <View style={{ alignItems: "center", gap: 4, paddingTop: 10, opacity: 0.75 }}>
      <Text style={{ fontSize: typeScale.micro, letterSpacing: 0.6 }} color={colors.labelMuted}>
        DEV · SCENE
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {opts.map((o) => (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityLabel={`Scene ${o}`}
            onPress={() => setSceneOverride(o)}
            style={{
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderControl,
              backgroundColor: o === current ? colors.card : "transparent",
            }}
          >
            <Text style={{ fontSize: 11, fontFamily: fonts.bold }} color={o === current ? colors.ink : colors.muted}>
              {o[0]!.toUpperCase() + o.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
