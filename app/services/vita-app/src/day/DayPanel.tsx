/**
 * The Day panel (APP-097): scenic header + parallax + the Overview zone.
 *
 * Three things the shell depends on and this file must keep:
 *  1. the scroll padding `88px 20px 150px` (the panel tabs float at top 48),
 *  2. `<SwipeHint />` right under the header — it retires itself on the first swipe,
 *  3. the panel owns its own vertical scroll; the shell only pans horizontally.
 *
 * **The scroll position is a shared value, never React state** — `useAnimatedScrollHandler`
 * writes it on the UI thread and `ScenicHeader` reads it in a worklet, so the parallax
 * costs zero re-renders per frame (the prototype's 1px `setState` is not ported; plan risk R2).
 *
 * The "Your day" timeline itself is APP-098's; this file renders its zone label and
 * leaves the mount point marked below.
 */
import { useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import type { MacroTotals } from "../api/client";
import { entriesForDay } from "../db/entries";
import { listHabits } from "../db/habits";
import { getCachedPlan } from "../db/plan";
import { getDayRecord } from "../db/dayRecord";
import { useDomains } from "../db/domains";
import { useLogVersion } from "../db/notify";
import { getSettings } from "../db/settings";
import { planDailyTotals } from "../plan/compute";
import { SwipeHint } from "../nav/PanelTabs";
import { Text, colors, fonts, letterSpacing, typeScale, useSceneName } from "../ui";
import type { MacroMeal } from "./overview/MacrosSheet";
import { ScenicHeader } from "./ScenicHeader";
import { HabitsCard } from "./overview/HabitsCard";
import { MacrosCard } from "./overview/MacrosCard";
import { WaterCard } from "./overview/WaterCard";
import { WeightCard } from "./overview/WeightCard";
import { dayCounters } from "./state";
import { ZERO, dayKey, dayMeals } from "./record";
import { DayDock } from "./dock/DayDock";
import { PastDay } from "./PastDay";
import { useSelectedDate } from "./selection";
import { Timeline } from "./timeline/Timeline";
import { latestWeight } from "./weight";

/** Zone heading — 11.5/800 uppercase ls 1.4 `#B7AB9C` (README §1). */
function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: fonts.extraBold,
        fontSize: typeScale.micro,
        letterSpacing: letterSpacing.zoneLabel,
        textTransform: "uppercase",
        paddingHorizontal: 4,
      }}
      color={colors.faint}
    >
      {children}
    </Text>
  );
}

const addMacros = (a: Required<MacroTotals>, b: Partial<MacroTotals> | undefined): Required<MacroTotals> => ({
  kcal: a.kcal + (b?.kcal ?? 0),
  proteinG: a.proteinG + (b?.proteinG ?? 0),
  carbsG: a.carbsG + (b?.carbsG ?? 0),
  fatG: a.fatG + (b?.fatG ?? 0),
});

export function DayPanel() {
  const { t } = useTranslation();
  const scene = useSceneName();
  const domains = useDomains();
  const version = useLogVersion(); // any local write re-reads everything below
  const selectedDate = useSelectedDate(); // APP-099: which day the dock is showing
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const data = useMemo(() => {
    const today = new Date();
    const day = getDayRecord();
    const plan = getCachedPlan();
    const counters = dayCounters(day, plan ? dayMeals(plan.meals) : []);
    const recorded = day.meals.reduce((acc, m) => addMacros(acc, m.totals), { ...ZERO });
    const macroMeals: MacroMeal[] = day.meals.map((m) => ({
      id: m.entryId,
      title: m.title,
      proteinG: m.totals.proteinG,
      carbsG: m.totals.carbsG,
      fatG: m.totals.fatG,
      kcal: m.totals.kcal,
      at: m.at,
    }));
    return {
      counters,
      recorded,
      macroMeals,
      planTotals: plan ? planDailyTotals(plan) : { ...ZERO },
      waterMl: day.waterMl,
      drinks: entriesForDay(today).filter((e) => e.type === "water"),
      habits: listHabits(),
      weight: latestWeight(today),
      today,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const { counters } = data;
  // "3 confirmed · 1 adjusted · 2 planned · 1 skipped" — counters, never a verdict.
  const countsLine = [
    t("day.hero.confirmed", { n: counters.done }),
    t("day.hero.adjusted", { n: counters.adjusted }),
    counters.planned + counters.skipped > 0
      ? [
          t("day.hero.planned", { n: counters.planned }),
          ...(counters.skipped ? [t("day.hero.skipped", { n: counters.skipped })] : []),
        ].join(" · ")
      : t("day.hero.noneLeft"),
  ].join(" · ");

  return (
    <Animated.ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: 88, paddingHorizontal: 20, paddingBottom: 150, gap: 13 }}
    >
      <ScenicHeader
        scene={scene}
        scrollY={scrollY}
        name={getSettings()?.name ?? t("day.you")}
        dateStr={data.today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        {...(domains.meals
          ? { hero: { kcal: Math.round(data.recorded.kcal), planKcal: Math.round(data.planTotals.kcal), countsLine } }
          : {})}
      />

      <SwipeHint />

      {/* APP-099 — day travel: label row + dock sit between the header and Overview,
          past-day cards right below (prototype lines 336–429). */}
      <DayDock />
      {selectedDate !== dayKey() && <PastDay date={selectedDate} />}

      {/* Today-only zones — the prototype's `todayOn` gate: a past day shows only
          the dock + status cards above. */}
      {selectedDate === dayKey() && (
        <>
          {domains.ovOn && <ZoneLabel>{t("day.zones.overview")}</ZoneLabel>}

          {domains.rowWM && (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingTop: 2 }}>
              {domains.water && <WaterCard totalMl={data.waterMl} drinks={data.drinks} />}
              {domains.meals && <MacrosCard recorded={data.recorded} plan={data.planTotals} meals={data.macroMeals} />}
            </View>
          )}

          {domains.habits && <HabitsCard habits={data.habits} today={data.today} />}

          {domains.weight && <WeightCard latest={data.weight} />}

          {domains.tlOn && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6, paddingBottom: 2 }}>
              <ZoneLabel>{t("day.zones.yourDay")}</ZoneLabel>
            </View>
          )}
          {/* APP-098 — "Your day" timeline. */}
          {domains.tlOn && <Timeline />}
        </>
      )}

    </Animated.ScrollView>
  );
}
