/**
 * APP-098 — "Your day": the v4 timeline (README §3 Timeline, §4 screen 2; prototype
 * lines 520–712).
 *
 * The nodes are the PLAN's meals (gated `domains.meals`) plus the training day at its
 * 18:00 slot (gated `domains.move`), chronological. A node's state comes from the day
 * record (APP-094) — `planned` is the ABSENCE of a record, so the timeline reads the
 * plan and the record together and never stores a "planned" row anywhere.
 *
 * The final node is the day's own: **Close the day** in the evening (evening = the
 * `recapStartHour` setting, so the card and the day-close notification agree), which
 * records only the meals that are already DUE, and then the dark **Day closed** recap
 * with Reopen. Every recording action leaves an undo in the toast.
 *
 * This file owns the rail + the row chrome + the pure node list; the four cards are
 * their own files.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { PlanMeal, ProgramDay } from "../../api/client";
import { applyClose, getDayRecord, isDayClosed, recordWorkout, setDayClosed } from "../../db/dayRecord";
import { useDomains } from "../../db/domains";
import { deleteEntry } from "../../db/entries";
import { logChanged, useLogVersion } from "../../db/notify";
import { getCachedPlan, getCachedProgram, getSelectedDay } from "../../db/plan";
import { recapStartHour } from "../../db/settings";
import { planDailyTotals } from "../../plan/compute";
import { Text, colors, dayState, fonts, motion, typeScale, useAccent } from "../../ui";
import { showToast } from "../../ui/toast";
import { closeDay } from "../close";
import { ZERO, dayKey, dayMeals, mealRecord, minutesOf, workoutEntryId, type DayRecord, type MealState } from "../record";
import { useSelectedDate } from "../selection";
import { isDue, mealState, pendingMeals, recapLine } from "../state";
import { CloseDayCard } from "./CloseDayCard";
import { MealNode } from "./MealNode";
import { RecapNode } from "./RecapNode";
import { WorkoutNode, buildWorkoutRecord, workoutState } from "./WorkoutNode";

/** The workout always sits at 18:00 (prototype `tm:1080`, rail label "18:00"). */
export const WORKOUT_MINUTES = 18 * 60;
export const WORKOUT_TIME = "18:00";

export type TimelineNode =
  | { kind: "meal"; key: string; minutes: number; time: string; state: MealState; due: boolean; delayMs: number; meal: PlanMeal }
  | { kind: "workout"; key: string; minutes: number; time: string; state: MealState; due: boolean; delayMs: number; program: ProgramDay };

/**
 * The chronological node list. Meals stagger at `i × 45ms` **in plan order** and the
 * workout at a flat 160ms (prototype), then the two are merged by slot time — so the
 * fade-in order is the plan's, not the render order's.
 */
export function timelineNodes(args: {
  day: DayRecord;
  meals: PlanMeal[];
  program: ProgramDay | null;
  domains: { meals: boolean; move: boolean };
  nowMin: number;
}): TimelineNode[] {
  const { day, meals, program, domains, nowMin } = args;
  const nodes: TimelineNode[] = [];
  if (domains.meals) {
    meals
      .filter((m) => m.id != null)
      .map((m) => ({ m, minutes: minutesOf(m.time) }))
      .sort((a, b) => a.minutes - b.minutes)
      .forEach(({ m, minutes }, i) => {
        nodes.push({
          kind: "meal",
          key: `meal:${m.id}`,
          minutes,
          time: m.time ?? "",
          state: mealState(day, m),
          due: isDue({ minutes }, nowMin),
          delayMs: i * motion.vtFade.timelineStaggerMs,
          meal: m,
        });
      });
  }
  if (domains.move && program) {
    nodes.push({
      kind: "workout",
      key: "workout",
      minutes: WORKOUT_MINUTES,
      time: WORKOUT_TIME,
      state: workoutState(day),
      due: WORKOUT_MINUTES <= nowMin,
      delayMs: 160,
      program,
    });
  }
  return nodes.sort((a, b) => a.minutes - b.minutes);
}

/** Rail dot colour — README §3: done · adjusted · skipped · due-now (accent) · future. */
export const dotColor = (state: MealState, due: boolean, accent: string): string =>
  state === "done"
    ? dayState.done
    : state === "adjusted"
      ? dayState.adjusted
      : state === "skipped"
        ? dayState.skipped
        : due
          ? accent
          : dayState.future;

/**
 * One timeline row: the 40px rail (time · 9px dot · 2px connector) and the card.
 * The last node drops the connector — the line must not dangle past the day.
 */
export function TimelineRow({
  time,
  timeColor = colors.faint,
  dot,
  connector = true,
  children,
}: {
  time: string;
  timeColor?: string;
  dot: string;
  connector?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 11 }}>
      <View style={{ width: dayState.railWidth, alignItems: "center", gap: 5, paddingTop: 12 }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: typeScale.railTime, letterSpacing: 0.2 }} color={timeColor}>
          {time}
        </Text>
        <View style={{ width: dayState.dotSize, height: dayState.dotSize, borderRadius: dayState.dotSize / 2, backgroundColor: dot }} />
        {connector ? <View style={{ width: dayState.railLineWidth, flex: 1, borderRadius: 1, backgroundColor: colors.rail }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>{children}</View>
    </View>
  );
}

/** vtFade: 8px rise + fade, `both`, staggered per node. */
const enterAt = (delayMs: number) =>
  FadeInDown.duration(motion.vtFade.longMs)
    .delay(delayMs)
    .withInitialValues({ transform: [{ translateY: motion.vtFade.offsetY }] });

export function Timeline() {
  const { t } = useTranslation();
  const accent = useAccent();
  const domains = useDomains();
  const version = useLogVersion();
  const date = useSelectedDate();
  // One card open at a time (prototype keeps meal/workout independent; one key is
  // less state and reads the same on a phone-width column).
  const [open, setOpen] = useState<string | null>(null);
  // "Leave open" is a dismissal, not a record — session-only, exactly like the prototype.
  const [dismissed, setDismissed] = useState(false);

  const d = useMemo(() => {
    const now = new Date();
    const isToday = date === dayKey(now);
    const day = getDayRecord(date);
    const plan = getCachedPlan();
    const program = getCachedProgram();
    const selected = getSelectedDay();
    return {
      day,
      meals: plan?.meals ?? [],
      // The portion modal's live card: the plan's day under today's portion overrides.
      dailyTotals: plan ? planDailyTotals(plan, day.overlay.qty) : { ...ZERO },
      programDay: program?.days.find((x) => x.name === selected) ?? program?.days[0] ?? null,
      programDays: program?.days ?? [],
      // A past day is over: everything on it is due.
      nowMin: isToday ? now.getHours() * 60 + now.getMinutes() : 24 * 60,
      isToday,
      evening: now.getHours() >= recapStartHour(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, date]);

  const nodes = timelineNodes({ day: d.day, meals: d.meals, program: d.programDay, domains, nowMin: d.nowMin });
  const closed = isDayClosed(date);
  const showClose = d.isToday && d.evening && !closed && !dismissed && nodes.length > 0;
  const showRecap = closed;

  if (!domains.tlOn) return null;

  /** One tap: every DUE meal (and the due training day) is recorded as planned. */
  const onCloseDay = () => {
    const result = closeDay(d.day, d.meals, d.nowMin);
    applyClose(result);
    const wk =
      domains.move && d.programDay && WORKOUT_MINUTES <= d.nowMin && workoutState(d.day) === "planned"
        ? buildWorkoutRecord(date, d.programDay, d.programDay.exercises, "done")
        : null;
    if (wk) recordWorkout(wk);
    setDayClosed(date, true);
    showToast(t("timeline.close.toast"), {
      undo: () => {
        for (const r of result.written) deleteEntry(r.entryId);
        if (wk) deleteEntry(workoutEntryId(date));
        setDayClosed(date, false);
      },
    });
  };

  return (
    <View style={{ gap: 0 }}>
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1 && !showClose && !showRecap;
        const rec = n.kind === "meal" && n.meal.id != null ? mealRecord(d.day, n.meal.id) : undefined;
        return (
          <Animated.View key={n.key} entering={enterAt(n.delayMs)}>
            <TimelineRow time={n.time} dot={dotColor(n.state, n.due, accent)} connector={!last}>
              {n.kind === "meal" ? (
                <MealNode
                  date={date}
                  meal={n.meal}
                  state={n.state}
                  due={n.due}
                  overlay={d.day.overlay}
                  {...(rec ? { record: rec } : {})}
                  dailyTotals={d.dailyTotals}
                  expanded={open === n.key}
                  onToggle={() => setOpen(open === n.key ? null : n.key)}
                />
              ) : (
                <WorkoutNode
                  date={date}
                  day={d.day}
                  program={n.program}
                  programDays={d.programDays}
                  state={n.state}
                  due={n.due}
                  expanded={open === n.key}
                  onToggle={() => setOpen(open === n.key ? null : n.key)}
                />
              )}
            </TimelineRow>
          </Animated.View>
        );
      })}

      {showClose ? (
        <TimelineRow time={t("timeline.close.now")} timeColor={accent} dot={accent} connector={false}>
          <CloseDayCard
            pending={pendingMeals(d.day, dayMeals(d.meals), d.nowMin)}
            onCloseDay={onCloseDay}
            onLeaveOpen={() => setDismissed(true)}
          />
        </TimelineRow>
      ) : null}

      {showRecap ? (
        <TimelineRow time={t("timeline.close.now")} dot={colors.dark.bg} connector={false}>
          <RecapNode
            line={recapLine(d.day, domains)}
            onReopen={() => {
              setDayClosed(date, false);
              setDismissed(true); // reopening must not bounce the Close card straight back
              showToast(t("timeline.recap.reopenedToast"));
            }}
          />
        </TimelineRow>
      ) : null}

      <Text style={{ fontSize: typeScale.micro, textAlign: "center", paddingTop: 6, paddingHorizontal: 20 }} color={colors.faint}>
        {t("timeline.footer")}
      </Text>
    </View>
  );
}
