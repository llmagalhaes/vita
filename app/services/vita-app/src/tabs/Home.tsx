import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { api, type EatingPlanDraft, type MealDetail, type WaterDetail, type WorkoutDetail } from "../api";
import { addLocalEntry, countNeedsReview, deleteEntry, entriesForDay, type LocalEntry } from "../db/entries";
import { logChanged, useLogVersion } from "../db/notify";
import { openReview } from "../review/ReviewSheet";
import { drainOutbox } from "../db/outbox";
import { getSettings, integrationEnabled, isOnboarded, recapStartHour } from "../db/settings";
import {
  dismissIntPrompt,
  getCachedPlan,
  getCachedProgram,
  getPortions,
  hideSetupPrompt,
  isIntPromptDismissed,
  isSetupPromptHidden,
  mealPlanStatus,
  syncPlan,
  syncProgram,
} from "../db/plan";
import { syncRecapFromLog } from "../habits/recap";
import { RecapCard } from "./home/RecapCard";
import { endVacation, isVacationActive, getVacation, syncVacation } from "../db/vacation";
import { listHabits } from "../db/habits";
import { openCheckins, pendingCheckins } from "../habits/checkins";
import { energyChartMax, last7EnergySeries, logManualEnergy } from "../energy/manual";
import { healthActiveKcalToday, refreshHealthConnect, todaysHealthSnapshot } from "../health/healthConnect";
import { mealUsualTotals, planDailyTotals } from "../plan/compute";
import { recapLine } from "../plan/setup";
import { formatVolume } from "../lib/units";
import { GrowBar } from "../trends/parts";
import { MacrosSheet, type MacroMeal } from "./MacrosSheet";
import { DaySection } from "./home/DaySection";
import { Timeline } from "./home/Timeline";
import {
  Bar,
  Card,
  Chevron,
  ConfirmSheet,
  EstimateTag,
  KeyboardAvoider,
  PressScale,
  Text,
  colors,
  fonts,
  showToast,
  spacing,
  tint,
  useStartOnLayout,
} from "../ui";

/**
 * The little filling water tank from the prototype's water card (Fable B2).
 * Fill height is visual fullness only — scaled against 2L or today's total,
 * whichever is larger, so it can't read as a goal (philosophy: no goals).
 */
const VESSEL_H = 82;

function WaterVessel({ ml }: { ml: number }) {
  // Fill in px, not % — an animated %-height on an absolute child never applied
  // on-device (new arch); the vessel is fixed-height so px is exact anyway.
  const px = (ml / Math.max(2000, ml)) * VESSEL_H;
  const h = useSharedValue(0);
  const started = useRef(false);
  const onLayout = useStartOnLayout(() => {
    h.value = withTiming(px, { duration: 600 });
    started.current = true;
  });
  useEffect(() => {
    if (started.current) h.value = withTiming(px, { duration: 600 });
  }, [px, h]);
  const fill = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View onLayout={onLayout} style={{ width: 54, height: VESSEL_H, borderRadius: 19, backgroundColor: "#EDF1E7", overflow: "hidden" }}>
      <Animated.View
        style={[
          { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#8CA58A", borderTopLeftRadius: 10, borderTopRightRadius: 10 },
          fill,
        ]}
      />
      <Svg width={16} height={18} style={{ position: "absolute", left: 19, top: 31 }}>
        <Path d="M8 1.5 C8 1.5 2.8 8 2.8 11.4 a5.2 5.2 0 0 0 10.4 0 C13.2 8 8 1.5 8 1.5 Z" fill="rgba(255,253,247,0.85)" />
      </Svg>
    </View>
  );
}

/** One round header icon button (CEO #4 — the prototype's 4-icon row). */
function HeaderIcon({ label, onPress, icon }: { label: string; onPress: () => void; icon: "trends" | "checks" | "sliders" | "person" }) {
  const ink = "#6E6355";
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={18} height={18} viewBox="0 0 18 18">
        {icon === "trends" && (
          <>
            <Path d="M3 13.5 L7 9 L10 11.5 L15 5.5" fill="none" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={15} cy={5.5} r={1.6} fill={ink} />
          </>
        )}
        {icon === "checks" && (
          <>
            <Circle cx={9} cy={9} r={6.4} fill="none" stroke={ink} strokeWidth={1.6} />
            <Path d="M6.2 9.3 l1.9 1.9 L12 7" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {icon === "sliders" && (
          <>
            <Path d="M3 5.5 h12 M3 9 h12 M3 12.5 h12" stroke={ink} strokeWidth={1.5} strokeLinecap="round" />
            <Circle cx={6.5} cy={5.5} r={1.9} fill={colors.card} stroke={ink} strokeWidth={1.4} />
            <Circle cx={11.5} cy={9} r={1.9} fill={colors.card} stroke={ink} strokeWidth={1.4} />
            <Circle cx={7.5} cy={12.5} r={1.9} fill={colors.card} stroke={ink} strokeWidth={1.4} />
          </>
        )}
        {icon === "person" && (
          <>
            <Circle cx={9} cy={6.4} r={3} fill="none" stroke={ink} strokeWidth={1.6} />
            <Path d="M3.6 15 a5.5 4.6 0 0 1 10.8 0" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
          </>
        )}
      </Svg>
    </PressScale>
  );
}

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function SetupRow({ glyph, title, sub, onPress }: { glyph: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
        <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 14 }} color="#5F7A61">
            {glyph}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 14.5 }}>
            {title}
          </Text>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 12, marginTop: 1 }} color={colors.muted}>
            {sub}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.labelMuted}>
          ›
        </Text>
      </Card>
    </Pressable>
  );
}

/** Accented count banner (check-ins waiting, offline captures to review). */
function CountBanner({ count, title, sub, onPress }: { count: number; title: string; sub: string; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Card
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 14,
            borderWidth: 1.5,
            borderColor: "rgba(196,112,78,0.35)",
            // warm terracotta lift, distinct from the neutral card shadow (prototype
            // check-in banner `0 10px 24px rgba(160,100,60,.12)`) — APP-065
            shadowColor: "#A0643C",
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.estimateBg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={colors.accent}>
              {count}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 14.5 }}>
              {title}
            </Text>
            <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
              {sub}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.labelMuted}>
            ›
          </Text>
        </Card>
      </Pressable>
    </Animated.View>
  );
}

/** A small leaf glyph for the plan wells (matches the ❧ used elsewhere). */
const LeafGlyph = ({ color }: { color: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16">
    <Path d="M13.5 2.5 C7 2.5 3 6 3 11 C3 12 3.3 13 3.3 13 C3.3 13 8 12.5 11 9.5 C13.5 7 13.5 2.5 13.5 2.5 Z" fill={color} />
  </Svg>
);

/** "Your meal plan is in" — the async "notify when ready" surface (§7.3). Shown while status:review. */
function PlanPendingBanner({ nMeals, onContinue, onDismiss }: { nMeals: number; onContinue: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={ZoomIn.duration(350)} exiting={FadeOut.duration(220)} style={{ borderRadius: 22 }}>
      <LinearGradient
        colors={["#FFF7EA", "#FBEFDD"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 22, borderWidth: 1.5, borderColor: tint(colors.accent, 26), paddingTop: 12, paddingBottom: 12, paddingLeft: 15, paddingRight: 12 }}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}>
          <LeafGlyph color="#5F7A61" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 13.5 }}>{t("home.planBannerTitle")}</Text>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
            {t("home.planBannerSub", { n: nMeals })}
          </Text>
        </View>
        <PressScale accessibilityRole="button" onPress={onContinue} style={{ borderRadius: 15, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: colors.accent }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color="#FFF9F1">{t("home.planBannerContinue")}</Text>
        </PressScale>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onDismiss} hitSlop={8} style={{ width: 30, alignItems: "center" }}>
          <Text style={{ fontSize: 18 }} color={colors.labelMuted}>×</Text>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

/** Integrations prompt (§7.4) — neutral, Android-only, once until dismissed. */
function IntegrationsPrompt({ onConnect, onDismiss }: { onConnect: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={ZoomIn.duration(350)} exiting={FadeOut.duration(220)}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
          <Svg width={17} height={17} viewBox="0 0 17 17">
            <Path d="M6 11 L11 6 M6.5 8.5 a2.5 2.5 0 0 1 0-3.5 l1-1 a2.5 2.5 0 0 1 3.5 3.5 l-1 1 M10.5 8.5 a2.5 2.5 0 0 1 0 3.5 l-1 1 a2.5 2.5 0 0 1-3.5-3.5 l1-1" fill="none" stroke="#5F7A61" strokeWidth={1.4} strokeLinecap="round" />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ fontSize: 13.5 }}>{t("home.intPromptTitle")}</Text>
          <Text variant="caption" numberOfLines={1} style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
            {t("home.intPromptSub")}
          </Text>
        </View>
        <PressScale accessibilityRole="button" onPress={onConnect} style={{ borderRadius: 15, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: tint(colors.accent, 10) }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.accent}>{t("home.connect")}</Text>
        </PressScale>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onDismiss} hitSlop={8} style={{ width: 30, alignItems: "center" }}>
          <Text style={{ fontSize: 18 }} color={colors.labelMuted}>×</Text>
        </Pressable>
      </Card>
    </Animated.View>
  );
}

/** Morning empty state (§7.5) — dashed card in the timeline area when today has no logs. */
function MorningEmpty({ plan, onSeePlan }: { plan: EatingPlanDraft | null; onSeePlan: () => void }) {
  const { t } = useTranslation();
  const firstMeal = plan?.meals.find((m) => m.time);
  const body = firstMeal
    ? t("home.emptyPlanBody", { meal: firstMeal.name.toLowerCase(), time: firstMeal.time })
    : t("home.emptyBody");
  return (
    <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashedBorder, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 20, alignItems: "center", gap: 9 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.well, alignItems: "center", justifyContent: "center" }}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx={11} cy={11} r={4.2} fill="none" stroke="#C98A3F" strokeWidth={1.6} />
          <Path d="M11 2.5 V4.5 M11 17.5 V19.5 M2.5 11 H4.5 M17.5 11 H19.5 M5 5 l1.4 1.4 M15.6 15.6 l1.4 1.4 M17 5 l-1.4 1.4 M6.4 15.6 l-1.4 1.4" stroke="#C98A3F" strokeWidth={1.4} strokeLinecap="round" />
        </Svg>
      </View>
      <Text variant="label" style={{ fontSize: 15.5, textAlign: "center" }}>{t("home.emptyTitle")}</Text>
      <Text variant="caption" style={{ fontSize: 12.5, textAlign: "center", maxWidth: 230 }} color={colors.muted}>
        {body}
      </Text>
      {plan && (
        <PressScale accessibilityRole="button" onPress={onSeePlan} style={{ marginTop: 4, borderRadius: 15, paddingVertical: 9, paddingHorizontal: 13, backgroundColor: tint(colors.accent, 10) }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>{t("home.seeTodaysPlan")}</Text>
        </PressScale>
      )}
    </View>
  );
}

/** Collapsed plan card (§7.6) — "kcal left" + progress; expands to per-meal logged/planned. */
function PlanRow2({ plan, meals, portions, onOpen }: { plan: EatingPlanDraft; meals: LocalEntry[]; portions: Record<string, number>; onOpen: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const planTotal = Math.round(planDailyTotals(plan, portions).kcal);
  const kcalToday = Math.round(meals.reduce((s, e) => s + ((e.detail as MealDetail).totals?.kcal ?? 0), 0));
  const left = Math.max(0, planTotal - kcalToday);
  const pct = planTotal > 0 ? Math.min(100, (kcalToday / planTotal) * 100) : 0;
  const loggedNames = new Set(meals.map((e) => ((e.detail as MealDetail).title ?? "").toLowerCase()));
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen((o) => !o)}>
      <Card layout={LinearTransition.duration(220)} style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
            <LeafGlyph color="#5F7A61" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 15 }}>{t("home.kcalLeft", { n: left.toLocaleString("en-US") })}</Text>
            <Text variant="caption" style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
              {t("home.kcalLeftOf", { total: planTotal.toLocaleString("en-US") })}
            </Text>
          </View>
          <Chevron open={open} />
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.progressUpcoming, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
        </View>
        {open && (
          <Animated.View entering={FadeIn.duration(250)} style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: "rgba(120,100,75,0.16)", paddingTop: 10, gap: 8 }}>
            {plan.meals.map((meal, i) => {
              const k = Math.round(mealUsualTotals(meal, portions).kcal) || meal.kcal || 0;
              const logged = loggedNames.has(meal.name.toLowerCase());
              return (
                <View key={`${meal.name}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: logged ? "#8CA58A" : "#E4DBC9" }} />
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 12.5, flex: 1 }} color="#453E35" numberOfLines={1}>
                    {meal.name}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 11.5 }} color={logged ? "#5F7A61" : colors.muted}>
                    {logged ? t("home.mealLogged", { k }) : t("home.mealPlanned", { k })}
                  </Text>
                </View>
              );
            })}
            <Pressable accessibilityRole="link" onPress={onOpen} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 2 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>{t("home.openPlan")}</Text>
            </Pressable>
          </Animated.View>
        )}
      </Card>
    </Pressable>
  );
}

function inputMethodLabel(e: LocalEntry, t: (k: string) => string): string {
  switch (e.inputMethod) {
    case "voice":
      return t("home.byVoice");
    case "photo":
      return t("home.byPhoto");
    case "tap":
      return t("home.byTap");
    default:
      return t("home.byText");
  }
}

// Home shows the three loggable kinds; check-ins (BE-024) belong to Habits (D1).
type TimelineKind = "meal" | "water" | "workout";
const isTimelineEntry = (e: LocalEntry): e is LocalEntry & { type: TimelineKind } =>
  e.type !== "checkin";

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const [waterOpen, setWaterOpen] = useState(false);
  const [macrosSheetOpen, setMacrosSheetOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [spentInput, setSpentInput] = useState("");
  const [endVacationConfirmOpen, setEndVacationConfirmOpen] = useState(false);

  // Home v2 timeline: which day the timeline browses (0 = today, up to 9 back).
  // Discrete commits only — never set mid-gesture. The top cards stay pinned to
  // today regardless; only the timeline below is day-aware.
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const goDay = useCallback((off: number) => setSelectedDayOffset(off), []);
  const onToggleEntry = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Terminal-failure dismiss for a timeline entry (audit Q2) — no retry infra.
  const onDismissEntry = useCallback((id: string) => {
    deleteEntry(id);
    logChanged();
  }, []);

  const settings = useMemo(() => getSettings(), []);
  const entries = useMemo(() => entriesForDay(new Date()).filter(isTimelineEntry), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  // The selected day's entries drive the timeline (same SQLite query, offset date).
  const dayEntries = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - selectedDayOffset);
    return entriesForDay(d).filter(isTimelineEntry);
  }, [version, selectedDayOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persisted plan/program: cache is the display source, hydrated from the server
  // once on mount (kv write bumps the log version so these re-read).
  const plan = useMemo(() => getCachedPlan(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const program = useMemo(() => getCachedProgram(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void syncPlan().then(logChanged);
    void syncProgram().then(logChanged);
    void syncVacation().then(logChanged);
    // Read today's Health Connect totals if that source is connected (APP-038).
    // No-op in Expo Go / iOS / when disconnected; feeds the Energy card "spent".
    void refreshHealthConnect();
  }, []);

  // Recompute + (re)schedule the 20:30 evening recap whenever the log changes —
  // Home is always mounted, so this covers the app-open case (§9). Cheap; cancels
  // when the log is empty / after 20:30 / paused / recap-off.
  useEffect(() => {
    void syncRecapFromLog();
  }, [version]);

  const onVacation = useMemo(() => isVacationActive(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const vacRange = getVacation().ranges[0];

  const pendingCheckinCount = useMemo(
    () => pendingCheckins(listHabits(), new Date()).length,
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Offline captures auto-added on reconnect, awaiting the review they skipped (CEO R12 #2).
  const reviewCount = useMemo(() => countNeedsReview(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // v3 banners (§7.3/§7.4) — plain reads, re-evaluated each render (version-bumped
  // on dismiss so the FadeOut plays). Integrations prompt is Android-only + honest.
  const planStatus = mealPlanStatus();
  const showPlanPending = planStatus === "review" && !isSetupPromptHidden();
  const showIntPrompt =
    Platform.OS === "android" && isOnboarded() && !integrationEnabled("healthConnect") && !isIntPromptDismissed();
  const onDismissPlanPending = useCallback(() => {
    hideSetupPrompt();
    showToast(t("home.planBannerLater"));
    logChanged();
  }, [t]);
  const onDismissIntPrompt = useCallback(() => {
    dismissIntPrompt();
    showToast(t("home.intPromptLater"));
    logChanged();
  }, [t]);

  const meals = entries.filter((e) => e.type === "meal");
  const waters = entries.filter((e) => e.type === "water");
  const workouts = entries.filter((e) => e.type === "workout");

  const kcalToday = Math.round(
    meals.reduce((sum, e) => sum + ((e.detail as MealDetail).totals?.kcal ?? 0), 0),
  );
  const waterMl = waters.reduce((sum, e) => sum + (e.detail as WaterDetail).amountMl, 0);
  const macros = meals.reduce(
    (m, e) => {
      const tt = (e.detail as MealDetail).totals;
      return {
        protein: m.protein + (tt?.proteinG ?? 0),
        carbs: m.carbs + (tt?.carbsG ?? 0),
        fat: m.fat + (tt?.fatG ?? 0),
      };
    },
    { protein: 0, carbs: 0, fat: 0 },
  );
  const maxMacro = Math.max(macros.protein, macros.carbs, macros.fat, 1);

  // Per-meal macro breakdown for the macros sheet (CEO #5).
  const macroMeals: MacroMeal[] = meals.map((e) => {
    const d = e.detail as MealDetail;
    return {
      id: e.id,
      title: d.title ?? t("home.meal"),
      proteinG: d.totals?.proteinG ?? 0,
      carbsG: d.totals?.carbsG ?? 0,
      fatG: d.totals?.fatG ?? 0,
      kcal: d.totals?.kcal ?? 0,
      at: e.occurredAt,
    };
  });

  // "Spent" = logged workout kcal (D8, labeled estimate) + Health Connect active
  // energy when that source is connected (APP-038). Both are estimates. HC active
  // energy is 0 unless a *today* snapshot exists — honest absence otherwise.
  const hcSnapshot = useMemo(() => todaysHealthSnapshot(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const spentKcal = Math.round(
    workouts.reduce((s, e) => s + ((e.detail as WorkoutDetail).kcal ?? 0), 0) + healthActiveKcalToday(),
  );
  // Scale the in/out bars against the pair's own larger value — no fixed daily target
  // (philosophy: no goals/scores). 1 floor avoids /0 on an empty day.
  const energyMax = Math.max(kcalToday, spentKcal, 1);

  // Real consumed AND spent kcal per day for the last 7 days (today last) — both read
  // from the log, no invented history (audit 1.1/2.2). max7 includes spent so no bar overflows.
  const last7 = useMemo(() => last7EnergySeries(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const max7 = energyChartMax(last7);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("home.goodMorning") : hour < 18 ? t("home.goodAfternoon") : t("home.goodEvening");
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const quickAddWater = () => {
    addLocalEntry({
      type: "water",
      occurredAt: new Date().toISOString(),
      inputMethod: "tap",
      isEstimate: false,
      detail: { amountMl: 250 },
    });
    logChanged();
    void drainOutbox(api)
      .then(({ synced }) => {
        if (synced > 0) logChanged();
      })
      .catch(() => {});
  };

  const addSpent = () => {
    const kcal = parseInt(spentInput, 10);
    if (!Number.isFinite(kcal) || kcal <= 0) return;
    logManualEnergy(kcal);
    setSpentInput("");
    logChanged();
    void drainOutbox(api)
      .then(({ synced }) => {
        if (synced > 0) logChanged();
      })
      .catch(() => {});
  };

  return (
    <KeyboardAvoider>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 150, gap: 13 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title" style={{ fontSize: 21 }}>
            {greeting}
            {settings?.name ? `, ${settings.name}` : ""}
          </Text>
          <Text variant="caption" style={{ fontSize: 13, marginTop: 1 }} color={colors.muted}>
            {dateStr}
          </Text>
        </View>
        {/* Single Account entry (APP-068): Trends & Habits already live on the nav
            pill, and Integrations is reached from Account → Your setup — so the
            session-8 four-icon row was redundant. Reverts to the Round-5 single
            person button; nothing is orphaned. */}
        <HeaderIcon label={t("account.title")} icon="person" onPress={() => router.push("/account")} />
      </View>

      {/* vacation banner (sea tone) — active trip only; eases in/out on start/end */}
      {onVacation && (
        <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
        <Card
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            paddingVertical: 12,
            backgroundColor: "#EAF3F4",
            borderWidth: 1.5,
            borderColor: "rgba(62,143,163,0.32)",
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15 }} color={colors.vacationAccent}>☀</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 13.5 }} color="#3A4C51">
              {t("account.vacationMode")}
            </Text>
            <Text variant="caption" numberOfLines={1} style={{ marginTop: 1 }} color="#6B8087">
              {vacRange ? `${vacRange.start} – ${vacRange.end}` : ""}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEndVacationConfirmOpen(true)}
            style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.card }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.vacationAccent}>
              {t("account.end")}
            </Text>
          </Pressable>
        </Card>
        </Animated.View>
      )}

      {/* check-ins waiting banner (opens the stack sheet) */}
      {pendingCheckinCount > 0 && (
        <CountBanner
          count={pendingCheckinCount}
          title={pendingCheckinCount === 1 ? t("habits.waitingOne") : t("habits.waitingMany", { count: pendingCheckinCount })}
          sub={t("habits.tapToAnswer")}
          onPress={openCheckins}
        />
      )}

      {/* offline captures added while offline — opens the review stack sheet */}
      {reviewCount > 0 && (
        <CountBanner
          count={reviewCount}
          title={reviewCount === 1 ? t("home.offlineReviewOne") : t("home.offlineReviewMany", { count: reviewCount })}
          sub={t("home.offlineReviewSub")}
          onPress={openReview}
        />
      )}

      {/* ③ plan-setup pending — the async "notify when ready" surface (§7.3) */}
      {showPlanPending && plan && (
        <PlanPendingBanner
          nMeals={plan.meals.length}
          onContinue={() => router.push("/plan-setup?mode=review")}
          onDismiss={onDismissPlanPending}
        />
      )}

      {/* ④ integrations prompt — Android only, once (§7.4) */}
      {showIntPrompt && (
        <IntegrationsPrompt onConnect={() => router.replace("/integrations")} onDismiss={onDismissIntPrompt} />
      )}

      {/* ⑤ evening recap — from the user-set start hour (default 20:00) when something's logged (§7.2, APP-090) */}
      {hour >= recapStartHour() && entries.length > 0 && (
        <RecapCard
          line={recapLine(meals.length, workouts.length, waterMl)}
          kcalIn={kcalToday}
          spent={spentKcal}
          onSeeTrends={() => router.replace("/trends")}
        />
      )}

      {/* logged today hero — the prototype's centered 82px figure, no card chrome (Fable B1) */}
      <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 2 }}>
        <Text style={{ fontFamily: fonts.extraLight, fontSize: 82, letterSpacing: -2.5, lineHeight: 86 }} color="#453E35">
          {kcalToday}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 }}>
          <Text style={{ fontSize: 13.5 }} color={colors.muted}>
            {t("home.kcalLoggedToday")}
          </Text>
          <EstimateTag label={t("common.estimates")} />
        </View>
      </View>

      {/* water + macros */}
      {/* align-start so the expandable water list grows downward on its own; a flex:1
          Card in this stretch row inflated the whole row to ~3x screen when expanded
          (CEO bug #7). No height:"100%" either (that blew the row to full-screen). */}
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <Pressable accessibilityRole="button" onPress={() => setWaterOpen((o) => !o)} style={{ flex: 1.05 }}>
          <Card layout={LinearTransition.duration(220)} style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: 13, alignItems: "center" }}>
              <WaterVessel ml={waterMl} />
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <SectionLabel>{t("home.water")}</SectionLabel>
                  <Chevron open={waterOpen} />
                </View>
                {/* adjustsFontSizeToFit: the vessel leaves a narrow text column;
                    on narrow devices "500 ml" was truncating to "500 …" (APP-066).
                    Shrink to fit one line instead of clipping the unit. */}
                <Text
                  style={{ fontFamily: fonts.light, fontSize: 21, letterSpacing: -0.5 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatVolume(waterMl, t)}
                </Text>
                <PressScale
                  accessibilityRole="button"
                  onPress={quickAddWater}
                  scale={0.94} // small round-ish button — snappier press than the .97 default (prototype .94)
                  style={{
                    alignSelf: "flex-start",
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: 17,
                    backgroundColor: "#E7EDE1",
                  }}
                >
                  <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#5F7A61">
                    {t("home.quickAdd")}
                  </Text>
                </PressScale>
              </View>
            </View>
            {waterOpen && (
              <Animated.View
                entering={FadeIn.duration(250)}
                style={{
                  borderTopWidth: 1,
                  borderStyle: "dashed",
                  borderTopColor: "rgba(120,100,75,0.16)",
                  paddingTop: 10,
                  gap: 7,
                }}
              >
                {waters.map((w) => (
                  <Pressable
                    key={w.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/water/${w.id}`)}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.macro.protein }} />
                    {/* One ellipsized meta string (amount · method) + a short time, per the
                        prototype (line 458): the old split put an unconstrained method·time
                        Text beside a flex:1 amount, starving it to ~0px so "250 ml" wrapped
                        one char per line (APP-066). minWidth:0 lets it actually shrink. */}
                    <Text variant="caption" numberOfLines={1} style={{ fontFamily: fonts.semiBold, flex: 1, minWidth: 0 }} color="#6E6355">
                      {formatVolume((w.detail as WaterDetail).amountMl, t)} · {inputMethodLabel(w, t)}
                    </Text>
                    <Text variant="caption" style={{ flexShrink: 0 }} color={colors.labelMuted}>
                      {timeOf(w.occurredAt)}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            )}
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.macrosSheetTitle")} onPress={() => setMacrosSheetOpen(true)} style={{ flex: 1.35 }}>
        <Card style={{ gap: spacing.sm + 2, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>{t("home.macros")}</SectionLabel>
            {/* ↗ opens the full macros sheet (prototype) */}
            <Svg width={13} height={13} viewBox="0 0 13 13">
              <Path d="M4 9 L9 4 M5 4 h4 v4" fill="none" stroke={colors.labelMuted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          {(
            [
              ["protein", macros.protein, colors.macro.protein],
              ["carbs", macros.carbs, colors.macro.carbs],
              ["fat", macros.fat, colors.macro.fat],
            ] as const
          ).map(([key, grams, color]) => (
            <View key={key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#6E6355">
                  {t(`home.${key}`)}
                </Text>
                <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
                  {Math.round(grams)} g
                </Text>
              </View>
              <Bar pct={(grams / maxMacro) * 100} color={color} />
            </View>
          ))}
        </Card>
        </Pressable>
      </View>

      {/* energy */}
      <Pressable accessibilityRole="button" onPress={() => setEnergyOpen((o) => !o)}>
        <Card layout={LinearTransition.duration(220)} style={{ gap: 11 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <SectionLabel>{t("home.energy")}</SectionLabel>
              <Chevron open={energyOpen} />
            </View>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {t("home.energyNote")}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {(
              [
                [kcalToday, t("home.consumed")],
                [spentKcal, t("home.spent")],
                [kcalToday - spentKcal, t("home.balance")],
              ] as const
            ).map(([value, label]) => (
              <View key={label} style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.light, fontSize: 21, letterSpacing: -0.5 }}>{value}</Text>
                <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 10.5, marginTop: 1 }} color={colors.muted}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ width: 26, fontFamily: fonts.extraBold, fontSize: 9.5, textTransform: "uppercase" }} color={colors.labelMuted}>
                {t("home.in")}
              </Text>
              <View style={{ flex: 1 }}>
                <Bar pct={(kcalToday / energyMax) * 100} color={colors.macro.fat} />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ width: 26, fontFamily: fonts.extraBold, fontSize: 9.5, textTransform: "uppercase" }} color={colors.labelMuted}>
                {t("home.out")}
              </Text>
              <View style={{ flex: 1 }}>
                <Bar pct={(spentKcal / energyMax) * 100} color={colors.macro.protein} />
              </View>
            </View>
          </View>
          {energyOpen && (
            <Animated.View
              entering={FadeIn.duration(250)}
              style={{
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderTopColor: "rgba(120,100,75,0.16)",
                paddingTop: 11,
                gap: 9,
              }}
            >
              {/* manual "spent" add (D8): type a number here, or say "burned 300"
                  to the pill. Both write a workout entry (kcal, no exercises). */}
              <View style={{ gap: 6 }}>
                <SectionLabel>{t("home.addSpent")}</SectionLabel>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={spentInput}
                    onChangeText={(v) => setSpentInput(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    placeholder={t("home.spentPlaceholder")}
                    placeholderTextColor={colors.labelMuted}
                    accessibilityLabel={t("home.addSpent")}
                    onSubmitEditing={addSpent}
                    style={{ flex: 1, borderWidth: 1, borderColor: "rgba(120,100,75,0.16)", backgroundColor: colors.sheet, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 13, fontFamily: fonts.semiBold, fontSize: 14, color: colors.ink }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("home.addSpent")}
                    disabled={!spentInput}
                    onPress={addSpent}
                    style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 15, backgroundColor: "#E7EDE1", opacity: spentInput ? 1 : 0.5 }}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color="#5F7A61">
                      {t("home.add")}
                    </Text>
                  </Pressable>
                </View>
                <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
                  {t("home.spentHint")}
                </Text>
              </View>
              {/* Health Connect readout (APP-038) — only when a today snapshot exists.
                  Honest device data, labeled an estimate; steps + sessions have no
                  card of their own so they surface here. */}
              {hcSnapshot && (
                <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.muted}>
                  {t("home.healthConnectReadout", {
                    steps: hcSnapshot.steps.toLocaleString(),
                    sessions: hcSnapshot.sessions,
                  })}
                </Text>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <SectionLabel>{t("home.last7")}</SectionLabel>
                <Text variant="caption" style={{ fontSize: 10 }} color={colors.labelMuted}>
                  {t("home.inVsOut")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end", height: 52 }}>
                {last7.map((day, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
                    <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", flex: 1 }}>
                      {/* both bars are that day's real logged kcal (consumed | spent) */}
                      <GrowBar pct={(day.consumed / max7) * 100} color={colors.macro.fat} delay={i * 40} style={{ width: 7, borderRadius: 3, alignSelf: "flex-end" }} />
                      <GrowBar pct={(day.spent / max7) * 100} color={colors.macro.protein} delay={i * 40 + 60} style={{ width: 7, borderRadius: 3, alignSelf: "flex-end" }} />
                    </View>
                    <Text style={{ fontFamily: fonts.semiBold, fontSize: 9 }} color={colors.muted}>
                      {new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(undefined, { weekday: "narrow" })}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </Card>
      </Pressable>

      {/* eating plan (v3 collapsed plan2 card) + training program row. The plan card
          shows only in ready state — the banner covers review, none shows nothing. */}
      {planStatus === "ready" && plan && (
        <PlanRow2 plan={plan} meals={meals} portions={getPortions()} onOpen={() => router.push("/plan")} />
      )}
      {program && (
        <SetupRow
          glyph="⟐"
          title={t("home.trainingProgram")}
          sub={program.splitDescription ?? `${program.days.length} ${t("home.days")}`}
          onPress={() => router.push("/program")}
        />
      )}

      {/* timeline v2 — date section (label + Today↺ pill + dock) then the
          day-swipeable timeline. Replaces the old wave-illustrated cards. */}
      <View style={{ paddingTop: 6 }}>
        <DaySection selectedOffset={selectedDayOffset} goDay={goDay} />
      </View>
      <Timeline
        entries={dayEntries}
        selectedOffset={selectedDayOffset}
        goDay={goDay}
        expandedKeys={expandedKeys}
        onToggle={onToggleEntry}
        onDismiss={onDismissEntry}
        emptyState={<MorningEmpty plan={plan} onSeePlan={() => router.replace("/today")} />}
      />
    </ScrollView>
    <MacrosSheet
      visible={macrosSheetOpen}
      onClose={() => setMacrosSheetOpen(false)}
      macros={macros}
      meals={macroMeals}
    />
    <ConfirmSheet
      visible={endVacationConfirmOpen}
      title={t("account.endVacationConfirmTitle")}
      message={t("account.endVacationConfirmBody")}
      confirmLabel={t("account.end")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => {
        endVacation();
        setEndVacationConfirmOpen(false);
        showToast(t("toast.vacationEnded"));
      }}
      onClose={() => setEndVacationConfirmOpen(false)}
    />
    </KeyboardAvoider>
  );
}
