/**
 * Portion-adjust content (APP-079) — rides the shared PopOverlay chrome (kept in
 * plan.tsx). Two cards: a live daily-totals mini-card (Card A) that updates as the
 * slider moves, and the editor (Card B) with the big qty readout + slider + numeric
 * field. Every slider/numeric change commits immediately via `onChangeQty` — no
 * cancel/revert (DESIGN-SPEC): the overlay write is already persistent, exactly
 * like the prototype. "Done" only closes.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import type { MacroTotals, PlanItem } from "../api/client";
import { barPct, boundsOf, itemTotals, kcalLabel, qtyLabel } from "./compute";
import { Button, Card, EditableText, Slider, Text, colors, fonts, shadowPop, tint, useAccent } from "../ui";

const MACROS = [
  { key: "proteinG", color: colors.macro.protein },
  { key: "carbsG", color: colors.macro.carbs },
  { key: "fatG", color: colors.macro.fat },
] as const;

/** Compact macro bars for Card A (52px label · 6px track · 38px value). */
function MiniBars({ totals }: { totals: Required<MacroTotals> }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 5 }}>
      {MACROS.map((m) => {
        const g = totals[m.key];
        return (
          <View key={m.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11, width: 52 }} color="#6E6355">
              {t(`plan.${m.key === "proteinG" ? "protein" : m.key === "carbsG" ? "carbs" : "fat"}`)}
            </Text>
            <View style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: colors.track, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${barPct(g, totals.proteinG, totals.carbsG, totals.fatG)}%`, borderRadius: 4, backgroundColor: m.color }} />
            </View>
            <Text variant="caption" style={{ fontSize: 11, width: 38, textAlign: "right" }} color={colors.muted}>
              {Math.round(g)} g
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function PortionPop({
  item,
  qty,
  mealName,
  mealTime,
  dailyTotals,
  onChangeQty,
  onClose,
}: {
  item: PlanItem;
  qty: number;
  mealName: string;
  mealTime?: string;
  dailyTotals: Required<MacroTotals>;
  onChangeQty: (next: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const bounds = boundsOf(item);
  const itemMacros = itemTotals(item, qty);
  const kcal = Math.round(itemMacros.kcal);

  return (
    <View style={{ gap: 12 }}>
      {/* Card A — live daily totals (updates on every tick) */}
      <Animated.View entering={FadeIn.duration(250)}>
        <Card style={{ gap: 10, padding: 16, borderRadius: 22, ...shadowPop }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontFamily: fonts.light, fontSize: 26, letterSpacing: -0.5 }}>{kcalLabel(dailyTotals.kcal)}</Text>
            <Text variant="caption" style={{ fontSize: 11.5, flex: 1 }} color={colors.muted}>
              {t("plan.updatesLive")}
            </Text>
          </View>
          <MiniBars totals={dailyTotals} />
        </Card>
      </Animated.View>

      {/* Card B — editor */}
      <Animated.View entering={FadeIn.duration(300).delay(50)}>
        <Card style={{ gap: 13, padding: 20, borderRadius: 26, borderWidth: 1.5, borderColor: tint(accent, 25), ...shadowPop }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text variant="title" style={{ fontSize: 17 }}>
                {item.name || t("plan.itemNamePlaceholder")}
              </Text>
              <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
                {mealTime ? t("plan.mealAt", { name: mealName, time: mealTime }) : mealName}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={{ fontFamily: fonts.light, fontSize: 22 }}>~{kcal}</Text>
              <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 12 }} color={colors.muted}>
                {t("common.kcal")}
              </Text>
            </View>
          </View>

          <Text style={{ textAlign: "center", fontSize: 30, fontFamily: fonts.semiBold, letterSpacing: -0.5 }} color={accent}>
            {qtyLabel(item.unit, qty)}
          </Text>

          <Slider
            value={qty}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            accessibilityLabel={t("plan.portionFor", { name: item.name })}
            onChange={onChangeQty}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {bounds.min}
            </Text>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {bounds.max}
            </Text>
          </View>

          {/* macro pill: P / C / F */}
          <View style={{ alignSelf: "center", backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}>
            <Text variant="caption" style={{ fontSize: 12 }} color="#6E6355">
              P {Math.round(itemMacros.proteinG)} g · C {Math.round(itemMacros.carbsG)} g · F {Math.round(itemMacros.fatG)} g
            </Text>
          </View>

          {/* numeric "exact" field — dual input (A6) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center" }}>
            <Text variant="caption" color={colors.muted}>
              {t("plan.exact")}
            </Text>
            <EditableText
              value={String(qty)}
              editing
              numeric
              onChangeText={(text) => {
                const n = parseFloat(text);
                if (!Number.isFinite(n)) return;
                // clamp to [min,max] and snap to step
                const clamped = Math.min(bounds.max, Math.max(bounds.min, n));
                const snapped = bounds.step > 0 ? Math.round(clamped / bounds.step) * bounds.step : clamped;
                onChangeQty(snapped);
              }}
              textStyle={{ fontSize: 15, minWidth: 60, textAlign: "center" }}
              accessibilityLabel={t("plan.exact")}
            />
            {item.unit ? (
              <Text variant="caption" color={colors.muted}>
                {item.unit}
              </Text>
            ) : null}
          </View>

          <Button label={t("plan.done")} onPress={onClose} />
        </Card>
      </Animated.View>
    </View>
  );
}
