/**
 * Workout preview bottom sheet — rises and drag-dismisses like every sheet
 * (Fable A4; replaces two near-identical fade Modals in workout detail and
 * Trends → Activity). Render it OUTSIDE any ScrollView — it absolute-fills the
 * screen it sits in.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { Muscle, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { Chip, SheetOverlay, Text, colors, fonts, spacing } from "../ui";

function formatLoad(kg: number, t: (k: string) => string): string {
  return `${kg}${t("workoutDetail.kg")}`;
}

/** Short source name for the "via …" meta line (IMG-3), from how the entry was logged. */
function sourceKey(m: string): string {
  switch (m) {
    case "voice":
      return "workoutDetail.source.voice";
    case "photo":
      return "workoutDetail.source.photo";
    case "tap":
      return "workoutDetail.source.tap";
    default:
      return "workoutDetail.source.text";
  }
}

/** Calendar-style date chip: big day over short upper-case month (IMG-3 "11 JUL"). */
function DateBadge({ date }: { date: Date }) {
  return (
    <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, minWidth: 52 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 20, lineHeight: 22 }} color={colors.ink}>
        {date.getDate()}
      </Text>
      <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 1 }} color={colors.labelMuted}>
        {date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
      </Text>
    </View>
  );
}

export function WorkoutPreviewSheet({
  entry,
  onClose,
  hideOpenFor,
}: {
  entry: LocalEntry | null;
  onClose: () => void;
  /** Suppress the "open this workout" link when previewing this entry id (already on its page). */
  hideOpenFor?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const d = entry?.detail as WorkoutDetail | undefined;
  const muscles = (d?.muscles ?? []) as Muscle[];
  const exercises = d?.exercises ?? [];

  return (
    <SheetOverlay visible={entry != null} onClose={onClose} closeLabel={t("common.cancel")}>
      {entry != null && d != null && (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <DateBadge date={new Date(entry.occurredAt)} />
            <View style={{ flexShrink: 1, gap: 3 }}>
              <Text variant="title" style={{ fontSize: 19 }}>
                {d.title}
              </Text>
              <Text variant="caption" style={{ fontSize: 12.5 }} color={colors.muted}>
                {d.durationMin != null ? `${d.durationMin} ${t("common.min")} · ` : ""}
                {d.kcal != null ? `~${Math.round(d.kcal)} ${t("common.kcal")} · ` : ""}
                {t("workoutDetail.via")} {t(sourceKey(entry.inputMethod)).toUpperCase()}
              </Text>
            </View>
          </View>
          {muscles.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {muscles.map((m) => (
                <Chip key={m} label={t(`muscles.${m}`)} />
              ))}
            </View>
          )}
          {exercises.length > 0 && (
            <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14 }}>
              {exercises.map((ex, i) => (
                <View
                  key={`${ex.name}-${i}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 9,
                    borderBottomWidth: i === exercises.length - 1 ? 0 : 1,
                    borderBottomColor: "rgba(120,100,75,0.07)",
                  }}
                >
                  <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 12, width: 15 }} color={colors.labelMuted}>
                    {i + 1}
                  </Text>
                  <Text variant="label" style={{ flex: 1, fontSize: 13.5 }} color={colors.ink}>
                    {ex.name}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
                    {ex.sets != null && ex.reps != null ? `${ex.sets}×${ex.reps}` : ""}
                    {ex.loadKg != null ? `·${formatLoad(ex.loadKg, t)}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
            {t("workoutDetail.previewHint")}
          </Text>
          {entry.id !== hideOpenFor && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const goId = entry.id;
                onClose();
                router.push(`/workout/${goId}`);
              }}
              style={{ alignSelf: "center", paddingVertical: 6 }}
            >
              <Text variant="label" style={{ textDecorationLine: "underline" }} color={colors.muted}>
                {t("workoutDetail.openThis")}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </SheetOverlay>
  );
}
