/**
 * Plan Setup (APP-086) — the meal-by-meal review after a plan import. Two phases:
 *
 *  parsing  — while the async import job runs (POST → poll every 3s), a calm
 *             "Reading your plan…" card breathes; on resolve we refetch GET /plan,
 *             fade in the real findings (setupFindings), then auto-advance.
 *  review   — one meal per step: pick your usual option, make swaps your usual
 *             (persisted as indices at Finish via applyUsuals — reconciliation §1),
 *             then a Notes & habits step that turns hydration/supplements into
 *             gentle daily check-ins.
 *
 * Usual selections are LOCAL state until "Finish setup"; only then does one
 * PUT /plan write usualOptionIndex/usualSwapIndex and flip status → "ready".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { Easing, FadeInUp, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { api } from "../../src/api";
import { ApiError, jobIdFromDetail, type EatingPlanDraft, type PlanItem, type PlanMeal } from "../../src/api/client";
import { getCachedPlan, syncPlan, updatePlan } from "../../src/db/plan";
import { logChanged } from "../../src/db/notify";
import { createHabit } from "../../src/db/habits";
import { refreshNotifications } from "../../src/notify/notifier";
import { applyUsuals, compItems, compKcal, compLabel, supplementTime, setupFindings } from "../../src/plan/setup";
import { planDailyTotals } from "../../src/plan/compute";
import { SwapSheet, SwapRadioRow, swapLabel, swapQty } from "../../src/plan/SwapSheet";
import { Button, BackButton, Chevron, Text, Toggle, colors, fonts, shadow, tint, useAccent } from "../../src/ui";
import { showToast } from "../../src/ui/toast";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const EVERY_DAY = [true, true, true, true, true, true, true];

// ── parsing state ──────────────────────────────────────────────────────────

/** 22×26 document glyph (handoff §1a): outline + folded corner + 3 text lines. */
function DocGlyph() {
  return (
    <Svg width={22} height={26} viewBox="0 0 22 26">
      <Path d="M3 1.5 h10 l6 6 v17 h-16 Z" fill="none" stroke={colors.estimateInk} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 1.5 v6 h6" fill="none" stroke={colors.estimateInk} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.5 13 h9 M6.5 16.5 h9 M6.5 20 h6" fill="none" stroke={colors.estimateInk} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** The calm parsing card — the well breathes (1.6s, 7% pulse), findings fade in. */
function ParsingCard({ findings }: { findings: string[] }) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const started = useRef(false);
  const onLayout = () => {
    if (started.current) return;
    started.current = true;
    scale.value = withRepeat(withTiming(1.07, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  };
  const wellStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      entering={ZoomIn.duration(350)}
      style={{ backgroundColor: colors.card, borderRadius: 26, paddingVertical: 32, paddingHorizontal: 22, borderWidth: 1, borderColor: "rgba(120,100,75,0.06)", alignItems: "center", gap: 6, ...shadow }}
    >
      <Animated.View
        onLayout={onLayout}
        style={[{ width: 52, height: 52, borderRadius: 18, backgroundColor: colors.well, alignItems: "center", justifyContent: "center", marginBottom: 6 }, wellStyle]}
      >
        <DocGlyph />
      </Animated.View>
      <Text variant="title" style={{ fontSize: 17 }}>
        {t("planSetup.reading")}
      </Text>
      {findings.map((line, i) => (
        <Animated.View key={line} entering={FadeInUp.duration(400).delay(i * 500)}>
          <Text variant="caption" style={{ fontSize: 12.5, textAlign: "center" }} color={colors.muted}>
            {line}
          </Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

function ErrorCard({ onRetry, onType }: { onRetry: () => void; onType: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 26, padding: 24, gap: 14, ...shadow }}>
      <Text variant="body" color={colors.muted}>
        {t("planSetup.parseError")}
      </Text>
      <Button label={t("planSetup.retry")} onPress={onRetry} />
      <Button label={t("common.typeOrSpeak")} variant="ghost" onPress={onType} />
    </View>
  );
}

// ── review ───────────────────────────────────────────────────────────────

export default function PlanSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const params = useLocalSearchParams<{ mode?: string; fileRef?: string; text?: string; ob?: string }>();
  const isParse = params.mode === "parse";
  /**
   * APP-137 — pushed from the onboarding eating step (`ob=1`). Onboarding is still
   * mounted underneath, holding the name and the domain flags, so leaving means
   * popping back to it; replacing to the Day would strand the user mid-setup.
   */
  const exit = () => (params.ob === "1" && router.canGoBack() ? router.back() : router.replace("/day"));

  const [phase, setPhase] = useState<"parsing" | "review" | "error">(isParse ? "parsing" : "review");
  const [findings, setFindings] = useState<string[]>([]);
  const [doc, setDoc] = useState<EatingPlanDraft | null>(isParse ? null : getCachedPlan());

  // Async import: POST → poll every 3s → done → refetch GET /plan → findings → advance.
  useEffect(() => {
    if (phase !== "parsing") return;
    let cancelled = false;
    let advance: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const body = params.fileRef ? { fileRef: params.fileRef } : { text: params.text ?? "" };
        let jobId: string;
        try {
          ({ jobId } = await api.startEatingPlanImport(body));
        } catch (e) {
          // 409 = an import is already running for this user (contract §parse/eating-plan);
          // its jobId is in problem.detail — adopt it and poll that instead of erroring.
          const running = e instanceof ApiError && e.status === 409 ? jobIdFromDetail(e.problem.detail) : null;
          if (!running) throw e;
          jobId = running;
        }
        let pollFails = 0;
        for (;;) {
          if (cancelled) return;
          let job: { state: "running" | "done" | "failed" };
          try {
            job = await api.getEatingPlanJob(jobId);
            pollFails = 0;
          } catch (e) {
            // Tolerate a few transient poll blips before giving up. ponytail: a genuinely
            // stuck `running` relies on the server's stale-fail (contract: a job older
            // than ~10 min is reported failed) — no client-side timeout cap here.
            if (++pollFails > 3) throw e;
            await sleep(3000);
            continue;
          }
          if (job.state === "done") break;
          if (job.state === "failed") return void (!cancelled && setPhase("error"));
          await sleep(3000);
        }
        await syncPlan();
        const fetched = getCachedPlan();
        if (cancelled) return;
        if (!fetched) return void setPhase("error");
        setDoc(fetched);
        setFindings(setupFindings(fetched));
        advance = setTimeout(() => !cancelled && setPhase("review"), 1600);
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      if (advance) clearTimeout(advance);
    };
  }, [phase, params.fileRef, params.text]);

  if (phase === "parsing") {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22 }}>
        <ParsingCard findings={findings} />
      </View>
    );
  }
  if (phase === "error" || !doc) {
    // Retry re-runs the import ONLY in parse mode. In review mode with no cached doc
    // there's nothing to parse (no fileRef/text) — routing to Today avoids POSTing a
    // garbage `{ text: "" }` import; Today's none-state offers a real import path.
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 22 }}>
        <ErrorCard
          onRetry={isParse ? () => (setFindings([]), setPhase("parsing")) : exit}
          onType={exit}
        />
      </View>
    );
  }
  return <Review doc={doc} accent={accent} onExit={exit} />;
}

function Review({ doc, accent, onExit }: { doc: EatingPlanDraft; accent: string; onExit: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const nMeals = doc.meals.length;
  const nSteps = nMeals + 1; // meals + Notes & habits
  const [step, setStep] = useState(0);

  const [chosenOption, setChosenOption] = useState<Record<number, number>>({});
  const [chosenSwap, setChosenSwap] = useState<Record<string, number>>({});
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  // Notes & habits toggles — one per supplement + one water row, all default ON.
  const suppNames = doc.supplements?.map((_, i) => `s${i}`) ?? [];
  const [habToggles, setHabToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (doc.hydration) init.water = true;
    suppNames.forEach((k) => (init[k] = true));
    return init;
  });

  const back = () => {
    if (step === 0) return router.canGoBack() ? router.back() : onExit();
    setSwapOpen(null);
    setStep((s) => s - 1);
  };

  const swapKey = (mi: number, chip: number, ii: number) => `${mi}_${chip}_${ii}`;

  const selectSwap = (key: string, index: number | null, item: PlanItem) => {
    const prev = chosenSwap[key];
    setChosenSwap((m) => {
      const next = { ...m };
      if (index == null) delete next[key];
      else next[key] = index;
      return next;
    });
    setSwapOpen(null);
    if (index == null) {
      showToast(t("planSetup.backTo", { name: item.name }));
    } else {
      const name = item.swaps?.[index]?.name ?? item.name;
      showToast(t("planSetup.usualNow", { name }), {
        undo: () =>
          setChosenSwap((m) => {
            const next = { ...m };
            if (prev == null) delete next[key];
            else next[key] = prev;
            return next;
          }),
      });
    }
  };

  const finishedRef = useRef(false);
  const finish = () => {
    if (finishedRef.current) return; // double-tap guard — no duplicate habits / PUT
    finishedRef.current = true;
    // 1. Habits for every ON toggle (daily). Water at 10:00, supplements by timing.
    let created = 0;
    if (doc.hydration && habToggles.water) {
      createHabit({ name: t("planSetup.waterHabit", { ml: doc.hydration.mlPerDay.toLocaleString("en-US") }), days: EVERY_DAY, time: "10:00", enabled: true });
      created++;
    }
    doc.supplements?.forEach((s, i) => {
      if (!habToggles[`s${i}`]) return;
      createHabit({ name: s.name, days: EVERY_DAY, time: supplementTime(s.timing), enabled: true });
      created++;
    });
    void refreshNotifications();

    // 2. Apply usuals (indices) + status ready, one PUT. Re-read the CACHED doc first:
    // "Fix something" may have edited the plan via /plan while this Review held a stale
    // snapshot (§5.5) — applying usuals to the edited doc keeps that edit instead of
    // the Finish PUT clobbering it back to the pre-edit version.
    const latest = getCachedPlan() ?? doc;
    const next = applyUsuals(latest, chosenOption, chosenSwap);
    void updatePlan(next).then(() => logChanged());

    // 3. Navigate + toast.
    const n = next.meals.length;
    onExit();
    if (created > 0) showToast(t("planSetup.planReady", { n, m: created }));
    else showToast(t("planSetup.planReadyKcal", { n, kcal: Math.round(planDailyTotals(next).kcal) }));
  };

  const isNotes = step === nMeals;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 22, paddingBottom: 150, gap: 13 }} keyboardShouldPersistTaps="handled">
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <BackButton onPress={back} label={t("common.cancel")} />
        <Text variant="caption" style={{ flex: 1, textAlign: "center", fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase" }} color={colors.labelMuted}>
          {t("planSetup.title")}
        </Text>
        <View style={{ width: 42, alignItems: "flex-end" }}>
          <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.labelMuted}>
            {t("planSetup.stepOf", { n: step + 1, total: nSteps })}
          </Text>
        </View>
      </View>

      {/* progress bar */}
      <View style={{ flexDirection: "row", gap: 5 }}>
        {Array.from({ length: nSteps }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.greens[1] : i === step ? accent : colors.progressUpcoming }} />
        ))}
      </View>

      {step === 0 && (
        <Text variant="caption" style={{ fontSize: 12.5, lineHeight: 18.75 }} color={colors.muted}>
          {t("planSetup.intro")}
        </Text>
      )}

      <Animated.View key={step} entering={FadeInUp.duration(300)}>
        {isNotes ? (
          <NotesStep doc={doc} toggles={habToggles} onToggle={(k, v) => setHabToggles((m) => ({ ...m, [k]: v }))} onFinish={finish} />
        ) : (
          <MealStep
            meal={doc.meals[step]!}
            mi={step}
            accent={accent}
            chip={chosenOption[step] ?? 0}
            onChip={(c) => {
              setChosenOption((m) => ({ ...m, [step]: c }));
              setSwapOpen(null);
            }}
            chosenSwap={chosenSwap}
            swapKey={swapKey}
            swapOpen={swapOpen}
            setSwapOpen={setSwapOpen}
            onSelectSwap={selectSwap}
            onOpenSheet={setSheetKey}
            onNext={() => (step + 1 < nSteps ? setStep(step + 1) : undefined)}
            onFix={() => router.push("/plan?edit=1")}
          />
        )}
      </Animated.View>

      {/* +N more sheet */}
      {sheetKey &&
        (() => {
          const [mi, chip, ii] = sheetKey.split("_").map(Number);
          const item = compItems(doc.meals[mi!]!, chip!)[ii!];
          if (!item) return null;
          return (
            <SwapSheet
              item={item}
              selectedIndex={chosenSwap[sheetKey] ?? null}
              onSelect={(index) => {
                setSheetKey(null);
                selectSwap(sheetKey, index, item);
              }}
              onClose={() => setSheetKey(null)}
            />
          );
        })()}
    </ScrollView>
  );
}

// ── meal step ────────────────────────────────────────────────────────────

function MealStep({
  meal,
  mi,
  accent,
  chip,
  onChip,
  chosenSwap,
  swapKey,
  swapOpen,
  setSwapOpen,
  onSelectSwap,
  onOpenSheet,
  onNext,
  onFix,
}: {
  meal: PlanMeal;
  mi: number;
  accent: string;
  chip: number;
  onChip: (c: number) => void;
  chosenSwap: Record<string, number>;
  swapKey: (mi: number, chip: number, ii: number) => string;
  swapOpen: string | null;
  setSwapOpen: (k: string | null) => void;
  onSelectSwap: (key: string, index: number | null, item: PlanItem) => void;
  onOpenSheet: (key: string) => void;
  onNext: () => void;
  onFix: () => void;
}) {
  const { t } = useTranslation();
  const items = compItems(meal, chip);
  const kcal = compKcal(meal, chip);
  const hasOptions = (meal.options?.length ?? 0) > 0;
  const nChips = 1 + (meal.options?.length ?? 0);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 12, ...shadow }}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text variant="title" style={{ fontSize: 20 }}>
          {meal.name}
        </Text>
        {meal.time ? (
          <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.labelMuted}>
            {meal.time}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {kcal != null ? (
          <View style={{ backgroundColor: colors.estimateBg, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5 }} color={colors.estimateInk}>
              ~{kcal} {t("common.kcal")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* options selector */}
      {hasOptions ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("planSetup.pickUsual")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: nChips }, (_, c) => {
              const on = c === chip;
              const k = compKcal(meal, c);
              return (
                <Animated.View key={c}>
                  <Text
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => onChip(c)}
                    style={{
                      overflow: "hidden",
                      borderRadius: 15,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: on ? "#453E35" : "rgba(120,100,75,0.16)",
                      backgroundColor: on ? "#453E35" : colors.card,
                      fontFamily: fonts.bold,
                      fontSize: 12,
                      color: on ? "#F7F0E4" : "#6E6355",
                    }}
                  >
                    {compLabel(meal, c)}
                    {k != null ? `  ~${k}` : ""}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* item rows */}
      <View>
        {items.map((it, ii) => {
          const key = swapKey(mi, chip, ii);
          const sel = chosenSwap[key];
          const swaps = it.swaps ?? [];
          const open = swapOpen === key;
          const swappedName = sel != null ? (swaps[sel]?.name ?? it.name) : it.name;
          const swappedQty = sel != null ? swapQty(swaps[sel]?.quantity, swaps[sel]?.unit) : swapQty(it.quantity, it.unit);
          return (
            <View key={ii} style={{ borderBottomWidth: ii === items.length - 1 ? 0 : 1, borderBottomColor: "rgba(120,100,75,0.07)" }}>
              <Pressable
                accessibilityRole={swaps.length ? "button" : undefined}
                disabled={!swaps.length}
                onPress={() => setSwapOpen(open ? null : key)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11 }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#E8B48C" }} />
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <Text variant="label" style={{ fontSize: 14, fontFamily: fonts.semiBold }} color="#4A4238">
                    {swappedName}
                  </Text>
                  {sel != null ? (
                    <View style={{ backgroundColor: tint(accent, 10), borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 }}>
                      <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" }} color={accent}>
                        {t("planSetup.swapped")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" style={{ fontSize: 11.5, fontFamily: fonts.bold }} color={colors.muted}>
                  {swappedQty}
                </Text>
                {swaps.length ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: tint(accent, 10), borderRadius: 11, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={accent}>
                      {swaps.length === 1 ? t("planSetup.swapOne") : t("planSetup.swaps", { n: swaps.length })}
                    </Text>
                    <Chevron open={open} flip color={accent} size={9} />
                  </View>
                ) : (
                  <Text variant="caption" style={{ fontSize: 11 }} color={colors.labelMuted}>
                    —
                  </Text>
                )}
              </Pressable>

              {open ? (
                <Animated.View entering={FadeInUp.duration(250)} style={{ marginLeft: 17, paddingBottom: 8, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 10.5 }} color={colors.labelMuted}>
                    {t("planSetup.swapHint")}
                  </Text>
                  {sel != null ? (
                    <SwapRadioRow label={swapLabel(it.name, it.quantity, it.unit)} selected={false} original onPress={() => onSelectSwap(key, null, it)} />
                  ) : null}
                  {swaps.slice(0, 5).map((s, si) => (
                    <SwapRadioRow key={si} label={swapLabel(s.name, s.quantity, s.unit)} selected={sel === si} onPress={() => onSelectSwap(key, si, it)} />
                  ))}
                  {swaps.length > 5 ? (
                    <Text accessibilityRole="button" onPress={() => onOpenSheet(key)} style={{ fontFamily: fonts.bold, fontSize: 11, paddingVertical: 6 }} color={accent}>
                      {t("planSetup.more", { n: swaps.length - 5 })}
                    </Text>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* nutritionist note */}
      {meal.note ? (
        <View style={{ backgroundColor: "#FBF6EC", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, gap: 4 }}>
          <Text style={{ fontStyle: "italic", fontSize: 12 }} color={colors.muted}>
            {meal.note}
          </Text>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("planSetup.fromNutritionist")}
          </Text>
        </View>
      ) : null}

      <Button label={t("planSetup.looksRight")} onPress={onNext} />
      <Text accessibilityRole="button" onPress={onFix} style={{ textAlign: "center", fontFamily: fonts.semiBold, fontSize: 12.5, textDecorationLine: "underline" }} color={colors.labelMuted}>
        {t("planSetup.fix")}
      </Text>
    </View>
  );
}

// ── notes & habits step ────────────────────────────────────────────────────

function NotesStep({
  doc,
  toggles,
  onToggle,
  onFinish,
}: {
  doc: EatingPlanDraft;
  toggles: Record<string, boolean>;
  onToggle: (k: string, v: boolean) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const rows: { key: string; name: string; sub: string }[] = [];
  if (doc.hydration) {
    rows.push({
      key: "water",
      name: t("planSetup.waterHabit", { ml: doc.hydration.mlPerDay.toLocaleString("en-US") }),
      sub: doc.hydration.note ?? "",
    });
  }
  doc.supplements?.forEach((s, i) => {
    rows.push({
      key: `s${i}`,
      name: s.dose ? `${s.name} — ${s.dose}` : s.name,
      sub: [s.timing, s.duration ? `· for ${s.duration}` : ""].filter(Boolean).join(" "),
    });
  });

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 12, ...shadow }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text variant="title" style={{ fontSize: 20 }}>
          {t("planSetup.notesTitle")}
        </Text>
        <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.labelMuted}>
          {t("planSetup.notesSub")}
        </Text>
      </View>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 14, fontFamily: fonts.semiBold }} color="#4A4238">
              {r.name}
            </Text>
            {r.sub ? (
              <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
                {r.sub}
              </Text>
            ) : null}
          </View>
          <Toggle on={toggles[r.key] ?? true} onToggle={() => onToggle(r.key, !(toggles[r.key] ?? true))} onColor={colors.greens[1]} accessibilityLabel={r.name} />
        </View>
      ))}
      <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.labelMuted}>
        {t("planSetup.notesFooter")}
      </Text>
      <Button label={t("planSetup.finish")} onPress={onFinish} />
    </View>
  );
}
