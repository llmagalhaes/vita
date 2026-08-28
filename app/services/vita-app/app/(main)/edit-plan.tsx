/**
 * APP-139 — EDIT the eating plan you already have (handoff v4.3 §2, PLAN R1–R5).
 *
 * The third thing you can do with a plan, and in practice the most frequent: not
 * "import over it" and not "build a new one", but change the one portion that is
 * wrong. The draft is born FROM the cached document and saved back over it with
 * PUT (`updatePlan`), so ids, swaps and options survive — see `src/edit/plan/draft.ts`.
 *
 * Nothing is written until "Save the changes": back discards, silently, because
 * nothing was ever touched (§2.1 — a confirm dialog here would cost more than it saves).
 */
import { useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { getCachedPlan, updatePlan } from "../../src/db/plan";
import { setOverlay } from "../../src/db/dayRecord";
import { logChanged } from "../../src/db/notify";
import { dayKey } from "../../src/day/record";
import { BuilderShell } from "../../src/build/parts";
import { MealCard } from "../../src/edit/plan/MealCard";
import { fromDoc, newMeal, projection, toSaveDoc, totalKcal, type EditMeal } from "../../src/edit/plan/draft";
import { PressScale, Text, colors, fonts, hit, motion, shadowCta, useAccent } from "../../src/ui";
import { showToast } from "../../src/ui/toast";

export default function EditPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();

  // One read, at open. The screen owns the draft from here; the cache is only
  // touched again by Save.
  const [seed] = useState(() => {
    const doc = getCachedPlan();
    const draft = doc ? fromDoc(doc) : [];
    return { doc, draft, snap: projection(draft) };
  });
  const [draft, setDraft] = useState<EditMeal[]>(seed.draft);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState(-1); // index of the meal whose "add food" form is open
  const saved = useRef(false);

  const dirty = projection(draft) !== seed.snap;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/library"));

  const patch = (i: number, p: Partial<EditMeal>) => setDraft((d) => d.map((m, j) => (j === i ? { ...m, ...p } : m)));

  // Opening a meal closes the previous one AND any food form inside it (§2.3).
  const toggle = (i: number) => {
    setForm(-1);
    setOpen((cur) => (cur === i ? null : i));
  };

  const addMeal = () => {
    setDraft((d) => [...d, newMeal(t("edit.plan.newMeal"))]);
    setOpen(draft.length);
    setForm(draft.length); // the new card opens with its food form already up (§2.5)
  };

  const removeMeal = (i: number) => {
    setDraft((d) => d.filter((_, j) => j !== i));
    setOpen(null);
    setForm(-1);
  };

  const save = () => {
    if (!seed.doc || saved.current) return; // double-tap guard — one version per commit
    saved.current = true;
    // Cache-first, then PUT: `updatePlan` writes the cache (and prunes the overlay)
    // SYNCHRONOUSLY before its first await, so the new plan is already the truth by the
    // time this screen goes away. Awaiting the network here would leave Save hanging on
    // a slow connection for a write that is already done (db/plan owns the re-push).
    void updatePlan(toSaveDoc(seed.doc, draft)).then(logChanged);
    // §2.6 `qtyOv:{}` — today's portion tweaks would mask the portions that were
    // just made the plan's own. ONLY the qty half: "didn't have this today", a
    // swap picked for today and the option choice are decisions about the day, keyed
    // by ids that survived the PUT, and they stay (§2.6 table).
    setOverlay(dayKey(), { qty: {} });
    showToast(t("edit.plan.saved", { count: draft.length }));
    back();
  };

  return (
    <BuilderShell eyebrow={t("edit.plan.eyebrow")} step={t("edit.plan.editing")} onBack={back} backLabel={t("common.back")}>
      <View style={{ gap: 12 }}>
        <View style={{ paddingHorizontal: 2, paddingTop: 8, gap: 8 }}>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.2 }} color={colors.inkHeading}>
            {t("edit.plan.title")}
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 19, fontFamily: fonts.semiBold }} color={colors.muted}>
            {t("edit.plan.sub", { count: draft.length, kcal: totalKcal(draft).toLocaleString("en-US") })}
          </Text>
        </View>

        {draft.map((meal, i) => (
          <MealCard
            key={meal.src?.id ?? `new-${i}`}
            meal={meal}
            open={open === i}
            formOpen={form === i}
            onToggle={() => toggle(i)}
            onPatch={(p) => patch(i, p)}
            onForm={(o) => setForm(o ? i : -1)}
            onRemove={() => removeMeal(i)}
          />
        ))}

        <PressScale
          accessibilityRole="button"
          onPress={addMeal}
          style={{ height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashedBorder }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkMuted}>
            {t("edit.plan.addMeal")}
          </Text>
        </PressScale>

        {/* Not a disabled button — a block with the same height, so the footer does
            not jump when the first key is typed (§2.7). */}
        {dirty ? (
          <Animated.View entering={FadeIn.duration(motion.vtFade.durationMs)}>
            <PressScale
              accessibilityRole="button"
              scale={0.98}
              onPress={save}
              style={{
                height: hit.buttonLarge,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: accent,
                ...shadowCta(accent),
              }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color="#FFF9F1">
                {t("edit.plan.save")}
              </Text>
            </PressScale>
          </Animated.View>
        ) : (
          <View style={{ height: hit.buttonLarge, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.inertBlock }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.faint}>
              {t("edit.plan.clean")}
            </Text>
          </View>
        )}
      </View>
    </BuilderShell>
  );
}
