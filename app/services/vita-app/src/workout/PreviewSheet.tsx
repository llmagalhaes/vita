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
import { SheetOverlay, Text, colors, fonts, spacing, tint, useAccent } from "../ui";

function formatLoad(kg: number, t: (k: string) => string): string {
  return `${kg}${t("workoutDetail.kg")}`;
}

/** Short source name for the "via …" meta line, from how the entry was logged. */
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

/** Calendar-style date chip: big day over short upper-case month, accent-tinted (§7.2). */
function DateBadge({ date, accent }: { date: Date; accent: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", backgroundColor: tint(accent, 13), borderRadius: 14, width: 48, height: 48 }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, lineHeight: 20 }} color={accent}>
        {date.getDate()}
      </Text>
      <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 1, opacity: 0.7 }} color={accent}>
        {date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
      </Text>
    </View>
  );
}

export function WorkoutPreviewSheet({
  entry,
  onClose,
  hideOpenFor,
  sourceOverride,
}: {
  entry: LocalEntry | null;
  onClose: () => void;
  /** Suppress the "open this workout" link when previewing this entry id (already on its page). */
  hideOpenFor?: string;
  /** SRC label override (Health Connect rows have no inputMethod). */
  sourceOverride?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const d = entry?.detail as WorkoutDetail | undefined;
  const muscles = (d?.muscles ?? []) as Muscle[];
  const exercises = d?.exercises ?? [];
  const src = sourceOverride ?? t(sourceKey(entry?.inputMethod ?? "text")).toUpperCase();

  return (
    <SheetOverlay visible={entry != null} onClose={onClose} closeLabel={t("common.cancel")}>
      {entry != null && d != null && (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <DateBadge date={new Date(entry.occurredAt)} accent={accent} />
            <View style={{ flexShrink: 1, gap: 3 }}>
              <Text variant="title" style={{ fontSize: 19 }}>
                {d.title}
              </Text>
              <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
                {d.durationMin != null ? `${d.durationMin} ${t("common.min")} · ` : ""}
                {d.kcal != null ? `~${Math.round(d.kcal)} ${t("common.kcal")} · ` : ""}
                {t("workoutDetail.via")} {src}
              </Text>
            </View>
          </View>
          {muscles.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {muscles.map((m) => (
                <View key={m} style={{ backgroundColor: tint(accent, 12), borderRadius: 12, paddingVertical: 5, paddingHorizontal: 11 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={accent}>
                    {t(`muscles.${m}`)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {exercises.length > 0 && (
            <View style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14 }}>
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
                  <View style={{ width: 24, height: 24, borderRadius: 9, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                    <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 11 }} color={colors.labelMuted}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="label" style={{ flex: 1, fontSize: 13.5, fontFamily: fonts.semiBold }} color={colors.ink}>
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
          {entry.id !== hideOpenFor && !sourceOverride && (
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
