import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import type { Muscle, Units, WorkoutDetail } from "../../../src/api";
import { entriesInRange, getEntry, type LocalEntry } from "../../../src/db/entries";
import { WorkoutPreviewSheet } from "../../../src/workout/PreviewSheet";
import { exercisesForMuscle, overallRole } from "../../../src/workout/muscleExercises";
import { getSettings } from "../../../src/db/settings";
import {
  BackButton,
  BodyMap,
  Card,
  Chip,
  EstimateTag,
  Text,
  colors,
  entryPalette,
  fonts,
  spacing,
} from "../../../src/ui";

const KG_PER_LB = 0.453592;

function formatLoad(kg: number, units: Units, t: (k: string) => string): string {
  if (units === "imperial") return `${Math.round(kg / KG_PER_LB)} ${t("workoutDetail.lb")}`;
  return `${kg} ${t("workoutDetail.kg")}`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function inputMethodKey(m: string): string {
  switch (m) {
    case "voice":
      return "workoutDetail.byVoice";
    case "photo":
      return "workoutDetail.byPhoto";
    case "tap":
      return "workoutDetail.byTap";
    default:
      return "workoutDetail.byText";
  }
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

/** source badge — "logged by text/voice/…" pill, tinted with the workout palette. */
function SourceBadge({ label }: { label: string }) {
  return (
    <View style={{ backgroundColor: entryPalette.workout.badgeBg, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 11, alignSelf: "flex-start" }}>
      <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={entryPalette.workout.badgeInk}>
        {label}
      </Text>
    </View>
  );
}

const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Prototype vtPop for the selected-muscle info chip (Fable B8). */
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(300);

export default function WorkoutDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);
  const units = getSettings()?.units ?? "metric";
  const [preview, setPreview] = useState<LocalEntry | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);

  // Last 30 days of workouts for the history strip (this entry included, newest last).
  const history = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return entriesInRange("workout", start, end);
  }, [entry?.id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  if (!entry || entry.type !== "workout") {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, gap: 15 }}>
        <BackButton onPress={back} label={t("workoutDetail.back")} />
        <Text variant="body" color={colors.muted}>
          {t("workoutDetail.notFound")}
        </Text>
      </ScrollView>
    );
  }

  const detail = entry.detail as WorkoutDetail;
  const muscles = (detail.muscles ?? []) as Muscle[];
  const exercises = detail.exercises ?? [];
  const highlighted = Object.fromEntries(muscles.map((m) => [m, 1])) as Partial<Record<Muscle, number>>;

  // Selected muscle → which exercises worked it (empty when older/seeded data has no per-exercise muscles).
  const hits = selectedMuscle ? exercisesForMuscle(exercises, selectedMuscle) : [];
  const hitIndexes = new Set(hits.map((h) => h.index));

  const d = new Date(entry.occurredAt);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const dayLabel = isToday ? t("workoutDetail.today") : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const subtitle = `${dayLabel} · ${timeOf(entry.occurredAt)}${detail.durationMin != null ? ` · ${detail.durationMin} ${t("common.min")}` : ""}`;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 60, paddingBottom: 150, gap: 15 }}
    >
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BackButton onPress={back} label={t("workoutDetail.back")} />
        <SectionLabel>{t("workoutDetail.eyebrow")}</SectionLabel>
      </View>

      {/* hero */}
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flexShrink: 1, gap: 6 }}>
            <Text variant="title" style={{ fontSize: 22 }}>
              {detail.title}
            </Text>
            <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
              {subtitle}
            </Text>
            <SourceBadge label={t(inputMethodKey(entry.inputMethod))} />
          </View>
          {detail.kcal != null && (
            <View style={{ alignItems: "flex-end", gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text style={{ fontFamily: fonts.extraLight, fontSize: 40, letterSpacing: -1 }}>
                  {Math.round(detail.kcal)}
                </Text>
                <Text variant="body" color={colors.muted}>
                  {t("common.kcal")}
                </Text>
              </View>
              <EstimateTag label={t("common.estimate")} />
            </View>
          )}
        </View>
      </Card>

      {/* source phrase */}
      {entry.sourcePhrase ? (
        <Animated.View entering={FadeIn.duration(450).delay(60)}>
          <View
            style={{
              backgroundColor: "#FFF7EA",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(196,112,78,0.35)",
              borderRadius: 18,
              padding: 14,
            }}
          >
            <Text style={{ fontStyle: "italic", fontSize: 13, lineHeight: 20 }} color={colors.muted}>
              “{entry.sourcePhrase}”
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* muscle map */}
      {muscles.length > 0 && (
        <Card style={{ gap: 14, alignItems: "center" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", alignSelf: "stretch" }}>
            <SectionLabel>{t("workoutDetail.musclesWorked")}</SectionLabel>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={selectedMuscle ? colors.accent : colors.labelMuted}>
              {selectedMuscle ? t(`muscles.${selectedMuscle}`) : t("workoutDetail.estimateNote")}
            </Text>
          </View>
          <BodyMap
            highlighted={highlighted}
            frontLabel={t("workoutDetail.frontView")}
            backLabel={t("workoutDetail.backView")}
            seeFrontLabel={t("workoutDetail.seeFront")}
            seeBackLabel={t("workoutDetail.seeBack")}
            onMusclePress={(m) => setSelectedMuscle((cur) => (cur === m ? null : m))}
          />
          {selectedMuscle && (
            <Animated.View
              key={selectedMuscle}
              entering={popIn}
              style={{
                gap: 6,
                backgroundColor: colors.estimateBg,
                borderWidth: 1,
                borderColor: "rgba(196,112,78,0.3)",
                borderRadius: 16,
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignSelf: "stretch",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                <Text variant="label" style={{ fontSize: 13, flex: 1 }} color={colors.estimateInk}>
                  {t(`muscles.${selectedMuscle}`)}
                  {hits.length > 0 ? `  ·  ${t(`workoutDetail.role.${overallRole(hits)}`)}` : ""}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={() => setSelectedMuscle(null)} hitSlop={8}>
                  <Text color={colors.estimateInk} style={{ fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
              {hits.length > 0 && (
                <Text variant="caption" style={{ fontSize: 12, marginLeft: 17 }} color={colors.muted}>
                  {hits.map((h) => h.exercise.name).join(" · ")}
                </Text>
              )}
            </Animated.View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {muscles.map((m) => (
              <Chip key={m} label={t(`muscles.${m}`)} selected={m === selectedMuscle} onPress={() => setSelectedMuscle((cur) => (cur === m ? null : m))} />
            ))}
          </View>
          <Text variant="caption" style={{ fontSize: 10.5, textAlign: "center" }} color={colors.labelMuted}>
            {t("workoutDetail.tapMuscleHint")}
          </Text>
        </Card>
      )}

      {/* exercises */}
      {exercises.length > 0 && (
        <Card style={{ paddingVertical: 14 }}>
          <View style={{ paddingBottom: 4 }}>
            <SectionLabel>{t("workoutDetail.exercisesAsImported")}</SectionLabel>
          </View>
          {exercises.map((ex, i) => {
            // When a muscle is selected + this workout has per-exercise data, emphasise the
            // exercises that worked it and dim the rest; otherwise every row reads normally.
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
                  backgroundColor: lit ? entryPalette.workout.badgeBg : "transparent",
                  opacity: dimmed ? 0.38 : 1,
                  borderBottomWidth: i === exercises.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(120,100,75,0.07)",
                }}
              >
                <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 12, width: 16 }} color={lit ? colors.accent : colors.labelMuted}>
                  {i + 1}
                </Text>
                <Text variant="label" style={{ fontSize: 14, flex: 1, fontFamily: lit ? fonts.bold : undefined }} color={colors.ink}>
                  {ex.name}
                </Text>
                <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                  {ex.sets != null && ex.reps != null ? `${ex.sets} × ${ex.reps}` : ex.sets != null ? `${ex.sets} ${t("workoutDetail.sets")}` : ""}
                  {ex.loadKg != null ? `  ·  ${formatLoad(ex.loadKg, units, t)}` : ""}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {/* 30-day history strip */}
      {history.length > 0 && (
        <Card style={{ gap: 12 }}>
          <SectionLabel>{t("workoutDetail.recent")}</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {history.map((w) => {
              const wd = w.detail as WorkoutDetail;
              const current = w.id === entry.id;
              return (
                <Pressable
                  key={w.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${wd.title} · ${dayMonth(new Date(w.occurredAt))}`}
                  onPress={() => setPreview(w)}
                  style={{
                    minWidth: 84,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    backgroundColor: current ? entryPalette.workout.badgeBg : colors.surface,
                    borderWidth: current ? 1 : 0,
                    borderColor: entryPalette.workout.line,
                    gap: 3,
                  }}
                >
                  <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10 }} color={colors.labelMuted}>
                    {dayMonth(new Date(w.occurredAt))}
                  </Text>
                  <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1} color={colors.ink}>
                    {wd.title}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 11 }} color={colors.muted}>
                    {wd.durationMin != null ? `${wd.durationMin} ${t("common.min")}` : t("home.workout")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>
      )}

      <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center" }} color={colors.labelMuted}>
        {t("workoutDetail.footer")}
      </Text>

    </ScrollView>
    {/* preview sheet — shared, rises + drag-dismisses (Fable A4) */}
    <WorkoutPreviewSheet entry={preview} onClose={() => setPreview(null)} hideOpenFor={entry.id} />
    </View>
  );
}
