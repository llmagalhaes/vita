/**
 * APP-120…123 — the hand-built eating plan (handoff v4.2 §2), the route for
 * someone with no PDF to upload.
 *
 *   count  →  meals (one card per meal)  →  review
 *
 * Everything the person types lives in this screen's state until "Finish setup";
 * only then does one `savePlan(doc, "manual")` write it (cache first, so it works
 * offline exactly like the import path). CEO Round 16 #2: building here REPLACES
 * the current plan, same semantics as a new import — the sheet's subtitle warns.
 */
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeInUp } from "react-native-reanimated";
import { getCachedPlan, savePlan } from "../../src/db/plan";
import { logChanged } from "../../src/db/notify";
import { estimateKcal } from "../../src/plan/estimateKcal";
import { colors, mixOklab, useAccent } from "../../src/ui";
import { showToast } from "../../src/ui/toast";
import { BuilderShell } from "../../src/build/parts";
import { CountPhase } from "../../src/build/food/CountPhase";
import { MealsPhase } from "../../src/build/food/MealsPhase";
import { ReviewPhase } from "../../src/build/food/ReviewPhase";
import { emptySlots, fromPlanDoc, mealsFromSkel, mergeEstimates, saveEdit, toDraft, type BuildItem, type BuildMeal } from "../../src/build/food/draft";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase = "count" | "meals" | "review";

export default function BuildPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();

  /**
   * `?edit=1` (APP-138) — the builder IS the editor. The plan is read ONCE, into
   * the same draft a fresh build types out, and the screen opens on review: every
   * meal at a glance, each "edit" link reaching its card. The count phase is still
   * behind Back, and reshaping there restarts from a skeleton, as it always did.
   * Finish saves through `savePlan` (POST = a new version; the old one stays in
   * history — that is the undo).
   */
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>();
  const [seed] = useState(() => {
    const doc = editParam === "1" ? getCachedPlan() : null;
    return doc && doc.meals.length > 0 ? { meals: fromPlanDoc(doc), summary: doc.summary } : null;
  });

  const [phase, setPhase] = useState<Phase>(seed ? "review" : "count");
  const [n, setN] = useState(seed ? seed.meals.length : 5);
  const [step, setStep] = useState(0);
  const [meals, setMeals] = useState<BuildMeal[]>(seed ? seed.meals : []);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [editV, setEditV] = useState("");

  // The estimate pass outlives a fast exit; nothing may setState after that.
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  /** Every phase change clears the editor key — it addresses a list by index
   *  and nothing may carry a stale index across a phase (app-plan §D risk 2). */
  const go = (next: Phase) => {
    setEdit(null);
    setPhase(next);
  };

  // One button is both "back a step" and "leave" — the phase decides (§2.1).
  const back = () => {
    if (busy) return; // the estimate pass owns the list until it lands
    if (phase === "review") {
      setStep(Math.max(0, meals.length - 1));
      return go("meals");
    }
    if (phase === "meals" && step > 0) {
      setForm(false);
      return setStep(step - 1);
    }
    if (phase === "meals") return go("count");
    return router.canGoBack() ? router.back() : router.replace("/library");
  };

  const stepLabel =
    phase === "meals" ? t("build.stepOf", { n: step + 1, total: meals.length }) : phase === "review" ? t("build.plan.reviewStep") : "";

  const patchMeal = (patch: Partial<BuildMeal>) => setMeals((ms) => ms.map((m, i) => (i === step ? { ...m, ...patch } : m)));
  const addItem = (item: BuildItem) => patchMeal({ items: [...(meals[step]?.items ?? []), item] });
  const removeItem = (index: number) => patchMeal({ items: (meals[step]?.items ?? []).filter((_, i) => i !== index) });

  /**
   * The pass is a snapshot: the request is the empty slots as they are NOW, and
   * the answer merges back by that same key. The screen is held still while it
   * runs (back and "Edit" are inert), and `mergeEstimates` drops anything that
   * moved anyway — a number on the wrong food is worse than no number.
   */
  const estimate = async () => {
    setBusy(true);
    const slots = emptySlots(meals);
    // 1.5s is a FLOOR, not a fake timer: a slower answer simply takes longer.
    const [values] = await Promise.all([estimateKcal(slots.map((s) => s.item)), sleep(1500)]);
    if (!mounted.current) return; // criterion 12 — leaving mid-pass throws nothing
    setMeals((ms) => mergeEstimates(ms, slots, values));
    setBusy(false);
  };

  const savedRef = useRef(false);
  const finish = () => {
    if (savedRef.current) return; // double-tap guard — no duplicate plan version
    savedRef.current = true;
    // An edited plan keeps its own summary — it is the plan's name, not this
    // screen's byline.
    void savePlan(toDraft(meals, seed?.summary ?? t("build.plan.summary")), "manual").then(() => logChanged());
    if (router.canGoBack()) router.back();
    else router.replace("/day");
    showToast(t("build.plan.saved", { count: meals.length }));
  };

  const segments = meals.length + 1; // the +1 is the review (criterion 7)
  const current = phase === "review" ? meals.length : step;

  return (
    <BuilderShell eyebrow={t("build.plan.eyebrow")} step={stepLabel} onBack={back} backLabel={t("common.back")}>
      {phase !== "count" && (
        <View testID="build-progress" style={{ flexDirection: "row", gap: 5 }}>
          {Array.from({ length: segments }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i < current ? accent : i === current ? mixOklab(accent, 45, colors.sandLight) : colors.sandLight,
              }}
            />
          ))}
        </View>
      )}

      <Animated.View key={`${phase}-${step}`} entering={FadeInUp.duration(300)}>
        {phase === "count" && (
          <CountPhase
            n={n}
            onN={setN}
            onStart={() => {
              setMeals(mealsFromSkel(n));
              setStep(0);
              setForm(true); // the first thing you see is a field, not a button
              go("meals");
            }}
          />
        )}

        {phase === "meals" && meals[step] && (
          <MealsPhase
            key={step}
            meal={meals[step]}
            last={step === meals.length - 1}
            formOpen={form}
            onForm={setForm}
            onMeal={patchMeal}
            onAdd={addItem}
            onRemove={removeItem}
            onNext={() => {
              if (step + 1 < meals.length) {
                setStep(step + 1);
                setForm(true); // next step opens on a ready field too
              } else go("review");
            }}
          />
        )}

        {phase === "review" && (
          <ReviewPhase
            meals={meals}
            busy={busy}
            edit={edit}
            editValue={editV}
            onEditOpen={(key, currentK) => {
              setEdit(key);
              setEditV(currentK == null ? "" : String(currentK));
            }}
            onEditChange={setEditV}
            onEditSave={() => {
              if (edit) setMeals((ms) => saveEdit(ms, edit, editV));
              setEdit(null);
            }}
            onEstimate={() => void estimate()}
            onEditMeal={(i) => {
              if (busy) return; // same reason as `back` — nothing moves mid-pass
              setStep(i);
              setForm(false);
              go("meals");
            }}
            onFinish={finish}
          />
        )}
      </Animated.View>
    </BuilderShell>
  );
}
