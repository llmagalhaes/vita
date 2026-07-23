import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import type { Muscle, WorkoutDetail } from "../../../src/api";
import { getEntry } from "../../../src/db/entries";
import { WorkoutPreviewSheet } from "../../../src/workout/PreviewSheet";
import { exercisesForMuscle } from "../../../src/workout/muscleExercises";
import { MuscleMapCard } from "../../../src/workout/MuscleMapCard";
import { HistoryCard } from "../../../src/workout/HistoryCard";
import { useWorkoutHistory } from "../../../src/workout/useWorkoutHistory";
import {
  BackButton,
  Card,
  EstimateTag,
  Text,
  colors,
  fonts,
  spacing,
  tint,
  useAccent,
} from "../../../src/ui";

function formatLoad(kg: number, t: (k: string) => string): string {
  return `${kg} ${t("workoutDetail.kg")}`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

const MONOGRAM: Record<string, string> = { voice: "Vo", text: "Te", photo: "Ph", tap: "Ta" };

/** "Logged by …" source card — 36px monogram avatar + method + time (§7.3, honest). */
function SourceCard({ method, when }: { method: string; when: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E7EDE1", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 12.5 }} color="#5F7A61">
          {MONOGRAM[method] ?? "Te"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 14, fontFamily: fonts.bold }}>
          {t("workoutDetail.loggedBy", { method: t(`workoutDetail.source.${method === "voice" || method === "photo" || method === "tap" ? method : "text"}`) })}
        </Text>
        <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
          {when}
        </Text>
      </View>
    </View>
  );
}

export default function WorkoutDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  const { history, preview, previewSrc, openRow, closePreview } = useWorkoutHistory();

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
            <SourceCard method={entry.inputMethod} when={subtitle} />
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
        <MuscleMapCard exercises={exercises} muscles={muscles} selected={selectedMuscle} onSelect={setSelectedMuscle} />
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
                  backgroundColor: lit ? tint(accent, 9) : "transparent",
                  opacity: dimmed ? 0.38 : 1,
                  borderBottomWidth: i === exercises.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(120,100,75,0.07)",
                }}
              >
                <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 12, width: 16 }} color={lit ? accent : colors.labelMuted}>
                  {i + 1}
                </Text>
                <Text variant="label" style={{ fontSize: 14, flex: 1, fontFamily: lit ? fonts.bold : undefined }} color={colors.ink}>
                  {ex.name}
                </Text>
                <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                  {ex.sets != null && ex.reps != null ? `${ex.sets} × ${ex.reps}` : ex.sets != null ? `${ex.sets} ${t("workoutDetail.sets")}` : ""}
                  {ex.loadKg != null ? `  ·  ${formatLoad(ex.loadKg, t)}` : ""}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {/* 30-day history — vertical rows, captured + Health Connect, newest first */}
      <HistoryCard history={history} onOpen={openRow} />

      <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center" }} color={colors.labelMuted}>
        {t("workoutDetail.footer")}
      </Text>

    </ScrollView>
    {/* preview sheet — shared, rises + drag-dismisses (Fable A4) */}
    <WorkoutPreviewSheet entry={preview} onClose={closePreview} hideOpenFor={entry.id} sourceOverride={previewSrc} />
    </View>
  );
}
