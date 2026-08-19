/**
 * APP-100 — the v4 Trends panel (README §4 screen 4, prototype lines 128–292).
 *
 * ONE flat scrolling list, no tabs: W/M/Y rail → record counter → Energy · Water ·
 * Movement bar charts → Muscle focus → Habits → Weight line. Everything on it is a
 * retrospective COUNTER: no goal line, no target, no streak, no verdict.
 *
 * Two rules the rest of the file exists to serve:
 *  1. **One pin across all four charts** (README §3). Pointer-down selects, a drag
 *     is transient, a tap pins — and switching range ALWAYS drops the pin, because a
 *     pinned index means a different day in a different range.
 *  2. **A year of rows never reaches JS** (plan risk R6). Every number comes from the
 *     `GROUP BY`/`COUNT(DISTINCT …)` queries in `series.ts`; the only per-day read is
 *     `getDayRecord` for the ONE day a week-pin is showing.
 *
 * Scroll padding is the prototype's `88px 20px 120px`; the whole surface pans back to
 * Day, so the chart scrub keeps winning its horizontal drag through
 * `blocksExternalGesture(tabsPagerRef)` in `scrub.tsx`.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Polyline } from "react-native-svg";
import { Text, colors, fonts, typeScale, useAccent } from "../ui";
import { mixOklab } from "../ui/oklab";
import { entriesInRange } from "../db/entries";
import { getCachedPlan } from "../db/plan";
import { getDayRecord } from "../db/dayRecord";
import { useDomains } from "../db/domains";
import { listHabits, type Habit } from "../db/habits";
import { useLogVersion } from "../db/notify";
import { dayKey, dayMeals } from "../day/record";
import { dayCounters, dayIsRetro, recapLine } from "../day/state";
import { setSelectedDate } from "../day/selection";
import { doneDayKeys } from "../habits/stats";
import { HabitDetailSheet } from "../habits/HabitDetailSheet";
import { BodyMap } from "../muscle/BodyMap";
import { MuscleSheet, type MuscleRange } from "../muscle/MuscleSheet";
import { muT, sessionsFromEntries, trendChips, type MuscleKey } from "../muscle/muscleData";
import { BarChart, CardFoot, CardHead, DetailCard, TrendsCard, TrendsReplayContext } from "./parts";
import { ScrubOverlay } from "./scrub";
import {
  RANGE_N,
  rangeEnd,
  readBuckets,
  recordedAverage,
  weightPoints,
  weightSeries,
  yearCounters,
  type TrendRange,
} from "./series";

const RANGES: TrendRange[] = ["W", "M", "Y"];
/** `muscle.range.*` already speaks "this week/month/year" — no second copy of it. */
const RANGE_WORD: Record<TrendRange, MuscleRange> = { W: "week", M: "month", Y: "year" };

const nf = (n: number) => Math.round(n).toLocaleString("en-US");
const initial = (d: Date, part: "weekday" | "month") =>
  d.toLocaleDateString(undefined, part === "weekday" ? { weekday: "short" } : { month: "short" }).charAt(0);

/** One pinned selection for the whole panel: which chart, which index. */
type Pin = { chart: string; index: number };

export function TrendsPanel() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const domains = useDomains();
  const version = useLogVersion();
  const [range, setRange] = useState<TrendRange>("W");
  const [pin, setPin] = useState<Pin | null>(null);
  const [muscle, setMuscle] = useState<MuscleKey | null>(null);
  const [habit, setHabit] = useState<Habit | null>(null);

  // Focus replay (APP-052): all three panels are pre-mounted, so the bars must re-grow
  // when Trends becomes the settled route. `usePathname` flips on settle, never mid-swipe.
  const focused = usePathname() === "/trends";
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (focused) setEpoch((e) => e + 1);
  }, [focused]);

  const data = useMemo(() => {
    const today = new Date();
    const buckets = readBuckets(range, today);
    const start = buckets[0]!.date;
    const end = rangeEnd(today);
    return {
      today,
      buckets,
      year: yearCounters(today),
      sessions: sessionsFromEntries(entriesInRange("workout", start, end)),
      habits: listHabits(),
      checkins: entriesInRange("checkin", start, end),
      weight: weightSeries(range, today),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, version]);

  const { buckets, today, year } = data;
  const n = buckets.length;
  const rangeWord = t(`muscle.range.${RANGE_WORD[range]}`);
  const pinOf = (chart: string) => (pin?.chart === chart ? pin.index : null);
  const scrub = (chart: string) => ({
    onScrub: (index: number) => setPin({ chart, index }),
    onEnd: () => setPin(null),
  });

  /** Travel the Day panel to a day `offset` days before today. */
  const openDay = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    setSelectedDate(dayKey(d));
    router.replace("/day");
  };

  // ── labels ────────────────────────────────────────────────────────────────
  // Axis labels on W and Y only — 30 columns leave no room for text (prototype `labsOn`).
  const axisLabels =
    range === "M" ? undefined : buckets.map((b) => initial(b.date, range === "Y" ? "month" : "weekday"));

  const bucketLabel = (i: number): string => {
    const d = buckets[i]!.date;
    if (range === "Y") return d.toLocaleDateString(undefined, { month: "short" });
    if (range === "W" && i === n - 1) return t("trends.today");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  };

  // ── detail lines ──────────────────────────────────────────────────────────
  /** A week pin opens that ONE day's record — the only per-day read on this screen. */
  function dayLines(index: number): string[] {
    const offset = n - 1 - index;
    const day = getDayRecord(buckets[index]!.key);
    if (offset === 0) {
      const plan = getCachedPlan();
      const c = dayCounters(day, plan ? dayMeals(plan.meals) : []);
      const out: string[] = [];
      if (domains.meals) out.push(t("trends.detail.todayMeals", { done: c.done, adjusted: c.adjusted, planned: c.planned }));
      if (domains.water) out.push(t("trends.detail.todayWater", { v: nf(day.waterMl) }));
      // The workout phrasing already exists in recapLine — ask it for just that bit.
      const move = domains.move ? recapLine(day, { meals: false, water: false, move: true }) : "";
      if (move) out.push(move);
      return out;
    }
    if (dayIsRetro(day)) return [t("trends.detail.retro")];
    const line = recapLine(day, domains);
    return line ? line.split(" · ") : [t("trends.detail.none")];
  }

  /** A month/year pin describes the RANGE, not one day (the prototype's `else` branch). */
  function rangeLines(values: number[], fmt: (v: number) => string): string[] {
    const periods = buckets.filter((b) => b.recorded).length;
    // "lowest" reads the periods that carry a value — a zero bucket is an absence,
    // not a low. Falls back to the raw series when nothing was ever recorded.
    const lows = values.some((v) => v > 0) ? values.filter((v) => v > 0) : values;
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));
    return [
      t("trends.detail.avg", { v: fmt(avg) }),
      t("trends.detail.highLow", { hi: fmt(Math.max(...values)), lo: fmt(Math.min(...lows)) }),
      t("trends.detail.periods", { n: periods, m: values.length }),
    ];
  }

  /** One chart card: head → bars → (pinned) detail → caption. */
  function chart(id: string, label: string, values: number[], color: string, fmt: (v: number) => string, note: string, footer: string) {
    const i = pinOf(id);
    return (
      <TrendsCard>
        <CardHead label={label} note={note} />
        <BarChart
          values={values}
          color={color}
          labels={axisLabels}
          pinned={i}
          {...(i != null ? { tip: `${bucketLabel(i)} · ${fmt(values[i]!)}` } : {})}
          {...scrub(id)}
          accessibilityLabel={label}
        />
        {i != null && (
          <DetailCard
            title={`${bucketLabel(i)} · ${fmt(values[i]!)}`}
            lines={range === "W" ? dayLines(i) : rangeLines(values, fmt)}
            openLabel={t("trends.openDay")}
            {...(range === "W" && n - 1 - i > 0 ? { onOpenDay: () => openDay(n - 1 - i) } : {})}
          />
        )}
        <CardFoot>{footer}</CardFoot>
      </TrendsCard>
    );
  }

  // ── series ────────────────────────────────────────────────────────────────
  const recorded = buckets.map((b) => b.recorded);
  const kcal = buckets.map((b) => b.kcal);
  const water = buckets.map((b) => b.waterMl);
  const moveKcal = buckets.map((b) => b.moveKcal);
  const workouts = buckets.map((b) => b.workouts);
  // Y counts sessions; W/M show the burn, unless nothing carries kcal — then a bar per
  // session beats a flat empty chart (a logged workout without kcal is still movement).
  const movementIsCount = range === "Y" || moveKcal.every((v) => v === 0);
  const movement = movementIsCount ? workouts : moveKcal;

  const kcalAvg = recordedAverage(kcal, recorded);
  const waterAvg = recordedAverage(water, recorded);
  const totalWorkouts = workouts.reduce((a, b) => a + b, 0);

  const fmtKcal = (v: number) => t("trends.kcalV", { v: nf(v) });
  const fmtMl = (v: number) => t("trends.mlV", { v: nf(v) });
  const fmtMove = (v: number) =>
    movementIsCount ? t("trends.workoutsV", { n: v }) : v > 0 ? t("trends.kcalApprox", { v: nf(v) }) : t("trends.rest");

  // ── muscle focus ──────────────────────────────────────────────────────────
  const intensities = useMemo(() => muT(data.sessions), [data.sessions]);
  const chips = useMemo(() => trendChips(data.sessions), [data.sessions]);
  const programLine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data.sessions) {
      const p = s.planDay ?? s.title;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const bits = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} ${c}×`);
    return bits.length ? `${bits.join(" · ")} ${rangeWord}` : "";
  }, [data.sessions, rangeWord]);

  // ── weight ────────────────────────────────────────────────────────────────
  const [wtWidth, setWtWidth] = useState(306);
  const wt = data.weight;
  const wtGeo = wt.length ? weightPoints(wt.map((p) => p.kg), wtWidth) : [];
  const wtPin = pinOf("wt");
  const wtDot = wtGeo.length ? wtGeo[wtPin ?? wtGeo.length - 1]! : null;
  const wtLo = wt.length ? Math.min(...wt.map((p) => p.kg)) : 0;
  const wtHi = wt.length ? Math.max(...wt.map((p) => p.kg)) : 0;

  const wtDetail = (): string => {
    const i = wtPin!;
    const p = wt[i]!;
    const prev = wt[i - 1];
    const delta = prev
      ? t("trends.weightDelta", { sign: p.kg - prev.kg >= 0 ? "+" : "−", v: Math.abs(p.kg - prev.kg).toFixed(1) })
      : t("trends.weightFirst");
    const when = p.date.toLocaleDateString(undefined, range === "Y" ? { month: "short" } : { weekday: "short", day: "numeric" });
    return `${p.kg.toFixed(1)} kg · ${when} · ${delta} · ${t("trends.weightSource")}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 120, gap: 13 }}
      >
        <TrendsReplayContext.Provider value={epoch}>
          <View style={{ paddingHorizontal: 2 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: typeScale.screenTitle }} color={colors.inkHeading}>
              {t("nav.panels.trends")}
            </Text>
            <Text style={{ fontSize: 13, marginTop: 1 }} color={colors.muted}>
              {t("trends.subtitle")}
            </Text>
          </View>

          {/* W/M/Y rail — switching range ALWAYS drops the pin. */}
          <View style={{ flexDirection: "row", backgroundColor: colors.sandChip, borderRadius: 18, padding: 3, gap: 2 }}>
            {RANGES.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: r === range }}
                onPress={() => {
                  setRange(r);
                  setPin(null);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  paddingHorizontal: 4,
                  borderRadius: 15,
                  alignItems: "center",
                  backgroundColor: r === range ? colors.dark.bg : "transparent",
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={r === range ? colors.dark.ink : colors.inkMuted}>
                  {t(`trends.range.${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Record counter — the denominator is the LIVE day-of-year, never 365. */}
          <TrendsCard gap={0}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
              <Text
                style={{ fontFamily: fonts.extraLight, fontSize: typeScale.heroCounter, letterSpacing: -1.5, lineHeight: 46 }}
                color={colors.inkHeading}
              >
                {year.recorded}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkHeading}>
                  {t("trends.record.of", { n: year.dayOfYear })}
                </Text>
                <Text style={{ fontSize: 11, marginTop: 2, lineHeight: 16 }} color={colors.faint}>
                  {t("trends.record.sub")}
                </Text>
              </View>
            </View>
          </TrendsCard>

          {domains.meals &&
            chart(
              "kcal",
              t("trends.energy"),
              kcal,
              colors.peach,
              fmtKcal,
              kcalAvg == null ? t("trends.noAvg") : t("trends.avgKcal", { v: nf(kcalAvg) }),
              t("trends.scrubHint"),
            )}

          {domains.water &&
            chart(
              "water",
              t("trends.water"),
              water,
              colors.green.fillSoft,
              fmtMl,
              range === "W"
                ? t("trends.litresIn", { v: (water.reduce((a, b) => a + b, 0) / 1000).toFixed(1), n: RANGE_N.W })
                : waterAvg == null
                  ? t("trends.noAvg")
                  : t("trends.avgMl", { v: nf(waterAvg) }),
              t("trends.waterCap", { n: year.waterDays }),
            )}

          {domains.move &&
            chart(
              "move",
              t("trends.movement"),
              movement,
              colors.green.fill,
              fmtMove,
              t("trends.workoutsIn", { n: totalWorkouts, when: rangeWord }),
              programLine || t("trends.scrubHint"),
            )}

          {/* Muscle focus — aggregate map + tappable chips → the per-muscle session sheet. */}
          {domains.move && (
            <TrendsCard gap={11}>
              <CardHead label={t("trends.muscleFocus")} note={programLine} />
              <BodyMap intensities={intensities} maxWidth={240} />
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {chips.map((c) => (
                  <Pressable
                    key={c.key}
                    accessibilityRole="button"
                    onPress={() => setMuscle(c.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      borderRadius: 11,
                      paddingVertical: 5,
                      paddingHorizontal: 10,
                      backgroundColor: c.tinted ? mixOklab(accent, 16, colors.card) : colors.sandChip,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={c.tinted ? accent : colors.muted}>
                      {t(`muscle.name.${c.key}`)}
                    </Text>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, opacity: 0.6 }} color={c.tinted ? accent : colors.muted}>
                      {t("muscle.sessionCount", { n: c.sessions })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <CardFoot>{t("trends.muscleCap")}</CardFoot>
            </TrendsCard>
          )}

          {/* Habit dot strips — OLDEST-LEFT like every other series on this screen. */}
          {domains.habits && data.habits.length > 0 && (
            <TrendsCard gap={12}>
              <CardHead label={t("trends.habitsLabel", { when: rangeWord })} />
              {data.habits.map((h) => {
                const done = doneDayKeys(data.checkins, h.id);
                const cells = buckets.map((b) =>
                  range === "Y" ? [...done].filter((k) => k.startsWith(b.key)).length : done.has(b.key) ? 1 : 0,
                );
                const total = cells.reduce((a, b) => a + b, 0);
                return (
                  <Pressable key={h.id} accessibilityRole="button" onPress={() => setHabit(h)} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, flexShrink: 1 }} color={colors.inkHeading}>
                        {h.name}
                      </Text>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.muted}>
                        {t("trends.habitCount", { n: total, when: rangeWord })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 3 }}>
                      {cells.map((c, i) => (
                        <View
                          key={i}
                          style={{
                            flex: 1,
                            height: range === "M" ? 7 : 14,
                            borderRadius: 4,
                            backgroundColor:
                              range === "Y"
                                ? mixOklab(colors.green.fill, Math.round((Math.min(c, 28) / 28) * 100), colors.chartEmpty)
                                : c
                                  ? colors.green.fill
                                  : colors.chartEmpty,
                          }}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })}
              <CardFoot>{t("trends.habitsCap")}</CardFoot>
            </TrendsCard>
          )}

          {/* Weight — readings joined as they were taken, nothing invented between them. */}
          {domains.weight && (
            <TrendsCard>
              <CardHead
                label={t("trends.weight")}
                {...(wt.length ? { note: t("trends.weightLatest", { v: wt[wt.length - 1]!.kg.toFixed(1) }) } : {})}
              />
              {wt.length === 0 ? (
                <Text style={{ fontSize: 12 }} color={colors.muted}>
                  {t("trends.weightNone")}
                </Text>
              ) : (
                <>
                  <View
                    style={{ position: "relative", paddingTop: 24 }}
                    onLayout={(e) => setWtWidth(Math.round(e.nativeEvent.layout.width))}
                  >
                    <Svg width={wtWidth} height={64}>
                      <Polyline
                        points={wtGeo.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                        fill="none"
                        stroke={colors.peach}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {wtDot && <Circle cx={wtDot.x} cy={wtDot.y} r={4.5} fill={accent} stroke={colors.card} strokeWidth={2} />}
                    </Svg>
                    <ScrubOverlay
                      count={wt.length}
                      snap="vertex"
                      {...scrub("wt")}
                      accessibilityLabel={t("trends.weight")}
                    />
                  </View>
                  {wtPin != null && (
                    <View style={{ backgroundColor: colors.sheet, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 }}>
                      <Text style={{ fontSize: 11.5, fontFamily: fonts.semiBold }} color={colors.inkMuted}>
                        {wtDetail()}
                      </Text>
                    </View>
                  )}
                </>
              )}
              {wt.length > 0 && (
                <CardFoot>{t("trends.weightCap", { note: t("trends.weightRange", { hi: wtHi.toFixed(1), lo: wtLo.toFixed(1) }) })}</CardFoot>
              )}
            </TrendsCard>
          )}
        </TrendsReplayContext.Provider>
      </ScrollView>

      <MuscleSheet
        muscle={muscle}
        sessions={data.sessions}
        range={RANGE_WORD[range]}
        onClose={() => setMuscle(null)}
        onOpenDay={openDay}
      />
      <HabitDetailSheet habit={habit} onClose={() => setHabit(null)} onOpenDay={openDay} />
    </View>
  );
}
