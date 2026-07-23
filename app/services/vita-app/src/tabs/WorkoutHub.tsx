/**
 * Workout hub (APP-091) — the destination of the Workout nav dot. A read-only,
 * program-centric view: pick a program day (chips), see its muscle map, its
 * exercises, and the 30-day history. Composition over the extracted MuscleMapCard
 * / HistoryCard (shared byte-for-byte with the workout detail screen) plus the
 * shared plan store (selected day + day skips). No new data, no new contract.
 *
 * Skips are display-only here — they're toggled in Today's Workout tab and this
 * screen just reflects them honestly (dimmed row + OFF TODAY, kcal recomputed).
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { Muscle } from "../api";
import { getCachedProgram, getDaySkips, getSelectedDay, setSelectedDay } from "../db/plan";
import { useLogVersion } from "../db/notify";
import { dayWorkoutKcal } from "../plan/setup";
import { exercisesForMuscle } from "../workout/muscleExercises";
import { MuscleMapCard } from "../workout/MuscleMapCard";
import { HistoryCard } from "../workout/HistoryCard";
import { useWorkoutHistory } from "../workout/useWorkoutHistory";
import { WorkoutPreviewSheet } from "../workout/PreviewSheet";
import { Card, Text, colors, fonts, spacing, tint, useAccent } from "../ui";

/** sets×reps · load — compact read-only exercise line. */
function exerciseLabel(sets?: number, reps?: number, loadKg?: number): string {
  const sr = sets != null && reps != null ? `${sets} × ${reps}` : sets != null ? `${sets}` : reps != null ? `${reps}` : "";
  return loadKg != null ? `${sr}${sr ? " · " : ""}${loadKg} kg` : sr;
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

/** Dashed empty card — no program yet. Import lives in Today's plan (§6.3, shared copy). */
function WorkoutEmpty() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View
      style={{
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.dashedBorder,
        borderRadius: 24,
        paddingVertical: 26,
        paddingHorizontal: 20,
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 18 }} color="#5F7A61">⟐</Text>
      </View>
      <Text variant="label" style={{ fontSize: 15.5, textAlign: "center" }}>
        {t("today.wkNoneTitle")}
      </Text>
      <Text variant="caption" style={{ fontSize: 12.5, textAlign: "center", maxWidth: 250 }} color={colors.muted}>
        {t("today.wkNoneBody")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace("/today")}
        style={{ marginTop: 4, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 15, backgroundColor: tint(colors.accent, 10) }}
      >
        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>
          {t("today.importPdf")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function WorkoutHub() {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  const { history, preview, previewSrc, openRow, closePreview } = useWorkoutHistory();

  const program = useMemo(() => getCachedProgram(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = program?.days ?? [];
  const skips = useMemo(() => getDaySkips(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selected day chip persists (kv); fall back to the first day.
  const storedDay = getSelectedDay();
  const day = days.find((d) => d.name === storedDay) ?? days[0] ?? null;

  const exercises = day?.exercises ?? [];
  const daySkips = day ? (skips[day.name] ?? {}) : {};
  const total = exercises.length;
  const active = total - Object.keys(daySkips).length;
  const kcal = day ? dayWorkoutKcal(day, skips) : null;

  const hits = selectedMuscle ? exercisesForMuscle(exercises, selectedMuscle) : [];
  const hitIndexes = new Set(hits.map((h) => h.index));

  const pickDay = (name: string) => {
    setSelectedDay(name);
    setSelectedMuscle(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 150, gap: 13 }}
      >
        <Text variant="title" style={{ fontSize: 21, paddingHorizontal: 2 }}>
          {t("workoutHub.title")}
        </Text>

        {days.length === 0 ? (
          <WorkoutEmpty />
        ) : (
          <>
            {/* day chips (dark-active, §5.3) */}
            {days.length > 1 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {days.map((dd) => {
                  const on = dd.name === day?.name;
                  return (
                    <Pressable
                      key={dd.name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => pickDay(dd.name)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 15,
                        backgroundColor: on ? "#453E35" : colors.card,
                        borderWidth: 1,
                        borderColor: on ? "#453E35" : colors.border,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? "#F7F0E4" : "#6E6355"}>
                        {dd.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* summary */}
            {day && (
              <Card style={{ gap: 6 }}>
                {kcal != null && (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={{ fontFamily: fonts.extraLight, fontSize: 34, letterSpacing: -1 }}>~{kcal}</Text>
                    <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>{t("common.kcal")}</Text>
                  </View>
                )}
                <Text variant="label" style={{ fontSize: 15 }}>{day.name}</Text>
                <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
                  {t("today.exOf", { a: active, t: total })}
                </Text>
              </Card>
            )}

            {/* muscle map (shared card) */}
            <MuscleMapCard exercises={exercises} selected={selectedMuscle} onSelect={setSelectedMuscle} />

            {/* exercises — read-only rows, highlight on muscle select, OFF TODAY reflects Today's skips */}
            {exercises.length > 0 && (
              <Card style={{ paddingVertical: 14 }}>
                <View style={{ paddingBottom: 4 }}>
                  <SectionLabel>{t("workoutDetail.exercisesAsImported")}</SectionLabel>
                </View>
                {exercises.map((ex, i) => {
                  const skipped = !!daySkips[ex.name];
                  const dimmed = hitIndexes.size > 0 && !hitIndexes.has(i);
                  const lit = hitIndexes.has(i);
                  return (
                    <View
                      key={`${ex.name}-${i}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: lit ? 8 : 0,
                        marginHorizontal: lit ? -8 : 0,
                        borderRadius: 12,
                        backgroundColor: lit ? tint(accent, 9) : "transparent",
                        opacity: skipped ? 0.5 : dimmed ? 0.38 : 1,
                        borderBottomWidth: i === exercises.length - 1 ? 0 : 1,
                        borderBottomColor: "rgba(120,100,75,0.07)",
                      }}
                    >
                      <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 12, width: 16 }} color={lit ? accent : colors.labelMuted}>
                        {i + 1}
                      </Text>
                      <Text
                        variant="label"
                        style={{ fontSize: 14, flex: 1, fontFamily: lit ? fonts.bold : undefined, textDecorationLine: skipped ? "line-through" : "none" }}
                        color={skipped ? colors.labelMuted : colors.ink}
                      >
                        {ex.name}
                      </Text>
                      {skipped ? (
                        <View style={{ backgroundColor: colors.estimateBg, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 }}>
                          <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase" }} color={colors.estimateInk}>
                            {t("today.offToday")}
                          </Text>
                        </View>
                      ) : (
                        <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                          {exerciseLabel(ex.sets, ex.reps, ex.loadKg)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </Card>
            )}

            {/* 30-day history (shared card) */}
            <HistoryCard history={history} onOpen={openRow} />

            <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
              {t("today.wkFooter")}
            </Text>
          </>
        )}
        {/* spacing tail so the last card clears the pill */}
        <View style={{ height: spacing.sm }} />
      </ScrollView>
      <WorkoutPreviewSheet entry={preview} onClose={closePreview} sourceOverride={previewSrc} />
    </View>
  );
}
