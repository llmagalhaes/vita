import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { entriesInRange } from "../db/entries";
import { getSettings } from "../db/settings";
import { useLogVersion } from "../db/notify";
import { formatVolume } from "../lib/units";
import { Text, colors, fonts } from "../ui";
import {
  type DayBucket,
  type ExcludeDay,
  type TrendWindow,
  aggregateDays,
  mealTimeDots,
  visibleDays,
  windowRange,
} from "./aggregate";
import { TrendCard, linePath } from "./parts";

const round = (n: number) => Math.round(n);
const CURVE_W = 300;
const CURVE_H = 120;

/** Sparse day-axis label: weekday for a short window, day-of-month sampled otherwise. */
function barLabel(d: Date, i: number, n: number): string {
  if (n <= 7) return d.toLocaleDateString(undefined, { weekday: "narrow" });
  const every = Math.ceil(n / 7);
  return i % every === 0 ? String(d.getDate()) : "";
}

const dateLabel = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function DayBars({
  days,
  value,
  color,
  active,
  height = 96,
  topLabel,
}: {
  days: DayBucket[];
  value: (b: DayBucket) => number;
  color: (b: DayBucket) => string;
  active: number | null;
  height?: number;
  topLabel?: (b: DayBucket) => string;
}) {
  const n = days.length;
  const max = Math.max(1, ...days.filter((b) => !b.excluded).map(value));
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end", height }}>
      {days.map((b, i) => {
        const v = value(b);
        const dim = b.excluded ? 0.25 : active != null && active !== i ? 0.4 : 1;
        return (
          <View key={b.key} style={{ flex: 1, alignItems: "center", gap: 5, height: "100%", justifyContent: "flex-end", minWidth: 0, opacity: dim }}>
            {topLabel && n <= 14 && (
              <Text style={{ fontFamily: fonts.bold, fontSize: 9 }} color={colors.labelMuted} numberOfLines={1}>
                {topLabel(b)}
              </Text>
            )}
            <View style={{ width: "100%", maxWidth: 22, height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0, borderRadius: 6, backgroundColor: color(b) }} />
            <Text style={{ fontFamily: active === i ? fonts.extraBold : fonts.semiBold, fontSize: 10, height: 13 }} color={colors.muted}>
              {barLabel(b.date, i, n)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Consumed vs spent — paired thin bars per day (D8: spent = logged workout kcal). */
function PairBars({ days, active }: { days: DayBucket[]; active: number | null }) {
  const max = Math.max(1, ...days.filter((b) => !b.excluded).flatMap((b) => [b.consumedKcal, b.spentKcal]));
  const n = days.length;
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end", height: 96 }}>
      {days.map((b, i) => {
        const dim = b.excluded ? 0.25 : active != null && active !== i ? 0.4 : 1;
        return (
          <View key={b.key} style={{ flex: 1, alignItems: "center", gap: 5, height: "100%", justifyContent: "flex-end", opacity: dim }}>
            <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", justifyContent: "center", width: "100%", flex: 1 }}>
              <View style={{ width: 9, height: `${(b.consumedKcal / max) * 100}%`, minHeight: b.consumedKcal > 0 ? 3 : 0, borderRadius: 4, backgroundColor: colors.macro.fat }} />
              <View style={{ width: 9, height: `${(b.spentKcal / max) * 100}%`, minHeight: b.spentKcal > 0 ? 3 : 0, borderRadius: 4, backgroundColor: colors.macro.protein }} />
            </View>
            <Text style={{ fontFamily: active === i ? fonts.extraBold : fonts.semiBold, fontSize: 10, height: 13 }} color={colors.muted}>
              {barLabel(b.date, i, n)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Macro balance — per-day stacked share of kcal (protein/carbs/fat by 4/4/9 kcal/g). */
function MacroBars({ days, active }: { days: DayBucket[]; active: number | null }) {
  const n = days.length;
  return (
    <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end", height: 68 }}>
      {days.map((b, i) => {
        const pk = b.protein * 4;
        const ck = b.carbs * 4;
        const fk = b.fat * 9;
        const tot = pk + ck + fk;
        const dim = b.excluded ? 0.25 : active != null && active !== i ? 0.4 : 1;
        return (
          <View key={b.key} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0, opacity: dim }}>
            <View style={{ width: "100%", maxWidth: 22, height: "100%", flexDirection: "column", justifyContent: "flex-end" }}>
              {tot > 0 && (
                <>
                  <View style={{ height: `${(fk / tot) * 100}%`, backgroundColor: colors.macro.fat, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                  <View style={{ height: `${(ck / tot) * 100}%`, backgroundColor: colors.macro.carbs }} />
                  <View style={{ height: `${(pk / tot) * 100}%`, backgroundColor: colors.macro.protein, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
      {items.map(([label, color]) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
          <Text variant="caption" style={{ fontSize: 10.5, fontFamily: fonts.semiBold }} color={colors.muted}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function FoodTab({ window, isExcluded }: { window: TrendWindow; isExcluded?: ExcludeDay }) {
  const { t } = useTranslation();
  const version = useLogVersion();
  const units = getSettings()?.units ?? "metric";
  const [calCurve, setCalCurve] = useState(false);

  const days = useMemo(() => {
    const { start, end } = windowRange(window);
    // Meals, water and workouts all live in `entries`; pull the whole window once.
    const rows = [
      ...entriesInRange("meal", start, end),
      ...entriesInRange("water", start, end),
      ...entriesInRange("workout", start, end),
    ];
    return aggregateDays(rows, window, new Date(), isExcluded);
  }, [window, version, isExcluded]);

  const dots = useMemo(() => {
    const { start, end } = windowRange(window);
    return mealTimeDots(entriesInRange("meal", start, end), window, new Date(), isExcluded);
  }, [window, version, isExcluded]);

  const shown = visibleDays(days);
  const daysWithMeals = shown.filter((d) => d.consumedKcal > 0).length;
  const avgKcal = daysWithMeals > 0 ? round(shown.reduce((s, d) => s + d.consumedKcal, 0) / daysWithMeals) : 0;
  const totalSpent = round(shown.reduce((s, d) => s + d.spentKcal, 0));
  const totalWater = shown.reduce((s, d) => s + d.waterMl, 0);
  const waterDays = shown.filter((d) => d.waterMl > 0).length;

  return (
    <View style={{ gap: 13 }}>
      {/* Calories — bars ↔ curve */}
      <TrendCard
        title={t("trends.calories")}
        extra={
          <Pressable
            accessibilityRole="button"
            onPress={() => setCalCurve((c) => !c)}
            style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surface }}
          >
            <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.accent}>
              {calCurve ? t("trends.showBars") : t("trends.showCurve")}
            </Text>
          </Pressable>
        }
        count={calCurve ? undefined : days.length}
        readout={(i) => ({ value: `${round(days[i]!.consumedKcal)}`, detail: `${t("common.kcal")} · ${dateLabel(days[i]!.date)}` })}
        dragHint={t("trends.dragChart")}
        footer={`${t("common.estimates")} · ${avgKcal} ${t("trends.avgPerDay")}`}
      >
        {(active) =>
          calCurve ? (
            <View style={{ height: CURVE_H, borderRadius: 16, overflow: "hidden", backgroundColor: "#FBF3E6" }}>
              <Svg width="100%" height={CURVE_H} viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} preserveAspectRatio="none">
                <Path
                  d={linePath(days.map((d) => d.consumedKcal), CURVE_W, CURVE_H)}
                  fill="none"
                  stroke={colors.macro.carbs}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          ) : (
            <DayBars days={days} value={(b) => b.consumedKcal} color={() => colors.macro.fat} active={active} topLabel={(b) => (b.consumedKcal > 0 ? String(round(b.consumedKcal)) : "")} />
          )
        }
      </TrendCard>

      {/* Consumed vs spent */}
      <TrendCard
        title={t("trends.consumedVsSpent")}
        unitNote={`${t("common.kcal")} · ${t("common.estimates")}`}
        count={days.length}
        readout={(i) => ({ value: `${round(days[i]!.consumedKcal)} / ${round(days[i]!.spentKcal)}`, detail: dateLabel(days[i]!.date) })}
        dragHint={t("trends.dragChart")}
        footer={totalSpent === 0 ? t("trends.spentEmpty") : `${totalSpent} ${t("trends.spentTotal")}`}
      >
        {(active) => (
          <View style={{ gap: 10 }}>
            <PairBars days={days} active={active} />
            <Legend items={[[t("trends.consumed"), colors.macro.fat], [t("trends.spent"), colors.macro.protein]]} />
          </View>
        )}
      </TrendCard>

      {/* Macro balance */}
      <TrendCard
        title={t("trends.macroBalance")}
        unitNote={t("trends.shareOfKcal")}
        count={days.length}
        readout={(i) => ({ value: `${round(days[i]!.protein)}·${round(days[i]!.carbs)}·${round(days[i]!.fat)}`, detail: `${t("trends.pcfG")} · ${dateLabel(days[i]!.date)}` })}
        dragHint={t("trends.dragChart")}
      >
        {(active) => (
          <View style={{ gap: 10 }}>
            <MacroBars days={days} active={active} />
            <Legend items={[[t("home.protein"), colors.macro.protein], [t("home.carbs"), colors.macro.carbs], [t("home.fat"), colors.macro.fat]]} />
          </View>
        )}
      </TrendCard>

      {/* Water */}
      <TrendCard
        title={t("trends.water")}
        unitNote={waterDays > 0 ? formatVolume(round(totalWater / waterDays), units, t) + " " + t("trends.avgSuffix") : ""}
        count={days.length}
        readout={(i) => ({ value: formatVolume(days[i]!.waterMl, units, t), detail: dateLabel(days[i]!.date) })}
        dragHint={t("trends.dragChart")}
      >
        {(active) => (
          <DayBars days={days} value={(b) => b.waterMl} color={() => colors.macro.protein} active={active} />
        )}
      </TrendCard>

      {/* Meal times */}
      <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: "rgba(120,100,75,0.06)", gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("trends.mealTimes")}
          </Text>
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
            {t("trends.whenLogged")}
          </Text>
        </View>
        <View style={{ height: Math.max(70, days.length * 3.5), backgroundColor: colors.sheet, borderRadius: 14, position: "relative", overflow: "hidden" }}>
          {dots.map((d) => (
            <View key={d.key} style={{ position: "absolute", left: `${d.xPct}%`, top: `${d.yPct}%`, width: 7, height: 7, borderRadius: 3.5, marginLeft: -3.5, marginTop: -3.5, backgroundColor: colors.accent, opacity: d.opacity }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {["6:00", "12:00", "18:00", "24:00"].map((l) => (
            <Text key={l} variant="caption" style={{ fontSize: 9.5 }} color={colors.labelMuted}>
              {l}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
