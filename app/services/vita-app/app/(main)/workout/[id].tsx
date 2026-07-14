import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { Muscle, Units, WorkoutDetail } from "../../../src/api";
import { entriesInRange, getEntry, type LocalEntry } from "../../../src/db/entries";
import { WorkoutPreviewSheet } from "../../../src/workout/PreviewSheet";
import { getSettings } from "../../../src/db/settings";
import {
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

function BackButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: "rgba(120,100,75,0.16)",
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={18} height={18}>
        <Path d="M10.8 4.5 L6.3 9 L10.8 13.5" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
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
            frontLabel={t("workoutDetail.front")}
            backLabel={t("workoutDetail.back2")}
            onMusclePress={setSelectedMuscle}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {muscles.map((m) => (
              <Chip key={m} label={t(`muscles.${m}`)} />
            ))}
          </View>
        </Card>
      )}

      {/* exercises */}
      {exercises.length > 0 && (
        <Card style={{ paddingVertical: 14 }}>
          <View style={{ paddingBottom: 4 }}>
            <SectionLabel>{t("workoutDetail.exercises")}</SectionLabel>
          </View>
          {exercises.map((ex, i) => (
            <View
              key={`${ex.name}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                borderBottomWidth: i === exercises.length - 1 ? 0 : 1,
                borderBottomColor: "rgba(120,100,75,0.07)",
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: entryPalette.workout.line }} />
              <Text variant="label" style={{ fontSize: 14, flex: 1 }} color={colors.ink}>
                {ex.name}
              </Text>
              <Text variant="caption" style={{ fontSize: 13 }} color={colors.muted}>
                {ex.sets != null && ex.reps != null ? `${ex.sets} × ${ex.reps}` : ex.sets != null ? `${ex.sets} ${t("workoutDetail.sets")}` : ""}
                {ex.loadKg != null ? `  ·  ${formatLoad(ex.loadKg, units, t)}` : ""}
              </Text>
            </View>
          ))}
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
