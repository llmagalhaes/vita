/**
 * The 3 P/C/F macro bars (protein/carbs/fat), normalized to the largest macro
 * with 10% headroom so a bar never hits 100% (`barPct`). Extracted from plan.tsx
 * (APP-087) so the Eating Plan doc screen and Today's plan summary render the
 * identical bar row. View-only; pass the daily totals.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { barPct } from "./compute";
import { Text, colors, fonts } from "../ui";

const MACROS = [
  { key: "proteinG", color: colors.macro.protein, tKey: "plan.protein" },
  { key: "carbsG", color: colors.macro.carbs, tKey: "plan.carbs" },
  { key: "fatG", color: colors.macro.fat, tKey: "plan.fat" },
] as const;

export function MacroBars({ totals }: { totals: { proteinG: number; carbsG: number; fatG: number } }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      {MACROS.map((m) => {
        const g = totals[m.key as "proteinG" | "carbsG" | "fatG"];
        return (
          <View key={m.key} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#6E6355">
                {t(m.tKey)}
              </Text>
              <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
                {Math.round(g)} g
              </Text>
            </View>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.track, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${barPct(g, totals.proteinG, totals.carbsG, totals.fatG)}%`, borderRadius: 4, backgroundColor: m.color }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
