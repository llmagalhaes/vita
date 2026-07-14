/**
 * Muscle sessions sheet (Fable B4) — tap a muscle on the Trends heatmap (or its
 * ranked chip) and the sheet rises with that muscle's sessions in the window;
 * tapping a session opens the workout preview. The prototype lists per-muscle
 * exercises; our data model maps muscles per session (not per exercise), so the
 * honest version lists the sessions — their exercises are one tap away in the
 * preview. Rows fade in staggered like the prototype's.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import type { Muscle, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { SheetOverlay, Text, colors, entryPalette, fonts } from "../ui";

const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export type MuscleSelection = { muscle: Muscle; sessions: LocalEntry[] };

export function MuscleSheet({
  selection,
  onClose,
  onPreview,
}: {
  selection: MuscleSelection | null;
  onClose: () => void;
  onPreview: (entry: LocalEntry) => void;
}) {
  const { t } = useTranslation();
  const n = selection?.sessions.length ?? 0;
  return (
    <SheetOverlay visible={selection != null} onClose={onClose} closeLabel={t("common.cancel")}>
      {selection != null && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text variant="title" style={{ fontSize: 19 }}>
              {t(`muscles.${selection.muscle}`)}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {n === 1 ? t("trends.oneSession") : t("trends.nSessions", { count: n })}
            </Text>
          </View>
          {n === 0 ? (
            <Text variant="caption" color={colors.muted}>
              {t("trends.noWorkouts")}
            </Text>
          ) : (
            <View>
              {selection.sessions.map((w, i) => {
                const wd = w.detail as WorkoutDetail;
                return (
                  <Animated.View key={w.id} entering={FadeIn.duration(350).delay(i * 50)}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        onClose();
                        onPreview(w);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: i === n - 1 ? 0 : 1, borderBottomColor: "rgba(120,100,75,0.07)" }}
                    >
                      <View style={{ backgroundColor: entryPalette.workout.badgeBg, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 8 }}>
                        <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={colors.accent}>
                          {dayMonth(new Date(w.occurredAt))}
                        </Text>
                      </View>
                      <Text variant="label" style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1} color={colors.ink}>
                        {wd.title}
                      </Text>
                      <Text variant="caption" style={{ fontSize: 11 }} color={colors.muted}>
                        {wd.durationMin != null ? `${wd.durationMin} ${t("common.min")}` : ""}
                      </Text>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.labelMuted}>
                        ›
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}
          <Text variant="caption" style={{ fontSize: 10.5, textAlign: "center" }} color={colors.labelMuted}>
            {t("trends.tapSession")}
          </Text>
        </View>
      )}
    </SheetOverlay>
  );
}
