import { useMemo, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { Muscle, Units, WorkoutDetail } from "../api/client";
import { entriesInRange, type LocalEntry } from "../db/entries";
import { getSettings } from "../db/settings";
import { useLogVersion } from "../db/notify";
import { BodyMap, Chip, EstimateTag, Text, colors, entryPalette, fonts, spacing } from "../ui";
import {
  type DayBucket,
  type ExcludeDay,
  type TrendWindow,
  aggregateDays,
  muscleStats,
  visibleDays,
  windowRange,
  workoutsInWindow,
} from "./aggregate";
import { SectionLabel, TrendCard } from "./parts";

const KG_PER_LB = 0.453592;
const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatLoad(kg: number, units: Units, t: (k: string) => string): string {
  return units === "imperial" ? `${Math.round(kg / KG_PER_LB)} ${t("workoutDetail.lb")}` : `${kg} ${t("workoutDetail.kg")}`;
}

/** Workout heatmap square — darker = longer session that day (vacation days faint). */
function DaySquare({ b, max }: { b: DayBucket; max: number }) {
  const ratio = max > 0 ? b.workoutMin / max : 0;
  const empty = b.workoutMin === 0;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: empty ? colors.surface : colors.accent,
        opacity: b.excluded ? 0.25 : empty ? 1 : 0.3 + 0.7 * ratio,
      }}
    />
  );
}

export function ActivityTab({ window, isExcluded }: { window: TrendWindow; isExcluded?: ExcludeDay }) {
  const { t } = useTranslation();
  const version = useLogVersion();
  const units = getSettings()?.units ?? "metric";
  const [preview, setPreview] = useState<LocalEntry | null>(null);
  const router = useRouter();

  const { days, workouts, muscles } = useMemo(() => {
    const { start, end } = windowRange(window);
    const wk = entriesInRange("workout", start, end);
    return {
      days: aggregateDays(wk, window, new Date(), isExcluded),
      workouts: workoutsInWindow(wk, window, new Date(), isExcluded),
      muscles: muscleStats(wk, window, new Date(), isExcluded),
    };
  }, [window, version, isExcluded]);

  const shown = visibleDays(days);
  const totalMin = shown.reduce((s, d) => s + d.workoutMin, 0);
  const maxMin = Math.max(1, ...shown.map((d) => d.workoutMin));
  const sessionCount = workouts.length;

  return (
    <View style={{ gap: 13 }}>
      {/* Muscles heatmap — reuses the APP-019 BodyMap primitive (front∪back = 11 muscles) */}
      <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: "rgba(120,100,75,0.06)", gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionLabel>{t("trends.musclesWorked")}</SectionLabel>
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
            {t("trends.sessionsTouching")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 24, justifyContent: "center" }}>
          <BodyMap highlighted={muscles.intensity} side="front" showToggle={false} size={90} />
          <BodyMap highlighted={muscles.intensity} side="back" showToggle={false} size={90} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 22 }}>
          <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("workoutDetail.front")}
          </Text>
          <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }} color={colors.labelMuted}>
            {t("workoutDetail.back2")}
          </Text>
        </View>
        {muscles.ranked.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {muscles.ranked.map(({ muscle, count }) => (
              <Chip key={muscle} label={`${t(`muscles.${muscle}`)} ${count}`} />
            ))}
          </View>
        ) : (
          <Text variant="caption" style={{ textAlign: "center" }} color={colors.muted}>
            {t("trends.noWorkouts")}
          </Text>
        )}
        <Text variant="caption" style={{ fontSize: 10.5, textAlign: "center" }} color={colors.labelMuted}>
          {t("trends.darkerMoreSessions")}
        </Text>
      </View>

      {/* Active (aerobic) minutes — honest: from logged workouts, health source adds more */}
      <TrendCard
        title={t("trends.activeMinutes")}
        unitNote={t("trends.fromWorkouts")}
        count={days.length}
        readout={(i) => ({ value: `${Math.round(days[i]!.workoutMin)}`, detail: `${t("common.min")} · ${dayMonth(days[i]!.date)}` })}
        dragHint={t("trends.dragChart")}
        footer={t("trends.connectHealth")}
      >
        {(active) => (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
              <Text style={{ fontFamily: fonts.extraLight, fontSize: 36, letterSpacing: -1 }}>{Math.round(totalMin)}</Text>
              <Text variant="caption" color={colors.muted}>
                {t("trends.minInWindow")}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end", height: 60 }}>
              {days.map((b, i) => {
                const dim = b.excluded ? 0.25 : active != null && active !== i ? 0.4 : 1;
                return (
                  <View key={b.key} style={{ flex: 1, height: `${(b.workoutMin / maxMin) * 100}%`, minHeight: b.workoutMin > 0 ? 3 : 0, maxWidth: 22, borderRadius: 5, backgroundColor: colors.accent, opacity: dim, alignSelf: "flex-end" }} />
                );
              })}
            </View>
          </View>
        )}
      </TrendCard>

      {/* Workouts — heatmap squares → session list → preview sheet */}
      <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: "rgba(120,100,75,0.06)", gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <SectionLabel>{t("trends.workouts")}</SectionLabel>
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
            {sessionCount === 1 ? t("trends.oneSession") : t("trends.nSessions", { count: sessionCount })}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          {chunk(days, 7).map((row, r) => (
            <View key={r} style={{ flexDirection: "row", gap: 6 }}>
              {row.map((b) => (
                <DaySquare key={b.key} b={b} max={maxMin} />
              ))}
            </View>
          ))}
        </View>
        <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
          {t("trends.darkerLonger")}
        </Text>

        {workouts.length > 0 && (
          <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: "rgba(120,100,75,0.16)", paddingTop: 4 }}>
            {workouts.map((w) => {
              const wd = w.detail as WorkoutDetail;
              return (
                <Pressable
                  key={w.id}
                  accessibilityRole="button"
                  onPress={() => setPreview(w)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(120,100,75,0.07)" }}
                >
                  <View style={{ backgroundColor: entryPalette.workout.badgeBg, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color={colors.accent}>
                      {dayMonth(new Date(w.occurredAt))}
                    </Text>
                  </View>
                  <Text variant="label" style={{ flex: 1, fontSize: 13 }} numberOfLines={1} color={colors.ink}>
                    {wd.title}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 11 }} color={colors.muted}>
                    {wd.durationMin != null ? `${wd.durationMin} ${t("common.min")}` : ""}
                  </Text>
                </Pressable>
              );
            })}
            <Text variant="caption" style={{ fontSize: 10, paddingTop: 8 }} color={colors.labelMuted}>
              {t("trends.tapSession")}
            </Text>
          </View>
        )}
      </View>

      {/* Preview sheet (mirrors workout detail's preview Modal) */}
      <Modal visible={preview != null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
          onPress={() => setPreview(null)}
          style={{ flex: 1, backgroundColor: "rgba(60,50,38,0.32)", justifyContent: "flex-end" }}
        >
          <Pressable style={{ backgroundColor: colors.sheet, margin: 6, borderRadius: 28, padding: spacing.xl - 4, gap: spacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(120,100,75,0.18)", alignSelf: "center" }} />
            {preview &&
              (() => {
                const pd = preview.detail as WorkoutDetail;
                const pms = (pd.muscles ?? []) as Muscle[];
                const exercises = pd.exercises ?? [];
                return (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flexShrink: 1 }}>
                        <Text variant="title" style={{ fontSize: 19 }}>
                          {pd.title}
                        </Text>
                        <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2 }} color={colors.muted}>
                          {dayMonth(new Date(preview.occurredAt))} · {timeOf(preview.occurredAt)}
                          {pd.durationMin != null ? ` · ${pd.durationMin} ${t("common.min")}` : ""}
                        </Text>
                      </View>
                      {pd.kcal != null && (
                        <View style={{ alignItems: "flex-end", gap: 3 }}>
                          <Text style={{ fontFamily: fonts.light, fontSize: 22 }}>
                            {Math.round(pd.kcal)}{" "}
                            <Text variant="caption" color={colors.muted}>
                              {t("common.kcal")}
                            </Text>
                          </Text>
                          <EstimateTag label={t("common.estimate")} />
                        </View>
                      )}
                    </View>
                    {pms.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {pms.map((m) => (
                          <Chip key={m} label={t(`muscles.${m}`)} />
                        ))}
                      </View>
                    )}
                    {exercises.length > 0 && (
                      <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14 }}>
                        {exercises.map((ex, i) => (
                          <View key={`${ex.name}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: i === exercises.length - 1 ? 0 : 1, borderBottomColor: "rgba(120,100,75,0.07)" }}>
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
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const goId = preview.id;
                        setPreview(null);
                        router.push(`/workout/${goId}`);
                      }}
                      style={{ alignSelf: "center", paddingVertical: 6 }}
                    >
                      <Text variant="label" style={{ textDecorationLine: "underline" }} color={colors.muted}>
                        {t("workoutDetail.openThis")}
                      </Text>
                    </Pressable>
                  </>
                );
              })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
