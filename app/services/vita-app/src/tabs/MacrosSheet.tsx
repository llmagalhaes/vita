/**
 * Macros pop-up (CEO #5, prototype "Macros pop-up"). Tapping the Home macros card
 * opens this full sheet over the blurred backdrop instead of the old in-card
 * expansion: per-macro grams + bar, then a breakdown of each meal that contributed.
 * Informational only — estimates labeled, no goals/targets (philosophy).
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { Bar, SheetOverlay, Text, colors, fonts, spacing } from "../ui";

export type MacroMeal = { id: string; title: string; proteinG: number; carbsG: number; fatG: number; kcal: number; at: string };

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MacrosSheet({
  visible,
  onClose,
  macros,
  meals,
}: {
  visible: boolean;
  onClose: () => void;
  macros: { protein: number; carbs: number; fat: number };
  meals: MacroMeal[];
}) {
  const { t } = useTranslation();
  const max = Math.max(macros.protein, macros.carbs, macros.fat, 1);
  const rows = [
    ["protein", macros.protein, colors.macro.protein],
    ["carbs", macros.carbs, colors.macro.carbs],
    ["fat", macros.fat, colors.macro.fat],
  ] as const;

  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text variant="title" style={{ fontSize: 17 }}>
              {t("home.macrosSheetTitle")}
            </Text>
            <Text variant="caption" style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
              {meals.length === 1 ? t("home.macrosMealsOne") : t("home.macrosMealsMany", { count: meals.length })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            hitSlop={8}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#F0EDE2", alignItems: "center", justifyContent: "center" }}
          >
            <Svg width={12} height={12}>
              <Path d="M2.5 2.5 l7 7 M9.5 2.5 l-7 7" stroke={colors.muted} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>

        {rows.map(([key, grams, color]) => (
          <View key={key} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#6E6355">
                {t(`home.${key}`)}
              </Text>
              <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
                {Math.round(grams)} g
              </Text>
            </View>
            <Bar pct={(grams / max) * 100} color={color} />
          </View>
        ))}

        {meals.length > 0 && (
          <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: "rgba(120,100,75,0.18)", paddingTop: 11, gap: 7 }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.labelMuted}>
              {t("home.macrosFromMeals")}
            </Text>
            {meals.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.sheet }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 10.5, marginTop: 1 }} color={colors.muted}>
                    {Math.round(m.proteinG)} {t("home.protein")} · {Math.round(m.carbsG)} {t("home.carbs")} · {Math.round(m.fatG)} {t("home.fat")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color="#6E6355">
                    {Math.round(m.kcal)} {t("common.kcal")}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 10 }} color={colors.labelMuted}>
                    {timeOf(m.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text variant="caption" style={{ fontSize: 10.5, textAlign: "center" }} color={colors.labelMuted}>
          {t("home.macrosSheetFooter")}
        </Text>
      </View>
    </SheetOverlay>
  );
}
