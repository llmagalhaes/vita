/**
 * Export sheet (APP-031 → APP-103, prototype lines 1292–1306). Pick who reads it,
 * read the one-line note, create the PDF. v4 drops the per-section chips: the
 * recipient IS the shape, so the chosen audience's sections are used as-is.
 *
 * Unlike the prototype (which only toasts), this really builds the PDF on-device
 * from local SQLite via expo-print and hands it to the OS share sheet — nothing
 * leaves the phone until the user picks a share target.
 */
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SheetOverlay, Text, colors, fonts, shadowCta } from "../ui";
import { AUDIENCES, exportPdf } from "./pdf";

/** The prototype's three chips, in order — `doctor` is not a v4 recipient. */
const RECIPIENTS = ["nutritionist", "trainer", "myself"] as const;
type Recipient = (typeof RECIPIENTS)[number];

export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [recipient, setRecipient] = useState<Recipient>("nutritionist");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportPdf({
        audienceLabel: t(`export.audience.${recipient}`),
        sections: AUDIENCES.find((a) => a.id === recipient)!.sections,
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
      <View style={{ gap: 13 }}>
        <Text variant="title" style={{ fontSize: 16 }}>{t("library.away.shareTitle")}</Text>

        <View style={{ flexDirection: "row", gap: 6 }}>
          {RECIPIENTS.map((r) => {
            const on = recipient === r;
            return (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setRecipient(r)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 15,
                  borderWidth: 1.5,
                  borderColor: on ? colors.dark.bg : colors.borderControl,
                  backgroundColor: on ? colors.dark.bg : colors.card,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.dark.ink : colors.inkMuted}>
                  {t(`library.away.recipient.${r}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" style={{ fontSize: 12.5, lineHeight: 19 }} color={colors.muted}>
          {t(`library.away.recipientNote.${recipient}`)}
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={create}
          style={{ height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1, ...shadowCta(colors.accent) }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color="#FFF9F1">
            {busy ? t("export.preparing") : t("library.away.createPdf")}
          </Text>
        </Pressable>
        <Text variant="caption" style={{ textAlign: "center" }} color={colors.labelMuted}>{t("export.window")}</Text>
      </View>
    </SheetOverlay>
  );
}
