/**
 * "Training programs" (APP-103, prototype lines 778–791) — the program's days,
 * each with its exercise count and kcal estimate, plus the ONE import entry point:
 * the existing ImportProgramSheet (PDF or spoken/typed). No second importer, and
 * no row for a program that isn't there.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { Text, colors, fonts, radii, shadowCard, useAccent } from "../../ui";
import { getCachedProgram } from "../../db/plan";
import { useLogVersion } from "../../db/notify";
import { ImportProgramSheet } from "../../workout/ImportProgramSheet";
import { PillButton, SectionLabel, tinted } from "../parts";

/** Prototype's 16×16 barbell. */
const BarbellGlyph = ({ accent }: { accent: string }) => (
  <Svg width={16} height={16}>
    <Path
      d="M1.5 8 h2 M12.5 8 h2 M4.5 5 v6 M11.5 5 v6 M4.5 8 h7"
      fill="none"
      stroke={accent}
      strokeWidth={1.7}
      strokeLinecap="round"
    />
  </Svg>
);

export function Programs() {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  void version;
  const program = getCachedProgram();
  const [importing, setImporting] = useState(false);

  return (
    <>
      <SectionLabel>{t("library.programs.title")}</SectionLabel>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: radii.card,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.borderFaint,
          gap: 11,
          ...shadowCard,
        }}
      >
        {program?.days.length ? (
          program.days.map((d) => (
            <View key={d.name} style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: tinted(accent), alignItems: "center", justifyContent: "center" }}>
                <BarbellGlyph accent={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>{d.name}</Text>
                <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
                  {d.kcalEstimate
                    ? t("library.programs.daySubKcal", { n: d.exercises.length, kcal: d.kcalEstimate })
                    : t("library.programs.daySub", { n: d.exercises.length })}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 12.5, lineHeight: 19 }} color={colors.muted}>{t("library.programs.none")}</Text>
        )}
        <PillButton label={t("library.programs.import")} onPress={() => setImporting(true)} tone="tinted" accent={accent} height={44} />
      </View>
      {importing ? <ImportProgramSheet onClose={() => setImporting(false)} /> : null}
    </>
  );
}
