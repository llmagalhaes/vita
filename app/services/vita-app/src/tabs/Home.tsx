import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { api, type MealDetail, type Units, type WaterDetail, type WorkoutDetail } from "../api";
import { addLocalEntry, countNeedsReview, deleteEntry, entriesForDay, type LocalEntry } from "../db/entries";
import { logChanged, useLogVersion } from "../db/notify";
import { openReview } from "../review/ReviewSheet";
import { drainOutbox } from "../db/outbox";
import { getSettings } from "../db/settings";
import { getCachedPlan, getCachedProgram, syncPlan, syncProgram } from "../db/plan";
import { endVacation, isVacationActive, getVacation, syncVacation } from "../db/vacation";
import { listHabits } from "../db/habits";
import { openCheckins, pendingCheckins } from "../habits/checkins";
import { energyChartMax, last7EnergySeries, logManualEnergy } from "../energy/manual";
import { planDailyTotals } from "../plan/compute";
import { formatVolume } from "../lib/units";
import { GrowBar } from "../trends/parts";
import {
  Bar,
  Card,
  Chevron,
  EstimateTag,
  KeyboardAvoider,
  Text,
  WaveIllustration,
  colors,
  entryPalette,
  fonts,
  spacing,
} from "../ui";

/**
 * The little filling water tank from the prototype's water card (Fable B2).
 * Fill height is visual fullness only — scaled against 2L or today's total,
 * whichever is larger, so it can't read as a goal (philosophy: no goals).
 */
function WaterVessel({ ml }: { ml: number }) {
  const pct = (ml / Math.max(2000, ml)) * 100;
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(pct, { duration: 600 });
  }, [pct, h]);
  const fill = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return (
    <View style={{ width: 54, height: 82, borderRadius: 19, backgroundColor: "#EDF1E7", overflow: "hidden" }}>
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

function TimelineCard({ entry, index, units }: { entry: LocalEntry & { type: TimelineKind }; index: number; units: Units }) {
  const { t } = useTranslation();
  const router = useRouter();
  const kind = entry.type;
  const pal = entryPalette[kind];
  const { title, meta } = (() => {
    if (kind === "water") {
      const d = entry.detail as WaterDetail;
      return { title: t("home.waterEntry"), meta: formatVolume(d.amountMl, units, t) };
    }
    if (kind === "workout") {
      const d = entry.detail as WorkoutDetail;
      return {
        title: d.title,
        meta: d.durationMin != null ? `${d.durationMin} ${t("common.min")}` : t("home.workout"),
      };
    }
    const d = entry.detail as MealDetail;
    return {
      title: d.title ?? t("home.meal"),
      meta: `${Math.round(d.totals?.kcal ?? 0)} ${t("common.kcal")}`,
    };
  })();

  // Every kind opens its detail screen (per-kind route).
  const href = `/${kind}/${entry.id}`;

  return (
    <Animated.View entering={FadeIn.duration(500).delay(index * 70)}>
      <Pressable accessibilityRole="button" onPress={() => router.push(href)}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: spacing.sm + 2,
            paddingHorizontal: 18,
            paddingTop: 15,
            paddingBottom: 4,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text variant="title" style={{ fontSize: 19 }} color="#453E35">
              {title}
            </Text>
            <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2 }} color={colors.muted}>
              {inputMethodLabel(entry, t)} · {timeOf(entry.occurredAt)}
              {entry.syncState === "pending"
                ? ` · ${t("home.waitingToSync")}`
                : entry.syncState === "failed"
                  ? ` · ${t("home.notSaved")}`
                  : ""}
            </Text>
            {/* Terminal failure has no retry (audit Q2) — give a way to clear the card. */}
            {entry.syncState === "failed" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  deleteEntry(entry.id);
                  logChanged();
                }}
                hitSlop={8}
                style={{ alignSelf: "flex-start", marginTop: 6 }}
              >
                <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.accent}>
                  {t("home.dismiss")}
                </Text>
              </Pressable>
            )}
          </View>
          <View
            style={{ backgroundColor: pal.badgeBg, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 11 }}
          >
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 12 }} color={pal.badgeInk}>
              {meta}
            </Text>
          </View>
        </View>
        <WaveIllustration kind={kind} delay={100 + index * 90} />
      </Card>
      </Pressable>
    </Animated.View>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const version = useLogVersion();
  const [waterOpen, setWaterOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [spentInput, setSpentInput] = useState("");

  const settings = useMemo(() => getSettings(), []);
  const units = settings?.units ?? "metric";
  const entries = useMemo(() => entriesForDay(new Date()).filter(isTimelineEntry), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persisted plan/program: cache is the display source, hydrated from the server
  // once on mount (kv write bumps the log version so these re-read).
  const plan = useMemo(() => getCachedPlan(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const program = useMemo(() => getCachedProgram(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void syncPlan().then(logChanged);
    void syncProgram().then(logChanged);
    void syncVacation().then(logChanged);
  }, []);

  const onVacation = useMemo(() => isVacationActive(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const vacRange = getVacation().ranges[0];

  const pendingCheckinCount = useMemo(
    () => pendingCheckins(listHabits(), new Date()).length,
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Offline captures auto-added on reconnect, awaiting the review they skipped (CEO R12 #2).
  const reviewCount = useMemo(() => countNeedsReview(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // "Spent" = sum of logged workout kcal (D8, labeled estimate) — includes manual
  // adds. Health-source energy still needs a connected source (honest absence).
  const spentKcal = Math.round(
    workouts.reduce((s, e) => s + ((e.detail as WorkoutDetail).kcal ?? 0), 0),
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("account.title")}
          onPress={() => router.push("/account")}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color="#6E6355">
            ☺
          </Text>
        </Pressable>
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
            onPress={() => endVacation()}
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
        <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
        <Pressable accessibilityRole="button" onPress={openCheckins}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              borderWidth: 1.5,
              borderColor: "rgba(196,112,78,0.35)",
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.estimateBg, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={colors.accent}>
                {pendingCheckinCount}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ fontSize: 14.5 }}>
                {pendingCheckinCount === 1
                  ? t("habits.waitingOne")
                  : t("habits.waitingMany", { count: pendingCheckinCount })}
              </Text>
              <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
                {t("habits.tapToAnswer")}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.labelMuted}>
              ›
            </Text>
          </Card>
        </Pressable>
        </Animated.View>
      )}

      {/* offline captures added while offline — opens the review stack sheet */}
      {reviewCount > 0 && (
        <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
        <Pressable accessibilityRole="button" onPress={openReview}>
          <Card
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 14,
              borderWidth: 1.5,
              borderColor: "rgba(196,112,78,0.35)",
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.estimateBg, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={colors.accent}>
                {reviewCount}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ fontSize: 14.5 }}>
                {reviewCount === 1
                  ? t("home.offlineReviewOne")
                  : t("home.offlineReviewMany", { count: reviewCount })}
              </Text>
              <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
                {t("home.offlineReviewSub")}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.labelMuted}>
              ›
            </Text>
          </Card>
        </Pressable>
        </Animated.View>
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
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: 13, alignItems: "center" }}>
              <WaterVessel ml={waterMl} />
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <SectionLabel>{t("home.water")}</SectionLabel>
                  <Chevron open={waterOpen} />
                </View>
                <Text style={{ fontFamily: fonts.light, fontSize: 21, letterSpacing: -0.5 }} numberOfLines={1}>
                  {formatVolume(waterMl, units, t)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={quickAddWater}
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
                </Pressable>
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
                    <Text variant="caption" style={{ fontFamily: fonts.semiBold, flex: 1 }} color="#6E6355">
                      {formatVolume((w.detail as WaterDetail).amountMl, units, t)}
                    </Text>
                    <Text variant="caption" color={colors.labelMuted}>
                      {inputMethodLabel(w, t)} · {timeOf(w.occurredAt)}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            )}
          </Card>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setMacrosOpen((o) => !o)} style={{ flex: 1.35 }}>
        <Card style={{ gap: spacing.sm + 2, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <SectionLabel>{t("home.macros")}</SectionLabel>
            <Chevron open={macrosOpen} />
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
          {macrosOpen && (
            <Animated.View
              entering={FadeIn.duration(250)}
              style={{
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderTopColor: "rgba(120,100,75,0.16)",
                paddingTop: 9,
                gap: 5,
              }}
            >
              {/* kcal each macro contributes (4/4/9 kcal per g) — an estimate breakdown */}
              {(
                [
                  ["protein", macros.protein, 4],
                  ["carbs", macros.carbs, 4],
                  ["fat", macros.fat, 9],
                ] as const
              ).map(([key, grams, kcalPerG]) => (
                <View key={key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="caption" color={colors.labelMuted}>
                    {t(`home.${key}`)}
                  </Text>
                  <Text variant="caption" style={{ fontFamily: fonts.semiBold }} color="#6E6355">
                    {Math.round(grams * kcalPerG)} {t("common.kcal")}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}
        </Card>
        </Pressable>
      </View>

      {/* energy */}
      <Pressable accessibilityRole="button" onPress={() => setEnergyOpen((o) => !o)}>
        <Card style={{ gap: 11 }}>
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

      {/* eating plan + training program rows (persisted; tap to open the screen) */}
      {plan && (
        <SetupRow
          glyph="❧"
          title={t("home.eatingPlan")}
          sub={`${Math.round(planDailyTotals(plan).kcal)} ${t("home.kcalPerDay")}`}
          onPress={() => router.push("/plan")}
        />
      )}
      {program && (
        <SetupRow
          glyph="⟐"
          title={t("home.trainingProgram")}
          sub={program.splitDescription ?? `${program.days.length} ${t("home.days")}`}
          onPress={() => router.push("/program")}
        />
      )}

      {/* timeline */}
      <View style={{ paddingHorizontal: 4, paddingTop: 6 }}>
        <SectionLabel>{t("home.today")}</SectionLabel>
      </View>
      {entries.length === 0 && (
        <Text variant="body" color={colors.muted} style={{ paddingHorizontal: 4 }}>
          {t("home.emptyTimeline")}
        </Text>
      )}
      {entries.map((e, i) => (
        <TimelineCard key={e.id} entry={e} index={i} units={units} />
      ))}
    </ScrollView>
    </KeyboardAvoider>
  );
}
