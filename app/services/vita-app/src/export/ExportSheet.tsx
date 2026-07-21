/**
 * Export sheet (APP-031, D2). Pick a reader, adjust the content chips, prepare a
 * PDF. Everything is built on-device from local SQLite and handed to the OS share
 * sheet — nothing leaves the phone until the user chooses a share target.
 */
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chevron, SheetOverlay, Text, colors, fonts, shadowCta } from "../ui";
import { AUDIENCES, exportPdf, type Section } from "./pdf";

const ALL_SECTIONS: Section[] = ["meals", "water", "workouts", "energy", "macros"];

export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState(false);

  const pickAudience = (id: string) => {
    if (audienceId === id) {
      setAudienceId(null);
      return;
    }
    setAudienceId(id);
    setSections(AUDIENCES.find((a) => a.id === id)!.sections);
  };

  const toggleSection = (s: Section) =>
    setSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const prepare = async () => {
    if (!audienceId || sections.length === 0 || busy) return;
    setBusy(true);
    try {
      await exportPdf({
        audienceLabel: t(`export.audience.${audienceId}`),
        sections,
        t,
      });
      onClose();
    } catch (e) {
      // Surface the real failure instead of a silent no-op (CEO bug #4). Stay open.
      Alert.alert(t("export.title"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ gap: 12 }}>
        <View style={{ marginBottom: 2 }}>
          <Text variant="title" style={{ fontSize: 19 }}>{t("export.title")}</Text>
          <Text variant="caption" color={colors.muted}>{t("export.subtitle")}</Text>
        </View>

        {AUDIENCES.map((a) => {
          const open = audienceId === a.id;
          return (
            <View key={a.id} style={{ backgroundColor: colors.card, borderWidth: 1.5, borderColor: open ? colors.accent : colors.border, borderRadius: 18, overflow: "hidden" }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => pickAudience(a.id)} style={{ flexDirection: "row", alignItems: "center", gap: 11, padding: 13 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ fontSize: 14.5 }}>{t(`export.audience.${a.id}`)}</Text>
                  <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>{t(`export.audienceSub.${a.id}`)}</Text>
                </View>
                <Chevron open={open} size={13} />
              </Pressable>
              {open && (
                <View style={{ paddingHorizontal: 13, paddingBottom: 13, gap: 10 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {ALL_SECTIONS.map((s) => {
                      const on = sections.includes(s);
                      return (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => toggleSection(s)}
                          style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: 13, backgroundColor: on ? colors.estimateBg : colors.track }}
                        >
                          <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11.5 }} color={on ? colors.estimateInk : colors.muted}>
                            {t(`export.section.${s}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text variant="caption" color={colors.labelMuted}>{t("export.window")}</Text>
                  <Pressable accessibilityRole="button" disabled={sections.length === 0 || busy} onPress={prepare} style={{ height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: sections.length === 0 || busy ? 0.5 : 1, ...(sections.length === 0 || busy ? null : shadowCta(colors.accent)) }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">{busy ? t("export.preparing") : t("export.prepare")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>{t("export.footer")}</Text>
      </View>
    </SheetOverlay>
  );
}
