import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeInUp } from "react-native-reanimated";
import { isMockApi } from "../../src/api";
import type { EatingPlanDraft } from "../../src/api";
import { getCachedPlan, getPlanMeta, getPortions, setPlanMeta, setPortion, updatePlan } from "../../src/db/plan";
import { logChanged, useLogVersion } from "../../src/db/notify";
import {
  barPct,
  itemTotals,
  kcalLabel,
  mealTotals,
  planDailyTotals,
  planMicroTotals,
  qtyLabel,
  qtyOf,
} from "../../src/plan/compute";
import { EditHeader } from "../../src/plan/editor";
import { PortionPop } from "../../src/plan/PortionPop";
import {
  Button,
  Card,
  EditableText,
  EstimateTag,
  KeyboardAvoider,
  PopOverlay,
  Text,
  colors,
  fonts,
  tint,
  useAccent,
} from "../../src/ui";

const clone = (p: EatingPlanDraft): EatingPlanDraft => JSON.parse(JSON.stringify(p));
const round = (n: number) => Math.round(n);
const dateShort = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const MACROS = [
  { key: "proteinG", color: colors.macro.protein, tKey: "plan.protein" },
  { key: "carbsG", color: colors.macro.carbs, tKey: "plan.carbs" },
  { key: "fatG", color: colors.macro.fat, tKey: "plan.fat" },
] as const;

/** 3 macro bars normalized to the largest macro with 10% headroom (never 100%). */
function MacroBars({ totals }: { totals: { proteinG: number; carbsG: number; fatG: number } }) {
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
                {round(g)} g
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

export default function EatingPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const version = useLogVersion();
  const saved = useMemo(() => getCachedPlan(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const portions = useMemo(() => getPortions(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = useMemo(() => getPlanMeta(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo affordance: the seeded mock plan has no import metadata — badge it as a
  // nutritionist PDF so the mock build matches the handoff. No-op in real mode.
  useEffect(() => {
    if (isMockApi && saved && !getPlanMeta()) {
      setPlanMeta("pdf");
      logChanged();
    }
  }, [saved]);

  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<EatingPlanDraft | null>(null);
  const [sel, setSel] = useState<{ mi: number; ii: number } | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));
  const view = editing && working ? working : saved;
  const activePortions = editing ? {} : portions; // edit mode edits doc quantities directly

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
    if (working) void updatePlan(working).then(logChanged); // whole-doc PUT; overlay pruned per A5
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

  const totals = planDailyTotals(view, activePortions);
  const liveMicros = planMicroTotals(view, activePortions);
  const selItem = sel && view.meals[sel.mi]?.items[sel.ii];
  const selMeal = sel && view.meals[sel.mi];

  // source badge label
  const sourceLabel = meta && t(`plan.source${meta.source === "pdf" ? "Pdf" : meta.source === "text" ? "Text" : "Manual"}`);

  return (
    <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 13 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* header + source badge */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <EditHeader eyebrow={t("plan.eyebrow")} editing={editing} back={back} onEdit={startEdit} onCancel={cancel} onSave={save} />
          </View>
        </View>
        {sourceLabel && !editing ? (
          <View style={{ alignSelf: "flex-end", backgroundColor: colors.estimateBg, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7, marginTop: -6 }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase" }} color={colors.estimateInk}>
              {sourceLabel}
            </Text>
          </View>
        ) : null}

        {/* title */}
        <View>
          <EditableText
            value={view.summary}
            editing={editing}
            onChangeText={(text) => mutate((d) => (d.summary = text))}
            placeholder={t("plan.titlePlaceholder")}
            textStyle={{ fontSize: 24, fontFamily: fonts.bold, color: colors.ink }}
            multiline
            accessibilityLabel={t("plan.titlePlaceholder")}
          />
          <Text variant="caption" style={{ fontSize: 13, marginTop: 2 }} color={colors.muted}>
            {meta ? t("plan.importedMeta", { date: dateShort(meta.importedAt) }) : t("plan.yourReference")}
          </Text>
        </View>

        {/* daily totals */}
        <Animated.View entering={FadeInUp.duration(450)}>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={{ fontSize: 44, fontFamily: fonts.extraLight, letterSpacing: -1.2, lineHeight: 44 }}>{kcalLabel(totals.kcal)}</Text>
                <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                  {t("plan.kcalPlanned")}
                </Text>
              </View>
              <EstimateTag label={t("common.estimate")} />
            </View>
            <MacroBars totals={totals} />
            {liveMicros ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
                {[
                  t("plan.microFiber", { v: liveMicros.fiberG.toFixed(1) }),
                  t("plan.microSodium", { v: round(liveMicros.sodiumMg) }),
                  t("plan.microIron", { v: liveMicros.ironMg.toFixed(1) }),
                  t("plan.microCalcium", { v: round(liveMicros.calciumMg) }),
                ].map((label) => (
                  <View key={label} style={{ backgroundColor: "#F0EDE2", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
                    <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11 }} color="#6E6355">
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : view.micros && view.micros.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
                {view.micros.map((m) => (
                  <View key={m.name} style={{ backgroundColor: "#F0EDE2", borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
                    <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 11 }} color="#6E6355">
                      {m.name}
                      {m.percentDaily != null ? ` ${m.percentDaily}%` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        </Animated.View>

        {/* meals */}
        {view.meals.map((meal, mi) => {
          const mTotals = mealTotals(meal, activePortions);
          return (
            <Card key={mi} style={{ gap: 4, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 10, paddingBottom: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flex: 1 }}>
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
                <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.muted}>
                  ~{round(mTotals.kcal)} {t("common.kcal")}
                </Text>
              </View>

              {meal.items.map((it, ii) => {
                const q = qtyOf(it, activePortions);
                const openModal = () => {
                  // View mode: only items with a stable id carry an overlay (A2 guard).
                  if (!editing && it.id == null) return;
                  setSel({ mi, ii });
                };
                return (
                  <Pressable
                    key={ii}
                    accessibilityRole="button"
                    onPress={openModal}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 11,
                      opacity: pressed ? 0.6 : 1,
                      borderBottomWidth: ii === meal.items.length - 1 ? 0 : 1,
                      borderBottomColor: "rgba(120,100,75,0.07)",
                    })}
                  >
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#E8B48C" }} />
                    <View style={{ flex: 1 }}>
                      <EditableText
                        value={it.name}
                        editing={editing}
                        onChangeText={(text) => mutate((d) => (d.meals[mi]!.items[ii]!.name = text))}
                        placeholder={t("plan.itemNamePlaceholder")}
                        textStyle={{ fontSize: 14, fontFamily: fonts.semiBold, color: "#4A4238" }}
                      />
                    </View>
                    {/* qty pill — always rendered + tappable (view + edit) */}
                    <View style={{ backgroundColor: tint(accent, 10), borderRadius: 11, paddingVertical: 4, paddingHorizontal: 9 }}>
                      <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={accent}>
                        {qtyLabel(it.unit, q)}
                      </Text>
                    </View>
                    <Text variant="caption" style={{ fontSize: 12.5, minWidth: 44, textAlign: "right" }} color={colors.muted}>
                      ~{round(itemTotals(it, q).kcal)}
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
                  </Pressable>
                );
              })}

              {editing && (
                <View style={{ flexDirection: "row", gap: 10, paddingTop: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => mutate((d) => d.meals[mi]!.items.push({ name: "", quantity: 1, unit: "", nutritionPerUnit: { kcal: 0 } }))}
                  >
                    <Text variant="caption" style={{ fontFamily: fonts.bold }} color={accent}>
                      + {t("plan.addItem")}
                    </Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => mutate((d) => d.meals.splice(mi, 1))}>
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
          <Button label={t("plan.addMeal")} variant="ghost" onPress={() => mutate((d) => d.meals.push({ name: "", items: [] }))} />
        ) : (
          <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center", paddingHorizontal: 16 }} color={colors.labelMuted}>
            {t("plan.tapHint")}
          </Text>
        )}

        {/* portion adjust pop-up — centered, blurred backdrop (PopOverlay) */}
        <PopOverlay visible={sel != null} onClose={() => setSel(null)} closeLabel={t("common.cancel")}>
          {selItem && selMeal && sel && (
            <PortionPop
              item={selItem}
              qty={qtyOf(selItem, activePortions)}
              mealName={selMeal.name}
              mealTime={selMeal.time}
              dailyTotals={totals}
              onClose={() => setSel(null)}
              onChangeQty={(next) => {
                if (editing) mutate((d) => (d.meals[sel.mi]!.items[sel.ii]!.quantity = next));
                else if (selItem.id != null) setPortion(selItem.id, next, selItem.quantity);
              }}
            />
          )}
        </PopOverlay>
      </ScrollView>
    </KeyboardAvoider>
  );
}
