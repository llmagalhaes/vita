/**
 * APP-097 — Overview · Macros (prototype lines 473–484).
 *
 * Recorded grams per macro against the plan's day, each bar `recorded/plan` capped at
 * 100%. It is a comparison, never a target: the footer says "estimates" and no state
 * of the bar is ever good or bad. Tapping opens the Macros **pop** (PopOverlay,
 * session-21 rule) — the existing `MacrosSheet`, which is already that pop.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MacroTotals } from "../../api/client";
import { MacrosSheet, type MacroMeal } from "./MacrosSheet";
import { Bar, Text, colors, fonts } from "../../ui";
import { MicroLabel, cardSurfaceRaised } from "./parts";

/** `recorded / plan` as a 0–100 bar. No plan (0 g) ⇒ empty bar, never a divide-by-zero. */
export const macroPct = (recorded: number, plan: number): number =>
  plan > 0 ? Math.min(100, Math.round((recorded / plan) * 100)) : 0;

export function MacrosCard({
  recorded,
  plan,
  meals,
}: {
  recorded: Required<MacroTotals>;
  plan: Required<MacroTotals>;
  meals: MacroMeal[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const rows = [
    ["protein", recorded.proteinG, plan.proteinG, colors.macro.protein],
    ["carbs", recorded.carbsG, plan.carbsG, colors.macro.carbs],
    ["fat", recorded.fatG, plan.fatG, colors.macro.fat],
  ] as const;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t("overview.macros.label")} onPress={() => setOpen(true)} style={{ flex: 1.35 }}>
        <View style={{ ...cardSurfaceRaised, padding: 15, gap: 10, justifyContent: "center" }}>
          <MicroLabel>{t("overview.macros.label")}</MicroLabel>
          {rows.map(([key, g, planG, color]) => (
            <View key={key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.inkMuted}>
                  {t(`common.${key}`)}
                </Text>
                <Text style={{ fontSize: 12.5 }} color={colors.muted}>
                  {t("overview.macros.grams", { recorded: Math.round(g), plan: Math.round(planG) })}
                </Text>
              </View>
              <Bar pct={macroPct(g, planG)} color={color} />
            </View>
          ))}
          <Text style={{ fontSize: 10 }} color={colors.faint}>
            {t("overview.macros.footer")}
          </Text>
        </View>
      </Pressable>

      <MacrosSheet
        visible={open}
        onClose={() => setOpen(false)}
        macros={{ protein: recorded.proteinG, carbs: recorded.carbsG, fat: recorded.fatG }}
        meals={meals}
      />
    </>
  );
}
