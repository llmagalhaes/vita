/**
 * Workout preview bottom sheet — rises and drag-dismisses like every sheet
 * (Fable A4; replaces two near-identical fade Modals in workout detail and
 * Trends → Activity). Render it OUTSIDE any ScrollView — it absolute-fills the
 * screen it sits in.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { Muscle, Units, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { getSettings } from "../db/settings";
import { Chip, EstimateTag, SheetOverlay, Text, colors, fonts, spacing } from "../ui";

const KG_PER_LB = 0.453592;
const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function formatLoad(kg: number, units: Units, t: (k: string) => string): string {
  return units === "imperial" ? `${Math.round(kg / KG_PER_LB)} ${t("workoutDetail.lb")}` : `${kg} ${t("workoutDetail.kg")}`;
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
  const units = getSettings()?.units ?? "metric";
  const d = entry?.detail as WorkoutDetail | undefined;
  const muscles = (d?.muscles ?? []) as Muscle[];
  const exercises = d?.exercises ?? [];

  return (
    <SheetOverlay visible={entry != null} onClose={onClose} closeLabel={t("common.cancel")}>
      {entry != null && d != null && (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text variant="title" style={{ fontSize: 19 }}>
                {d.title}
              </Text>
              <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2 }} color={colors.muted}>
                {dayMonth(new Date(entry.occurredAt))} · {timeOf(entry.occurredAt)}
                {d.durationMin != null ? ` · ${d.durationMin} ${t("common.min")}` : ""}
              </Text>
            </View>
            {d.kcal != null && (
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={{ fontFamily: fonts.light, fontSize: 22 }}>
                  {Math.round(d.kcal)}{" "}
                  <Text variant="caption" color={colors.muted}>
                    {t("common.kcal")}
                  </Text>
                </Text>
                <EstimateTag label={t("common.estimate")} />
              </View>
            )}
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
                  <Text variant="label" style={{ flex: 1, fontSize: 13.5 }} color={colors.ink}>
                    {ex.name}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
                    {ex.sets != null && ex.reps != null ? `${ex.sets} × ${ex.reps}` : ""}
                    {ex.loadKg != null ? `  ·  ${formatLoad(ex.loadKg, units, t)}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
