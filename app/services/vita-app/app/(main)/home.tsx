import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { api, type MealDetail, type Units, type WaterDetail, type WorkoutDetail } from "../../src/api";
import { addLocalEntry, entriesForDay, type LocalEntry } from "../../src/db/entries";
import { logChanged, useLogVersion } from "../../src/db/notify";
import { drainOutbox } from "../../src/db/outbox";
import { getSettings } from "../../src/db/settings";
import { getCachedPlan, getCachedProgram, syncPlan, syncProgram } from "../../src/db/plan";
import { planDailyTotals } from "../../src/plan/compute";
import { formatVolume } from "../../src/lib/units";
import {
  Bar,
  Card,
  EstimateTag,
  Text,
  WaveIllustration,
  colors,
  entryPalette,
  fonts,
  spacing,
} from "../../src/ui";

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
              {entry.syncState === "pending" ? ` · ${t("home.waitingToSync")}` : ""}
            </Text>
          </View>
          <View
            style={{ backgroundColor: pal.badgeBg, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 11 }}
          >
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 12 }} color={pal.badgeInk}>
              {meta}
            </Text>
          </View>
        </View>
        <WaveIllustration kind={kind} />
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
  const [energyOpen, setEnergyOpen] = useState(false);

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
  }, []);

  const meals = entries.filter((e) => e.type === "meal");
  const waters = entries.filter((e) => e.type === "water");

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

  // Health-source energy arrives with the health-sync wave; placeholder until then.
  const spentKcal = 0;
  // Scale the in/out bars against the pair's own larger value — no fixed daily target
  // (philosophy: no goals/scores). 1 floor avoids /0 on an empty day.
  const energyMax = Math.max(kcalToday, spentKcal, 1);

  // Real consumed kcal for the last 7 days (today last) — no invented history.
  const last7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return Math.round(
          entriesForDay(d)
            .filter((e) => e.type === "meal")
            .reduce((s, e) => s + ((e.detail as MealDetail).totals?.kcal ?? 0), 0),
        );
      }),
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const max7 = Math.max(...last7, 1);

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
    void drainOutbox(api).then(({ synced }) => {
      if (synced > 0) logChanged();
    });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 150, gap: 13 }}
    >
      {/* header */}
      <View style={{ paddingHorizontal: 4 }}>
        <Text variant="title" style={{ fontSize: 21 }}>
          {greeting}
          {settings?.name ? `, ${settings.name}` : ""}
        </Text>
        <Text variant="caption" style={{ fontSize: 13, marginTop: 1 }} color={colors.muted}>
          {dateStr}
        </Text>
      </View>

      {/* logged today hero */}
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SectionLabel>{t("home.loggedToday")}</SectionLabel>
          <EstimateTag label={t("common.estimates")} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text style={{ fontFamily: fonts.extraLight, fontSize: 52, letterSpacing: -1.5 }}>{kcalToday}</Text>
          <Text variant="body" color={colors.muted}>
            {t("common.kcal")}
          </Text>
        </View>
      </Card>

      {/* water + macros */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => setWaterOpen((o) => !o)} style={{ flex: 1.05 }}>
          <Card style={{ gap: spacing.md, height: "100%" }}>
            <SectionLabel>{t("home.water")}</SectionLabel>
            <Text style={{ fontFamily: fonts.light, fontSize: 21, letterSpacing: -0.5 }}>
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
            {waterOpen && (
              <View
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
              </View>
            )}
          </Card>
        </Pressable>
        <Card style={{ flex: 1.35, gap: spacing.sm + 2, justifyContent: "center" }}>
          <SectionLabel>{t("home.macros")}</SectionLabel>
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
      </View>

      {/* energy */}
      <Pressable accessibilityRole="button" onPress={() => setEnergyOpen((o) => !o)}>
        <Card style={{ gap: 11 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>{t("home.energy")}</SectionLabel>
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
            <View
              style={{
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderTopColor: "rgba(120,100,75,0.16)",
                paddingTop: 11,
                gap: 9,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <SectionLabel>{t("home.last7")}</SectionLabel>
                <Text variant="caption" style={{ fontSize: 10 }} color={colors.labelMuted}>
                  {t("home.inVsOut")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end", height: 52 }}>
                {last7.map((kcal, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
                    <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", flex: 1 }}>
                      {/* consumed = real per-day kcal; spent stays 0 until health sync (honest absence) */}
                      <View style={{ width: 7, height: `${(kcal / max7) * 100}%`, borderRadius: 3, backgroundColor: colors.macro.fat, alignSelf: "flex-end" }} />
                      <View style={{ width: 7, height: `${(spentKcal / max7) * 100}%`, borderRadius: 3, backgroundColor: colors.macro.protein, alignSelf: "flex-end" }} />
                    </View>
                    <Text style={{ fontFamily: fonts.semiBold, fontSize: 9 }} color={colors.muted}>
                      {new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(undefined, { weekday: "narrow" })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
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
  );
}
