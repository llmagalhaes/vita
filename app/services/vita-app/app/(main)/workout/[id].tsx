import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import type { Muscle, WorkoutDetail } from "../../../src/api";
import { entriesInRange, getEntry, type LocalEntry } from "../../../src/db/entries";
import { getHealthReader, type HcSession } from "../../../src/health/healthConnect";
import { WorkoutPreviewSheet } from "../../../src/workout/PreviewSheet";
import { exerciseTypeKey, mergeHistory, type HistoryRow } from "../../../src/workout/history";
import { exercisesForMuscle, muscleIntensities, overallRole } from "../../../src/workout/muscleExercises";
import { Chevron } from "../../../src/ui";
import {
  BackButton,
  BodyMap,
  Card,
  EstimateTag,
  PressScale,
  Text,
  type BodySide,
  colors,
  fonts,
  sideOf,
  spacing,
  tint,
  useAccent,
} from "../../../src/ui";

function formatLoad(kg: number, t: (k: string) => string): string {
  return `${kg} ${t("workoutDetail.kg")}`;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

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

/** Prototype vtPop for the selected-muscle info chip (Fable B8). */
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(300);

export default function WorkoutDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);
  const [preview, setPreview] = useState<LocalEntry | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(undefined);
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);
  const [side, setSide] = useState<BodySide>("front");
  const [hcSessions, setHcSessions] = useState<HcSession[]>([]);

  // Tap a muscle (shape or chip): toggle it and auto-flip the body to its side.
  const pickMuscle = (m: Muscle) =>
    setSelectedMuscle((cur) => {
      const next = cur === m ? null : m;
      if (next) setSide((s) => sideOf(m, s));
      return next;
    });

  // Last 30 days: captured workouts + Health Connect sessions (device-only; stub → []).
  const range = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, []);
  const captured = useMemo(() => entriesInRange("workout", range.start, range.end), [entry?.id, range]);
  useEffect(() => {
    let alive = true;
    // SQLite/display only — HC sessions NEVER touch the outbox (ADR-0016). A8: iOS
    // + Expo Go get the stub's empty list = captured workouts only this round.
    void getHealthReader()
      .readSessions(range.start, range.end)
      .then((s) => alive && setHcSessions(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [range]);
  const sessionTitle = (s: HcSession) => s.title ?? t(`health.exerciseType.${exerciseTypeKey(s.exerciseType)}`);
  const history = useMemo(() => mergeHistory(captured, hcSessions, sessionTitle), [captured, hcSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTodayIso = (iso: string) => {
    const dd = new Date(iso);
    const now = new Date();
    return dd.getFullYear() === now.getFullYear() && dd.getMonth() === now.getMonth() && dd.getDate() === now.getDate();
  };

  const openRow = (row: HistoryRow) => {
    if (row.source === "capture" && row.entry) {
      setPreviewSrc(undefined);
      setPreview(row.entry);
    } else if (row.session) {
      // HC preview via a minimal adapter LocalEntry (no muscles/exercises).
      setPreviewSrc(t("workoutDetail.viaHealthConnect"));
      setPreview({
        id: row.key,
        type: "workout",
        occurredAt: row.date,
        inputMethod: "text",
        isEstimate: true,
        syncState: "synced",
        needsReview: false,
        detail: { title: row.title, durationMin: row.durationMin, muscles: [], exercises: [] },
      } as LocalEntry);
    }
  };

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
  // Per-muscle opacity from muscleRoles (APP-080); flat 0.78 for old flat entries.
  const intensities = muscleIntensities(exercises);
  const highlighted: Partial<Record<Muscle, number>> =
    Object.keys(intensities).length > 0
      ? Object.fromEntries(Object.entries(intensities).map(([m, v]) => [m, v!.opacity]))
      : Object.fromEntries(muscles.map((m) => [m, 0.78]));

  // Selected muscle → which exercises worked it (empty when older/seeded data has no per-exercise muscles).
  const hits = selectedMuscle ? exercisesForMuscle(exercises, selectedMuscle) : [];
  const hitIndexes = new Set(hits.map((h) => h.index));
  const selectedRole = selectedMuscle ? (intensities[selectedMuscle]?.role ?? (hits.length > 0 ? overallRole(hits) : "primary")) : null;

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
        <Card style={{ gap: 14, alignItems: "center" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", alignSelf: "stretch" }}>
            <SectionLabel>{t("workoutDetail.musclesWorked")}</SectionLabel>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={selectedMuscle ? colors.accent : colors.labelMuted}>
              {selectedMuscle ? t(`muscles.${selectedMuscle}`) : t("workoutDetail.estimateNote")}
            </Text>
          </View>
          <BodyMap
            highlighted={highlighted}
            absolute
            selected={selectedMuscle}
            side={side}
            onSideChange={setSide}
            accent={accent}
            frontLabel={t("workoutDetail.frontView")}
            backLabel={t("workoutDetail.backView")}
            seeFrontLabel={t("workoutDetail.seeFront")}
            seeBackLabel={t("workoutDetail.seeBack")}
            onMusclePress={pickMuscle}
          />
          {selectedMuscle && (
            <Animated.View
              key={selectedMuscle}
              entering={popIn}
              style={{
                gap: 6,
                backgroundColor: tint(accent, 8),
                borderWidth: 1,
                borderColor: tint(accent, 25),
                borderRadius: 16,
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignSelf: "stretch",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Text variant="label" style={{ fontSize: 13.5, flex: 1 }} color={colors.ink}>
                  {t(`muscles.${selectedMuscle}`)}
                </Text>
                {selectedRole && (
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.7, textTransform: "uppercase" }} color={accent}>
                    {t(`workoutDetail.role.${selectedRole}`)}
                  </Text>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={() => setSelectedMuscle(null)} hitSlop={8}>
                  <Text color={colors.muted} style={{ fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
              {hits.length > 0 && (
                <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
                  {hits.map((h) => h.exercise.name).join(" · ")}
                </Text>
              )}
            </Animated.View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {muscles.map((m) => {
              const on = m === selectedMuscle;
              return (
                <PressScale
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => pickMuscle(m)}
                  style={{
                    backgroundColor: on ? tint(accent, 14) : colors.surface,
                    borderWidth: 1,
                    borderColor: on ? accent : "transparent",
                    borderRadius: 12,
                    paddingVertical: 6,
                    paddingHorizontal: 11,
                  }}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={on ? accent : "#6E6355"}>
                    {t(`muscles.${m}`)}
                  </Text>
                </PressScale>
              );
            })}
          </View>
          <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
            {t("workoutDetail.tapChipHint")}
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
      {history.length > 0 && (
        <Card style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12, paddingBottom: 4 }}>
            <SectionLabel>{t("workoutDetail.history")}</SectionLabel>
            <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
              {t("workoutDetail.last30")}
            </Text>
          </View>
          {history.map((row, i) => {
            const rd = new Date(row.date);
            const today = isTodayIso(row.date);
            const metaBits = [
              row.durationMin != null ? `${row.durationMin} ${t("common.min")}` : null,
              row.kcal != null ? `~${Math.round(row.kcal)} ${t("common.kcal")}` : null,
            ].filter(Boolean);
            return (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={`${row.title} · ${dayMonth(rd)}`}
                onPress={() => openRow(row)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  opacity: pressed ? 0.6 : 1,
                  borderBottomWidth: i === history.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(120,100,75,0.07)",
                })}
              >
                {/* date tile */}
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: today ? tint(accent, 13) : colors.surface }}>
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} color={today ? accent : colors.muted}>
                    {rd.getDate()}
                  </Text>
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.7 }} color={today ? accent : colors.muted}>
                    {rd.toLocaleDateString(undefined, { month: "short" })}
                  </Text>
                </View>
                {/* middle */}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontSize: 14, fontFamily: fonts.bold }} numberOfLines={1}>
                    {row.title}
                  </Text>
                  {row.muscles.length > 0 && (
                    <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.labelMuted} numberOfLines={1}>
                      {row.muscles.map((m) => t(`muscles.${m}`)).join(" · ")}
                    </Text>
                  )}
                </View>
                {/* right */}
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  {metaBits.length > 0 && (
                    <Text variant="caption" style={{ fontSize: 12, fontFamily: fonts.semiBold }} color={colors.muted}>
                      {metaBits.join(" · ")}
                    </Text>
                  )}
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.5 }} color={colors.labelMuted}>
                    {t("workoutDetail.via").toUpperCase()} {(row.source === "capture" ? t("workoutDetail.viaCapture") : t("workoutDetail.viaHealthConnect")).toUpperCase()}
                  </Text>
                </View>
                <View style={{ opacity: 0.4 }}>
                  <Chevron open={false} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      <Text variant="caption" style={{ fontSize: 11.5, textAlign: "center" }} color={colors.labelMuted}>
        {t("workoutDetail.footer")}
      </Text>

    </ScrollView>
    {/* preview sheet — shared, rises + drag-dismisses (Fable A4) */}
    <WorkoutPreviewSheet entry={preview} onClose={() => setPreview(null)} hideOpenFor={entry.id} sourceOverride={previewSrc} />
    </View>
  );
}
