/**
 * Muscle sessions sheet (Fable B4) — tap a muscle on the Trends heatmap (or its
 * ranked chip) and the sheet rises with that muscle's sessions in the window;
 * tapping a session opens the workout preview. The prototype lists per-muscle
 * exercises; our data model maps muscles per session (not per exercise), so the
 * honest version lists the sessions — their exercises are one tap away in the
 * preview. Header (accent-tinted dumbbell tile + title/subline) and rounded
 * session cards match the prototype's "Muscle exercises sheet"; rows fade in
 * staggered.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import type { Muscle, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { SheetOverlay, Text, colors, fonts, tint } from "../ui";

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
        <View style={{ gap: 12 }}>
          {/* Header: accent-tinted dumbbell tile + title/subline (prototype "Muscle exercises sheet") */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: tint(colors.accent, 13),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg width={18} height={18}>
                <Rect x={1.5} y={6.2} width={3.2} height={5.6} rx={1.2} fill={colors.accent} />
                <Rect x={13.3} y={6.2} width={3.2} height={5.6} rx={1.2} fill={colors.accent} />
                <Path d="M5.4 9 h7.2" stroke={colors.accent} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title" style={{ fontSize: 19 }}>
                {t(`muscles.${selection.muscle}`)}
              </Text>
              <Text variant="caption" style={{ marginTop: 1 }} color={colors.muted}>
                {n === 1 ? t("trends.oneSession") : t("trends.nSessions", { count: n })}
              </Text>
            </View>
          </View>
          {n === 0 ? (
            <Text variant="caption" color={colors.muted}>
              {t("trends.noWorkouts")}
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
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
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.surface }}
                    >
                      <View style={{ backgroundColor: colors.card, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 8 }}>
                        <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={colors.accent}>
                          {dayMonth(new Date(w.occurredAt))}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} numberOfLines={1} color={colors.ink}>
                          {wd.title}
                        </Text>
                        {wd.durationMin != null && (
                          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.muted}>
                            {`${wd.durationMin} ${t("common.min")}`}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color={colors.labelMuted}>
                        ›
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}
          <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
            {t("trends.tapSession")}
          </Text>
        </View>
      )}
    </SheetOverlay>
  );
}
