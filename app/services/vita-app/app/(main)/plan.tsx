import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { EatingPlanDraft, PlanItem } from "../../src/api";
import { getCachedPlan, updatePlan } from "../../src/db/plan";
import { logChanged, useLogVersion } from "../../src/db/notify";
import { itemTotals, mealTotals, planDailyTotals, portionRange } from "../../src/plan/compute";
import { EditHeader } from "../../src/plan/editor";
import {
  Button,
  Card,
  EditableText,
  EstimateTag,
  KeyboardAvoider,
  PopOverlay,
  Slider,
  Text,
  colors,
  fonts,
  shadowPop,
  spacing,
} from "../../src/ui";

const clone = (p: EatingPlanDraft): EatingPlanDraft => JSON.parse(JSON.stringify(p));

const round = (n: number) => Math.round(n);
const qtyLabel = (it: PlanItem) => `${it.quantity ?? 1}${it.unit ? ` ${it.unit}` : ""}`;

const MACROS = [
  { key: "proteinG", color: colors.macro.protein, tKey: "plan.protein" },
  { key: "carbsG", color: colors.macro.carbs, tKey: "plan.carbs" },
  { key: "fatG", color: colors.macro.fat, tKey: "plan.fat" },
] as const;

function MacroBars({ totals }: { totals: { proteinG: number; carbsG: number; fatG: number } }) {
  const { t } = useTranslation();
  const max = Math.max(totals.proteinG, totals.carbsG, totals.fatG, 1);
  return (
    <View style={{ gap: 6 }}>
      {MACROS.map((m) => {
        const g = totals[m.key as "proteinG" | "carbsG" | "fatG"];
        return (
          <View key={m.key} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="caption" style={{ fontFamily: fonts.bold }} color="#6E6355">
                {t(m.tKey)}
              </Text>
              <Text variant="caption" color={colors.muted}>
                {round(g)} g
              </Text>
            </View>
            <View style={{ height: 7, borderRadius: 4, backgroundColor: "#F0E9DA", overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${(g / max) * 100}%`, borderRadius: 4, backgroundColor: m.color }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function EatingPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const saved = useMemo(() => getCachedPlan(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<EatingPlanDraft | null>(null);
  const [sel, setSel] = useState<{ mi: number; ii: number } | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const view = editing && working ? working : saved;

  const mutate = (fn: (d: EatingPlanDraft) => void) =>
    setWorking((w) => {
      if (!w) return w;
      const c = clone(w);
      fn(c);
      return c;
    });

  const startEdit = () => {
    if (!saved) return;
    setWorking(clone(saved));
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setWorking(null);
    setSel(null);
  };
  const save = () => {
    if (working) {
      void updatePlan(working).then(logChanged); // whole-doc PUT — backend re-encrypts the blob
    }
    setEditing(false);
    setWorking(null);
    setSel(null);
  };

  if (!view) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, gap: 15 }}>
        <EditHeader eyebrow={t("plan.eyebrow")} editing={false} back={back} onEdit={() => {}} onCancel={cancel} onSave={save} />
        <Text variant="body" color={colors.muted}>
          {t("plan.empty")}
        </Text>
      </ScrollView>
    );
  }

  const totals = planDailyTotals(view);
  const selItem = sel && view.meals[sel.mi]?.items[sel.ii];

  return (
    <KeyboardAvoider>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 13 }}
      keyboardShouldPersistTaps="handled"
    >
      <EditHeader
        eyebrow={t("plan.eyebrow")}
        editing={editing}
        back={back}
        onEdit={startEdit}
        onCancel={cancel}
        onSave={save}
      />

      {/* title */}
      <View>
        <EditableText
          value={view.summary}
          editing={editing}
          onChangeText={(text) => mutate((d) => (d.summary = text))}
          placeholder={t("plan.titlePlaceholder")}
          textStyle={{ fontSize: 22, fontFamily: fonts.bold, color: colors.ink }}
          multiline
          accessibilityLabel={t("plan.titlePlaceholder")}
        />
        <Text variant="caption" color={colors.muted} style={{ marginTop: 4 }}>
          {t("plan.yourReference")}
        </Text>
      </View>

      {/* daily totals */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 42, fontFamily: fonts.light, letterSpacing: -1 }}>
              {round(totals.kcal)}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {t("plan.kcalPlanned")}
            </Text>
          </View>
          <EstimateTag label={t("common.estimate")} />
        </View>
        <MacroBars totals={totals} />
        {view.micros && view.micros.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {view.micros.map((m) => (
              <View key={m.name} style={{ backgroundColor: "#F0EDE2", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
                <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11 }} color="#6E6355">
                  {m.name}
                  {m.percentDaily != null ? ` ${m.percentDaily}%` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* meals */}
      {view.meals.map((meal, mi) => {
        const mTotals = mealTotals(meal);
        return (
          <Card key={mi} style={{ gap: 4, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <EditableText
                  value={meal.name}
                  editing={editing}
                  onChangeText={(text) => mutate((d) => (d.meals[mi]!.name = text))}
                  placeholder={t("plan.mealNamePlaceholder")}
                  textStyle={{ fontSize: 15, fontFamily: fonts.bold }}
                />
                <EditableText
                  value={meal.time ?? ""}
                  editing={editing}
                  onChangeText={(text) => mutate((d) => (d.meals[mi]!.time = text || undefined))}
                  placeholder={t("plan.timePlaceholder")}
                  textStyle={{ fontSize: 11.5, color: colors.labelMuted }}
                />
              </View>
              <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.muted}>
                {round(mTotals.kcal)} {t("common.kcal")}
              </Text>
            </View>

            {meal.items.map((it, ii) => (
              <View
                key={ii}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 9,
                  borderBottomWidth: ii === meal.items.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(120,100,75,0.07)",
                }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#E8B48C" }} />
                <View style={{ flex: 1 }}>
                  <EditableText
                    value={it.name}
                    editing={editing}
                    onChangeText={(text) => mutate((d) => (d.meals[mi]!.items[ii]!.name = text))}
                    placeholder={t("plan.itemNamePlaceholder")}
                    textStyle={{ fontSize: 14 }}
                  />
                </View>
                {/* quantity chip — tap opens the portion sheet (slider + numeric) in edit mode */}
                <Pressable
                  accessibilityRole={editing ? "button" : "text"}
                  disabled={!editing}
                  onPress={() => editing && setSel({ mi, ii })}
                  style={{
                    backgroundColor: editing ? "rgba(196,112,78,0.12)" : "transparent",
                    borderRadius: 11,
                    paddingVertical: 4,
                    paddingHorizontal: 9,
                  }}
                >
                  <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.accent}>
                    {qtyLabel(it)}
                  </Text>
                </Pressable>
                <Text variant="caption" color={colors.muted} style={{ minWidth: 42, textAlign: "right" }}>
                  {round(itemTotals(it).kcal)}
                </Text>
                {editing && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("plan.removeItem")}
                    onPress={() => mutate((d) => d.meals[mi]!.items.splice(ii, 1))}
                    hitSlop={8}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 16 }} color={colors.labelMuted}>
                      ×
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}

            {editing && (
              <View style={{ flexDirection: "row", gap: 10, paddingTop: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    mutate((d) =>
                      d.meals[mi]!.items.push({ name: "", quantity: 1, unit: "", nutritionPerUnit: { kcal: 0 } }),
                    )
                  }
                >
                  <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.accent}>
                    + {t("plan.addItem")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => mutate((d) => d.meals.splice(mi, 1))}
                >
                  <Text variant="caption" color={colors.labelMuted}>
                    {t("plan.removeMeal")}
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>
        );
      })}

      {editing ? (
        <Button
          label={t("plan.addMeal")}
          variant="ghost"
          onPress={() => mutate((d) => d.meals.push({ name: "", items: [] }))}
        />
      ) : (
        <Text variant="caption" color={colors.labelMuted} style={{ textAlign: "center", paddingHorizontal: 16 }}>
          {t("plan.tapHint")}
        </Text>
      )}

      {/* portion adjust pop-up — centered, blurred backdrop (APP-051 PopOverlay) */}
      <PopOverlay visible={sel != null} onClose={() => setSel(null)} closeLabel={t("common.cancel")}>
        {selItem && sel && (
          <View style={{ gap: spacing.md }}>
            {/* live plan totals floating above the slider card — updates as you drag (prototype) */}
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, ...shadowPop }}>
              <Text variant="caption" style={{ fontFamily: fonts.bold }} color={colors.muted}>
                {t("plan.dailyTotals")}
              </Text>
              <Text style={{ fontFamily: fonts.light, fontSize: 19 }}>
                {round(totals.kcal)}{" "}
                <Text variant="caption" color={colors.muted}>
                  {t("common.kcal")}
                </Text>
              </Text>
            </Card>
            <View
              style={{ backgroundColor: colors.card, borderRadius: 26, padding: 20, gap: 13, borderWidth: 1.5, borderColor: "rgba(196,112,78,0.25)", ...shadowPop }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="title" style={{ fontSize: 17 }}>
                    {selItem.name || t("plan.itemNamePlaceholder")}
                  </Text>
                  <Text variant="caption" color={colors.muted}>
                    {view.meals[sel.mi]!.name}
                  </Text>
                </View>
                <Text style={{ fontSize: 22, fontFamily: fonts.light }}>
                  {round(itemTotals(selItem).kcal)}{" "}
                  <Text variant="caption" color={colors.muted}>
                    {t("common.kcal")}
                  </Text>
                </Text>
              </View>

              <Text style={{ textAlign: "center", fontSize: 28, fontFamily: fonts.bold }} color={colors.accent}>
                {qtyLabel(selItem)}
              </Text>

              {(() => {
                const r = portionRange(selItem.quantity);
                return (
                  <Slider
                    value={selItem.quantity ?? 1}
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    accessibilityLabel={t("plan.portionFor", { name: selItem.name })}
                    onChange={(q) => mutate((d) => (d.meals[sel.mi]!.items[sel.ii]!.quantity = q))}
                  />
                );
              })()}

              {/* numeric field — dual input alongside the slider */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center" }}>
                <Text variant="caption" color={colors.muted}>
                  {t("plan.exact")}
                </Text>
                <EditableText
                  value={String(selItem.quantity ?? 1)}
                  editing
                  numeric
                  onChangeText={(text) => {
                    const n = parseFloat(text);
                    mutate((d) => (d.meals[sel.mi]!.items[sel.ii]!.quantity = Number.isFinite(n) ? n : 0));
                  }}
                  textStyle={{ fontSize: 15, minWidth: 60, textAlign: "center" }}
                  accessibilityLabel={t("plan.exact")}
                />
                {selItem.unit ? (
                  <Text variant="caption" color={colors.muted}>
                    {selItem.unit}
                  </Text>
                ) : null}
              </View>

              <Button label={t("common.confirm")} onPress={() => setSel(null)} />
            </View>
          </View>
        )}
      </PopOverlay>
    </ScrollView>
    </KeyboardAvoider>
  );
}
