/**
 * "Away & sharing" (APP-103, prototype lines 845–863) — two rows: vacation mode
 * (Set up / End) and the export. Vacation semantics are real in v4: the duration
 * chip IS the range, so "This week" ends by itself, and "keep the water card"
 * really keeps the water card and its reminder alive (src/db/vacation.ts).
 *
 * The export sheet is owned by the panel (the Account delete-confirm opens it too),
 * so this section only asks for it.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Path } from "react-native-svg";
import { ConfirmSheet, Text, colors, fonts, showToast, useAccent } from "../../ui";
import { endVacation, getVacation, isVacationActive } from "../../db/vacation";
import { useLogVersion } from "../../db/notify";
import { VacationSheet } from "../../vacation/VacationSheet";
import { IconWell, ListCard, SectionLabel, tinted } from "../parts";

const SEA = colors.vacationAccent;

const SunGlyph = () => (
  <Svg width={18} height={18}>
    <Circle cx={9} cy={9} r={3.4} fill="none" stroke={SEA} strokeWidth={1.6} />
    <Path
      d="M9 1.6 v2 M9 14.4 v2 M1.6 9 h2 M14.4 9 h2 M3.8 3.8 l1.4 1.4 M12.8 12.8 l1.4 1.4 M14.2 3.8 l-1.4 1.4 M3.8 14.2 l1.4 -1.4"
      stroke={SEA}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Svg>
);

const UploadGlyph = ({ accent }: { accent: string }) => (
  <Svg width={18} height={18}>
    <Path d="M9 11.5 V2.8 M5.8 5.8 L9 2.6 L12.2 5.8" fill="none" stroke={accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3.5 10.5 v4.5 h11 v-4.5" fill="none" stroke={accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export function AwaySharing({ onExport }: { onExport: () => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  void version;
  const on = isVacationActive();
  const vac = getVacation();
  const [setupOpen, setSetupOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const sub = on
    ? t("library.away.vacationOn", {
        duration: t(`vacation.duration.${vac.duration}`),
        keep: t(vac.keepWater ? "library.away.keepingWater" : "library.away.allPaused"),
      })
    : t("library.away.vacationOff");

  return (
    <>
      <SectionLabel>{t("library.away.title")}</SectionLabel>

      <ListCard style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
        <IconWell bg={colors.vacation.bg}>
          <SunGlyph />
        </IconWell>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>{t("vacation.title")}</Text>
          <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>{sub}</Text>
        </View>
        {on ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setEndOpen(true)}
            style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 17, borderWidth: 1.5, borderColor: colors.borderControlStrong }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.inkMuted}>{t("library.away.end")}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSetupOpen(true)}
            style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 17, backgroundColor: colors.vacation.bg }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={SEA}>{t("library.away.setUp")}</Text>
          </Pressable>
        )}
      </ListCard>

      <ListCard style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
        <IconWell bg={tinted(accent)}>
          <UploadGlyph accent={accent} />
        </IconWell>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>{t("library.away.shareTitle")}</Text>
          <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>{t("library.away.shareSub")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onExport}
          style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 17, backgroundColor: accent }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#FFF9F1">{t("library.away.export")}</Text>
        </Pressable>
      </ListCard>

      <VacationSheet visible={setupOpen} onClose={() => setSetupOpen(false)} />
      <ConfirmSheet
        visible={endOpen}
        title={t("library.away.endConfirmTitle")}
        message={t("library.away.endConfirmBody")}
        confirmLabel={t("library.away.end")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          endVacation();
          setEndOpen(false);
          showToast(t("library.away.endedToast"));
        }}
        onClose={() => setEndOpen(false)}
      />
    </>
  );
}
