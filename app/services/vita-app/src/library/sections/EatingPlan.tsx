/**
 * "Eating plan" (APP-103, prototype lines 733–777). The plan card expands into the
 * meal list, "+ Add a meal" writes a one-item meal into the plan doc (with Undo),
 * and "Replace — new PDF" hands off to the existing plan-setup import flow —
 * v4 adds no second importer.
 *
 * Editing an item's contents still belongs to the Day (portions) and the plan
 * screen; this section only adds meals the PDF never had.
 */
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { EatingPlanDraft, PlanMeal } from "../../api/client";
import { Chevron, PressScale, Text, colors, fonts, radii, shadowCard, showToast, useAccent } from "../../ui";
import { getCachedPlan, getPlanMeta, savePlan, updatePlan } from "../../db/plan";
import { useLogVersion } from "../../db/notify";
import { kcalLabel, mealUsualTotals, planDailyTotals } from "../../plan/compute";
import { importPdf } from "../../onboarding/planImport";
import { FormInput, IconWell, PillButton, SectionLabel } from "../parts";
import { EatingPlanSheet } from "../EatingPlanSheet";

/** Prototype's two-leaf glyph. */
const LeafGlyph = () => (
  <Svg width={18} height={18}>
    <Path d="M9 15.5 C9 9 11.8 4.6 15.4 2.9 C15.7 8.6 13 13.6 9 15.5 Z" fill={colors.green.ink} />
    <Path d="M9 15.5 C9 10.6 6.9 6.6 3.2 5.1 C3 10.1 5.6 14.1 9 15.5 Z" fill={colors.green.fill} />
  </Svg>
);

/** Write the doc back where it came from: PUT when a plan exists, POST when it's the first. */
function persistPlan(doc: EatingPlanDraft, hadPlan: boolean): void {
  void (hadPlan ? updatePlan(doc) : savePlan(doc, "manual"));
}

export function EatingPlan() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const version = useLogVersion();
  void version; // re-read the cached doc on any local write
  const doc = getCachedPlan();
  const meta = getPlanMeta();

  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [time, setTime] = useState("19:30");
  const [kcal, setKcal] = useState("300");
  const [busy, setBusy] = useState(false);

  const sub = doc
    ? t("library.plan.sub", {
        meals: doc.meals.length,
        kcal: Math.round(planDailyTotals(doc).kcal).toLocaleString("en-US"),
        source: t(`library.plan.source.${meta?.source ?? "manual"}`),
      })
    : t("library.plan.none");

  const openForm = () => {
    setName("");
    setTime("19:30");
    setKcal("300");
    setFormOpen(true);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const before = doc;
    const perUnit = Math.max(0, Number(kcal) || 0);
    // A meal you added yourself: one ad-hoc item carrying your own kcal estimate.
    const meal: PlanMeal = {
      name: trimmed,
      time: time.trim() || "19:30",
      kcal: perUnit,
      items: [{ name: trimmed, quantity: 1, unit: "serving", nutritionPerUnit: { kcal: perUnit } }],
    };
    const next: EatingPlanDraft = before
      ? { ...before, meals: [...before.meals, meal] }
      : { summary: t("library.plan.yourPlan"), meals: [meal], status: "ready" };
    persistPlan(next, !!before);
    setFormOpen(false);
    showToast(t("library.plan.addedToast", { name: trimmed }), {
      undo: () => {
        if (before) persistPlan(before, true);
        else persistPlan({ ...next, meals: [] }, false);
      },
    });
  };

  const replace = async () => {
    setBusy(true);
    try {
      const out = await importPdf();
      if (out.status === "ready") {
        router.push(`/plan-setup?mode=parse&fileRef=${encodeURIComponent(out.fileRef)}`);
      } else if (out.status !== "cancelled") {
        showToast(t("library.plan.importError"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionLabel>{t("library.plan.title")}</SectionLabel>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: radii.card,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.borderFaint,
          gap: 12,
          ...shadowCard,
        }}
      >
        <PressScale accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((e) => !e)} scale={0.99}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconWell bg={colors.green.bg}>
              <LeafGlyph />
            </IconWell>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color={colors.inkHeading}>
                {t("library.plan.yourPlan")}
              </Text>
              <Text style={{ fontSize: 12, marginTop: 1 }} color={colors.muted}>{sub}</Text>
            </View>
            <Chevron open={expanded} size={10} />
          </View>
        </PressScale>

        {expanded && doc ? (
          <Animated.View
            entering={FadeIn.duration(250)}
            style={{ borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: "dashed", paddingTop: 10, gap: 7 }}
          >
            {doc.meals.map((m, i) => (
              <View key={m.id ?? `${m.name}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.inkHeading}>{m.name}</Text>
                {m.time ? (
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.faint}>{m.time}</Text>
                ) : null}
                <Text style={{ fontSize: 12.5, marginLeft: "auto" }} color={colors.muted}>
                  {kcalLabel(m.kcal ?? mealUsualTotals(m).kcal)} kcal
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 10.5, paddingTop: 3 }} color={colors.labelMuted}>{t("library.plan.expandNote")}</Text>
          </Animated.View>
        ) : null}

        {formOpen ? (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{ borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: "dashed", paddingTop: 12, gap: 10 }}
          >
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.labelMuted}>
              {t("library.plan.formTitle")}
            </Text>
            <FormInput value={name} onChangeText={setName} placeholder={t("library.plan.namePlaceholder")} label={t("library.plan.nameLabel")} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FormInput value={time} onChangeText={setTime} label={t("library.plan.timeLabel")} width={74} center />
              <FormInput value={kcal} onChangeText={setKcal} label={t("library.plan.kcalLabel")} width={66} center />
              <Text style={{ fontSize: 11, lineHeight: 16, flex: 1 }} color={colors.labelMuted}>{t("library.plan.formHint")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PillButton label={t("common.cancel")} onPress={() => setFormOpen(false)} height={42} flex={1} />
              <PillButton label={t("library.plan.addToPlan")} onPress={save} tone="accent" accent={accent} height={42} flex={1.2} disabled={name.trim() === ""} />
            </View>
          </Animated.View>
        ) : null}

        {/* v4.2 §1.1: one button, three routes behind it — not three loose buttons. */}
        <PillButton
          label={busy ? t("common.importing") : t("build.eatingSheet.cardButton")}
          onPress={() => setSheetOpen(true)}
          tone="tinted"
          accent={accent}
          disabled={busy}
        />
      </View>

      <EatingPlanSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPdf={() => {
          setSheetOpen(false);
          void replace();
        }}
        onBuild={() => {
          setSheetOpen(false);
          router.push("/build-plan");
        }}
        onAddMeal={() => {
          setSheetOpen(false);
          openForm();
        }}
      />
    </>
  );
}
