/**
 * APP-098 — the training node of "Your day" (prototype lines 585–671). It sits at the
 * fixed 18:00 slot and is gated by `domains.move`.
 *
 * Collapsed it mirrors a meal: name · state tag · "N exercises" (or "M of N") · ~kcal.
 * Expanded it adds the program chips and the **Exercises | Muscles** segmented view —
 * the muscle half reuses APP-101's body map and chip model, so the same silhouette the
 * Library and Trends draw is the one that appears here.
 *
 * Ticking exercises is the honest record: the entry stores exactly the exercises that
 * were done, and the state lifts to `adjusted` unless every one is ticked. The footer
 * says the rest out loud — "Programs live in the Library — this only records today."
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { Exercise, ProgramDay } from "../../api/client";
import { recordWorkout } from "../../db/dayRecord";
import { deleteEntry, entriesInRange } from "../../db/entries";
import { logChanged } from "../../db/notify";
import { setSelectedDay } from "../../db/plan";
import { BodyMap } from "../../muscle/BodyMap";
import { MuscleSheet } from "../../muscle/MuscleSheet";
import { intensitiesOf, programChips, sessionsFromEntries, type MuscleKey } from "../../muscle/muscleData";
import { exerciseMeasure } from "../../workout/exerciseLabel";
import { Chevron, PressScale, Text, colors, fonts, hit, mixOklab, radii, shadowCard, shadowCta, useAccent } from "../../ui";
import { showToast } from "../../ui/toast";
import { atMinutes, dayKey, workoutEntryId, type DayRecord, type MealState, type RecordedState, type WorkoutRecord } from "../record";
import { setSelectedDate } from "../selection";


const WORKOUT_MINUTES = 18 * 60;

/** `YYYY-MM-DD` → LOCAL midnight (`new Date("2026-08-19")` is UTC and drifts a day). */
const parseDay = (date: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};

/** The training day's state today — no record ⇒ `planned`, exactly like a meal. */
export const workoutState = (day: DayRecord): MealState => day.workout?.state ?? "planned";

/**
 * A workout record for `date`. Self-describing (APP-094 R7): it stores the exercises
 * that were actually done, so a later program edit can never rewrite history.
 */
export const buildWorkoutRecord = (
  date: string,
  program: ProgramDay,
  exercises: Exercise[],
  state: RecordedState,
): WorkoutRecord => ({
  entryId: workoutEntryId(date),
  planDay: program.name,
  title: program.name,
  state,
  exercises,
  at: atMinutes(date, WORKOUT_MINUTES),
});

function Dumbbell({ color }: { color: string }) {
  return (
    <Svg width={16} height={16}>
      <Path d="M1.5 8 h2 M12.5 8 h2 M4.5 5 v6 M11.5 5 v6 M4.5 8 h7" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function Tick({ color }: { color: string }) {
  return (
    <Svg width={11} height={11}>
      <Path d="M2.2 5.8 l2.4 2.4 L8.8 3" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}


export function WorkoutNode({
  date,
  day,
  program,
  programDays,
  state,
  due,
  expanded,
  onToggle,
}: {
  date: string;
  day: DayRecord;
  program: ProgramDay;
  programDays: ProgramDay[];
  state: MealState;
  due: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [view, setView] = useState<"ex" | "mu">("ex");
  const [muscle, setMuscle] = useState<MuscleKey | null>(null);

  const all = program.exercises;
  const record = day.workout;
  // No record ⇒ nothing ticked yet; a record ⇒ exactly what it says was done.
  const doneNames = new Set((record?.exercises ?? []).map((e) => e.name));
  const checked = state === "planned" ? [] : all.filter((e) => doneNames.has(e.name));
  const count = checked.length;

  const tag =
    state === "done"
      ? { bg: colors.green.bg, ink: colors.green.ink }
      : state === "adjusted"
        ? { bg: colors.amber.bg, ink: colors.amber.ink }
        : null;

  const kcal =
    program.kcalEstimate == null
      ? null
      : state === "planned"
        ? Math.round(program.kcalEstimate)
        : Math.round((program.kcalEstimate * count) / (all.length || 1));

  const restore = () => {
    if (record) recordWorkout(record);
    else {
      deleteEntry(workoutEntryId(date));
      logChanged();
    }
  };

  // Unticking the LAST exercise is not "adjusted with nothing in it" — it is the day
  // you didn't train, so it records `skipped` (the state whose copy already exists in
  // PastDay/recapLine and which no other v4 surface could write). That also stops
  // Trends counting an emptied session as a workout.
  const commit = (exercises: Exercise[], toast: string) => {
    const state: RecordedState = exercises.length === 0 ? "skipped" : exercises.length === all.length ? "done" : "adjusted";
    recordWorkout(buildWorkoutRecord(date, program, exercises, state));
    showToast(toast, { undo: restore });
  };

  const confirm = () => commit(all, t("timeline.workout.confirmedToast", { name: program.name }));

  const toggleExercise = (ex: Exercise) => {
    const next = doneNames.has(ex.name) && state !== "planned" ? checked.filter((e) => e.name !== ex.name) : [...checked, ex];
    // Keep the program's own order — the record reads as the session, not as tap order.
    const ordered = all.filter((e) => next.some((n) => n.name === e.name));
    commit(ordered, t("timeline.workout.adjustedToast", { name: program.name, n: ordered.length, total: all.length }));
  };

  // The map + chips describe the SELECTED program day (APP-101's model, same as Trends).
  const intensities = intensitiesOf({
    planDay: program.name,
    title: program.name,
    exercises: all,
    at: atMinutes(date, WORKOUT_MINUTES),
  });
  const chips = programChips(intensities);

  // The muscle sheet wants real sessions: the last week of recorded workouts.
  const dayStart = parseDay(date);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const sessions = sessionsFromEntries(entriesInRange("workout", weekStart, dayEnd));

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.card,
        borderWidth: state === "planned" && due ? 1.5 : 1,
        borderColor: state === "planned" && due ? mixOklab(accent, 32, colors.card) : colors.borderFaint,
        ...shadowCard,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={program.name}
        onPress={onToggle}
        style={{ paddingVertical: 13, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.green.bg, alignItems: "center", justifyContent: "center" }}>
          <Dumbbell color={colors.green.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.inkHeading}>
              {program.name}
            </Text>
            {tag ? (
              <View style={{ backgroundColor: tag.bg, borderRadius: radii.chipTight, paddingVertical: 2, paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase" }} color={tag.ink}>
                  {t(`timeline.tag.${state === "done" ? "done" : "adjusted"}`)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, marginTop: 1 }} color={colors.faint} numberOfLines={1}>
            {(state === "planned"
              ? t("timeline.workout.exercisesPlanned", { n: all.length })
              : t("timeline.workout.exercisesDone", { n: count, total: all.length })) +
              (state === "planned" && !due ? t("timeline.laterToday") : "")}
          </Text>
        </View>
        {kcal != null ? (
          <View style={{ backgroundColor: colors.green.bg, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5 }} color={colors.green.ink}>
              {t("timeline.kcal", { n: kcal.toLocaleString("en-US") })}
            </Text>
          </View>
        ) : null}
        <Chevron open={expanded} flip color={colors.muted} />
      </Pressable>

      {state === "planned" && due ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 13 }}>
          <PressScale
            accessibilityRole="button"
            onPress={confirm}
            style={{
              flex: 1.4,
              height: hit.button,
              borderRadius: hit.button / 2,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
              ...shadowCta(accent),
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color="#FFF9F1">
              {t("timeline.workout.confirm")}
            </Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            onPress={() => {
              if (!expanded) onToggle();
            }}
            style={{
              flex: 1,
              height: hit.button,
              borderRadius: hit.button / 2,
              borderWidth: 1.5,
              borderColor: colors.borderControlStrong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkMuted}>
              {t("timeline.meal.adjust")}
            </Text>
          </PressScale>
        </Animated.View>
      ) : null}

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            borderStyle: "dashed",
            marginHorizontal: 16,
            paddingTop: 11,
            paddingBottom: 13,
            gap: 10,
          }}
        >
          {programDays.length > 1 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {programDays.map((d) => {
                const on = d.name === program.name;
                return (
                  <PressScale
                    key={d.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setSelectedDay(d.name);
                      logChanged();
                    }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 15,
                      borderWidth: 1.5,
                      borderColor: on ? colors.dark.bg : colors.borderControl,
                      backgroundColor: on ? colors.dark.bg : colors.card,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.dark.ink : colors.inkMuted}>
                      {d.name}
                    </Text>
                  </PressScale>
                );
              })}
            </View>
          ) : null}

          {/* Exercises | Muscles — track #F0EDE2 r14 pad 3, active #453E35 / #F7F0E4 */}
          <View style={{ flexDirection: "row", backgroundColor: colors.sandChip, borderRadius: 14, padding: 3, gap: 2 }}>
            {(["ex", "mu"] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: view === v }}
                onPress={() => setView(v)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  paddingHorizontal: 4,
                  borderRadius: 11,
                  alignItems: "center",
                  backgroundColor: view === v ? colors.dark.bg : "transparent",
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={view === v ? colors.dark.ink : colors.inkMuted}>
                  {t(v === "ex" ? "timeline.workout.viewExercises" : "timeline.workout.viewMuscles")}
                </Text>
              </Pressable>
            ))}
          </View>

          {view === "ex" ? (
            <View>
              {all.map((ex, i) => {
                const on = state !== "planned" && doneNames.has(ex.name);
                return (
                  <Pressable
                    key={`${ex.name}-${i}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={ex.name}
                    onPress={() => toggleExercise(ex)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 1.5,
                        borderColor: on ? colors.green.fill : colors.borderControlStrong,
                        backgroundColor: on ? colors.green.bg : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on ? <Tick color={colors.green.ink} /> : null}
                    </View>
                    <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 13.5 }} color={on ? colors.inkHeading : colors.muted}>
                      {ex.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.faint}>
                      {exerciseMeasure(ex)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: 10 }}>
              <BodyMap intensities={intensities} maxWidth={250} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {chips.map((c) => {
                  const primary = c.tier === "primary";
                  return (
                    <PressScale
                      key={c.key}
                      accessibilityRole="button"
                      onPress={() => setMuscle(c.key)}
                      scale={0.94}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        borderRadius: 11,
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        backgroundColor: primary ? mixOklab(accent, 16, colors.card) : colors.sandChip,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={primary ? accent : colors.muted}>
                        {t(`muscle.name.${c.key}`)}
                      </Text>
                      <Text
                        style={{ fontFamily: fonts.semiBold, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.65 }}
                        color={primary ? accent : colors.muted}
                      >
                        {t(`muscle.tier.${c.tier}`)}
                      </Text>
                    </PressScale>
                  );
                })}
              </View>
            </Animated.View>
          )}

          <Text style={{ fontSize: 10.5 }} color={colors.faint}>
            {t("timeline.workout.footer")}
          </Text>
        </Animated.View>
      ) : null}

      <MuscleSheet
        muscle={muscle}
        sessions={sessions}
        range="week"
        onClose={() => setMuscle(null)}
        onOpenDay={(offset) => {
          const d = parseDay(date);
          d.setDate(d.getDate() - offset);
          setSelectedDate(dayKey(d));
          setMuscle(null);
        }}
      />
    </View>
  );
}
