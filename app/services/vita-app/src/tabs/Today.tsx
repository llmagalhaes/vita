/**
 * Today's plan (APP-087) — the day-scoped view of the eating plan and training
 * program. Meal tab: ready / review / none. Workout tab: ready / none. Everything
 * here "only counts for today, tomorrow starts fresh": portion tweaks and workout
 * skips are the day-scoped overlays (src/db/plan). The everyday plan and program
 * are edited on their own doc screens (Edit links).
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeInUp } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { EatingPlanDraft, PlanItem, ProgramDay, TrainingProgramDraft } from "../api/client";
import {
  clearDaySkips,
  clearPortions,
  getCachedPlan,
  getCachedProgram,
  getDaySkips,
  getPortions,
  getSelectedDay,
  mealPlanStatus,
  savePlan,
  setPortion,
  setSelectedDay,
  toggleDaySkip,
} from "../db/plan";
import { logChanged, useLogVersion } from "../db/notify";
import { api } from "../api";
import { effectiveQuantity, kcalLabel, planDailyTotals, qtyLabel } from "../plan/compute";
import { changesToday, compItems, compKcal, compLabel, dayWorkoutKcal, usualChip } from "../plan/setup";
import { MacroBars } from "../plan/MacroBars";
import { ItemRow } from "../plan/ItemRow";
import { PortionPop } from "../plan/PortionPop";
import { DescribeSheet } from "../plan/DescribeSheet";
import { ImportProgramSheet } from "../workout/ImportProgramSheet";
import { Button, PopOverlay, Text, colors, fonts, shadow, tint, useAccent } from "../ui";
import { importPdf } from "../onboarding/planImport";
import { showToast } from "../ui/toast";

const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
/** Day-scoped effective quantity: the override → the item's effective default. */
const dayQty = (it: PlanItem, portions: Record<string, number>): number =>
  (it.id != null ? portions[it.id] : undefined) ?? effectiveQuantity(it);
const exDetail = (ex: { sets?: number; reps?: number; loadKg?: number }): string =>
  [ex.sets != null && ex.reps != null ? `${ex.sets} × ${ex.reps}` : "", ex.loadKg != null ? `${ex.loadKg} kg` : ""].filter(Boolean).join(" · ");

/** Dark-thumb segmented rail (Meal plan / Workout). */
function DarkSegment({ tab, onChange }: { tab: "meal" | "workout"; onChange: (t: "meal" | "workout") => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#F0EDE2", borderRadius: 14, padding: 3, gap: 2 }}>
      {(["meal", "workout"] as const).map((k) => {
        const on = k === tab;
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(k)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: on ? "#453E35" : "transparent", alignItems: "center" }}
          >
            <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? "#F7F0E4" : colors.muted}>
              {t(k === "meal" ? "today.tabMeal" : "today.tabWorkout")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Dashed empty card shared by review/none states. */
function DashedCard({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashedBorder, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 20, alignItems: "center", gap: 8 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.well, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <Text variant="title" style={{ fontSize: 15.5, textAlign: "center" }}>
        {title}
      </Text>
      <Text variant="caption" style={{ fontSize: 12.5, textAlign: "center", maxWidth: 260 }} color={colors.muted}>
        {body}
      </Text>
      {children}
    </View>
  );
}

const LeafIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22">
    <Path d="M4 18 C4 9 11 4 18 4 C18 13 11 18 4 18 Z" fill="none" stroke={colors.greens[0]} strokeWidth={1.6} strokeLinejoin="round" />
    <Path d="M4 18 L14 8" fill="none" stroke={colors.greens[1]} strokeWidth={1.4} strokeLinecap="round" />
  </Svg>
);
const DumbbellIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22">
    <Path d="M3 7 v8 M6 5 v12 M16 5 v12 M19 7 v8 M6 11 h10" fill="none" stroke="#5F7A61" strokeWidth={1.6} strokeLinecap="round" />
  </Svg>
);

export default function Today() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const [tab, setTab] = useState<"meal" | "workout">("meal");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 13 }}>
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" style={{ fontSize: 21 }}>
              {t("today.title")}
            </Text>
            <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
              {todayLabel()}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/home")}
            style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 }}
          >
            <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }}>
              {t("today.homePill")}
            </Text>
          </Pressable>
        </View>

        {/* helper + edit link */}
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
            {t("today.helper")}
          </Text>
          <Text
            accessibilityRole="button"
            onPress={() => router.push(tab === "meal" ? "/plan" : "/program")}
            style={{ fontFamily: fonts.bold, fontSize: 12.5 }}
            color={accent}
          >
            {t(tab === "meal" ? "today.editPlan" : "today.editProgram")}
          </Text>
        </View>

        <DarkSegment tab={tab} onChange={setTab} />

        {tab === "meal" ? <MealTab /> : <WorkoutTab />}
      </ScrollView>
    </View>
  );
}

// ── meal tab ────────────────────────────────────────────────────────────────

function MealTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const version = useLogVersion();
  void version;
  const status = mealPlanStatus();
  const doc = getCachedPlan();

  const [describe, setDescribe] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === "none" || !doc) {
    return (
      <>
        <DashedCard icon={<LeafIcon />} title={t("today.noneTitle")} body={t("today.noneBody")}>
          <Button label={t("today.importPdf")} onPress={async () => {
            const out = await importPdf();
            if (out.status === "ready") router.push(`/plan-setup?mode=parse&fileRef=${encodeURIComponent(out.fileRef)}`);
          }} />
          <Button label={t("today.typeOrSpeak")} variant="ghost" onPress={() => setDescribe(true)} />
        </DashedCard>
        {describe ? (
          <DescribeSheet
            title={t("today.typeOrSpeak")}
            placeholder={t("onboarding.plan.inputPlaceholder")}
            busy={busy}
            onClose={() => setDescribe(false)}
            onSubmit={async (text) => {
              setBusy(true);
              try {
                const parsed = await api.parseEatingPlan({ text });
                await savePlan({ ...parsed, status: "review" }, "text");
                setDescribe(false);
                router.push("/plan-setup?mode=review");
              } catch {
                showToast(t("planSetup.parseError"));
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : null}
      </>
    );
  }

  if (status === "review") {
    return (
      <DashedCard icon={<LeafIcon />} title={t("today.reviewTitle")} body={t("today.reviewBody", { n: doc.meals.length })}>
        <Button label={t("today.continueSetup")} onPress={() => router.push("/plan-setup?mode=review")} />
      </DashedCard>
    );
  }

  return <MealReady doc={doc} accent={accent} />;
}

function MealReady({ doc, accent }: { doc: EatingPlanDraft; accent: string }) {
  const { t } = useTranslation();
  const version = useLogVersion();
  void version;
  const portions = getPortions();
  const skips = getDaySkips();
  const totals = planDailyTotals(doc, portions);

  // Per-meal "switch composition for today" — display-only, session-local.
  const [todayOpt, setTodayOpt] = useState<Record<number, number>>({});
  const chipOf = (mi: number) => todayOpt[mi] ?? usualChip(doc.meals[mi]!);

  const [sel, setSel] = useState<{ mi: number; ii: number; openQty: number } | null>(null);
  const nChanges = changesToday(doc, portions, skips);

  const revert = () => {
    const snapPortions = { ...portions };
    const snapSkips = JSON.parse(JSON.stringify(skips)) as typeof skips;
    clearPortions();
    clearDaySkips();
    logChanged();
    showToast(t("today.reverted"), {
      undo: () => {
        for (const [id, q] of Object.entries(snapPortions)) setPortion(id, q);
        for (const [day, exs] of Object.entries(snapSkips)) for (const ex of Object.keys(exs)) toggleDaySkip(day, ex);
        logChanged();
      },
    });
  };

  const selItem = sel ? compItems(doc.meals[sel.mi]!, chipOf(sel.mi))[sel.ii] : null;

  return (
    <View style={{ gap: 13 }}>
      {/* summary */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <View style={{ backgroundColor: colors.card, borderRadius: 22, padding: 18, gap: 12, ...shadow }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 34, fontFamily: fonts.extraLight, letterSpacing: -1 }}>{kcalLabel(totals.kcal)}</Text>
            <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
              {t("today.plannedToday")}
            </Text>
          </View>
          <MacroBars totals={totals} />
        </View>
      </Animated.View>

      {/* changes banner */}
      {nChanges > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: tint(accent, 8), borderWidth: 1, borderColor: tint(accent, 25), borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 12.5 }} color={accent}>
            {nChanges === 1 ? t("today.changeOne") : t("today.changes", { n: nChanges })}
          </Text>
          <Text accessibilityRole="button" onPress={revert} style={{ fontFamily: fonts.extraBold, fontSize: 12.5 }} color={accent}>
            {t("today.revert")}
          </Text>
        </View>
      ) : null}

      {/* per-meal cards */}
      {doc.meals.map((meal, mi) => {
        const chip = chipOf(mi);
        const items = compItems(meal, chip);
        const kcal = compKcal(meal, chip);
        const nChips = 1 + (meal.options?.length ?? 0);
        return (
          <View key={mi} style={{ backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, gap: 4, ...shadow }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text variant="label" style={{ fontSize: 15, fontFamily: fonts.bold }}>
                {meal.name}
              </Text>
              {meal.time ? (
                <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.labelMuted}>
                  {meal.time}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              {kcal != null ? (
                <Text variant="caption" style={{ fontSize: 12, fontFamily: fonts.bold }} color={colors.muted}>
                  ~{kcal} {t("common.kcal")}
                </Text>
              ) : null}
            </View>

            {nChips > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 4 }}>
                {Array.from({ length: nChips }, (_, c) => {
                  const on = c === chip;
                  return (
                    <Text
                      key={c}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setTodayOpt((m) => ({ ...m, [mi]: c }))}
                      style={{ overflow: "hidden", borderRadius: 15, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: on ? "#453E35" : "rgba(120,100,75,0.16)", backgroundColor: on ? "#453E35" : colors.card, fontFamily: fonts.bold, fontSize: 11.5, color: on ? "#F7F0E4" : "#6E6355" }}
                    >
                      {compLabel(meal, c)}
                    </Text>
                  );
                })}
              </View>
            ) : null}

            {items.map((it, ii) => (
              <ItemRow
                key={it.id ?? ii}
                item={it}
                qty={dayQty(it, portions)}
                last={ii === items.length - 1}
                onPress={it.id != null ? () => setSel({ mi, ii, openQty: dayQty(it, portions) }) : undefined}
              />
            ))}
          </View>
        );
      })}

      {/* portion pop */}
      <PopOverlay visible={sel != null} onClose={() => closePortion()} closeLabel={t("common.cancel")}>
        {sel && selItem ? (
          <PortionPop
            item={selItem}
            qty={dayQty(selItem, portions)}
            openQty={sel.openQty}
            mealName={doc.meals[sel.mi]!.name}
            mealTime={doc.meals[sel.mi]!.time}
            dailyTotals={totals}
            onChangeQty={(next) => selItem.id != null && setPortion(selItem.id, next, effectiveQuantity(selItem))}
            onClose={() => closePortion()}
          />
        ) : null}
      </PopOverlay>
    </View>
  );

  function closePortion() {
    if (sel && selItem && selItem.id != null) {
      const now = dayQty(selItem, getPortions());
      if (now !== sel.openQty) {
        const openQty = sel.openQty;
        const id = selItem.id;
        showToast(t("today.adjusted", { name: selItem.name }), { undo: () => setPortion(id, openQty) });
      }
    }
    setSel(null);
  }
}

// ── workout tab ──────────────────────────────────────────────────────────────

function WorkoutTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  void version;
  const program = getCachedProgram();
  const [importing, setImporting] = useState(false);

  if (!program || program.days.length === 0) {
    return (
      <>
        <DashedCard icon={<DumbbellIcon />} title={t("today.wkNoneTitle")} body={t("today.wkNoneBody")}>
          <Button label={t("today.importPdf")} onPress={() => setImporting(true)} />
          <Button label={t("today.typeOrSpeak")} variant="ghost" onPress={() => setImporting(true)} />
        </DashedCard>
        {importing ? <ImportProgramSheet onClose={() => setImporting(false)} /> : null}
      </>
    );
  }
  return <WorkoutReady program={program} />;
}

function WorkoutReady({ program }: { program: TrainingProgramDraft }) {
  const { t } = useTranslation();
  const version = useLogVersion();
  void version;
  const skips = getDaySkips();
  const selected = getSelectedDay();
  const day: ProgramDay = program.days.find((d) => d.name === selected) ?? program.days[0]!;
  const daySkips = skips[day.name] ?? {};
  const active = day.exercises.filter((e) => !daySkips[e.name]).length;
  const kcal = dayWorkoutKcal(day, skips);

  return (
    <View style={{ gap: 13 }}>
      {/* day chips */}
      {program.days.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {program.days.map((d) => {
            const on = d.name === day.name;
            return (
              <Text
                key={d.name}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setSelectedDay(d.name);
                  logChanged();
                }}
                style={{ overflow: "hidden", borderRadius: 15, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: on ? "#453E35" : "rgba(120,100,75,0.16)", backgroundColor: on ? "#453E35" : colors.card, fontFamily: fonts.bold, fontSize: 12, color: on ? "#F7F0E4" : "#6E6355" }}
              >
                {d.name}
              </Text>
            );
          })}
        </View>
      ) : null}

      {/* summary */}
      <View style={{ backgroundColor: colors.card, borderRadius: 22, padding: 18, gap: 6, ...shadow }}>
        {kcal != null ? <Text style={{ fontSize: 34, fontFamily: fonts.extraLight, letterSpacing: -1 }}>~{kcal}</Text> : null}
        <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
          {t("today.exOf", { a: active, t: day.exercises.length })}
        </Text>
        <Text variant="label" style={{ fontSize: 15, fontFamily: fonts.bold }}>
          {day.name}
        </Text>
      </View>

      {/* exercises */}
      <View style={{ backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 6, ...shadow }}>
        {day.exercises.map((ex, i) => {
          const off = !!daySkips[ex.name];
          return (
            <Pressable
              key={ex.name}
              accessibilityRole="button"
              accessibilityState={{ checked: !off }}
              onPress={() => {
                toggleDaySkip(day.name, ex.name);
                if (!off) showToast(t("today.skipped", { name: ex.name }), { undo: () => toggleDaySkip(day.name, ex.name) });
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: i === day.exercises.length - 1 ? 0 : 1, borderBottomColor: "rgba(120,100,75,0.07)" }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: off ? colors.card : "#E7EDE1", borderWidth: off ? 1.5 : 0, borderColor: "rgba(120,100,75,0.25)" }}>
                {off ? null : (
                  <Svg width={12} height={12} viewBox="0 0 12 12">
                    <Path d="M2 6 L5 9 L10 3" fill="none" stroke="#5F7A61" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 14, fontFamily: fonts.semiBold, textDecorationLine: off ? "line-through" : "none" }} color={off ? colors.labelMuted : "#4A4238"}>
                  {ex.name}
                </Text>
                {exDetail(ex) ? (
                  <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
                    {exDetail(ex)}
                  </Text>
                ) : null}
              </View>
              {off ? (
                <View style={{ backgroundColor: colors.estimateBg, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 }}>
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase" }} color={colors.estimateInk}>
                    {t("today.offToday")}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
        {t("today.wkFooter")}
      </Text>
    </View>
  );
}
