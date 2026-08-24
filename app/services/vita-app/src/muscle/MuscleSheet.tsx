/**
 * APP-101 — the per-muscle bottom sheet (prototype lines 1206–1231). Opens from the
 * Trends chips, the workout card's Muscles view and the past-day map; lists the
 * sessions that actually worked that muscle, with the exercises that did it.
 *
 * All row logic lives in `sessionRows` (muscleData) — this file is geometry only.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SheetOverlay, Text, colors, fonts, mixOklab, useAccent } from "../ui";
import { muscleStats, sessionRows, type MuscleKey, type MuscleRange, type Tier, type WorkoutSession } from "./muscleData";

export type { MuscleRange };

/** The prototype shows four rows and counts the rest as "earlier sessions". */
const MAX_ROWS = 4;

const dateLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export function MuscleSheet({
  muscle,
  sessions,
  range,
  onClose,
  onOpenDay,
}: {
  /** The muscle whose sheet is up; `null` closes it. */
  muscle: MuscleKey | null;
  /** Workout sessions inside the current range (newest-first order is not required). */
  sessions: WorkoutSession[];
  range: MuscleRange;
  onClose: () => void;
  /** Travel the Day panel to that day and close the sheet. */
  onOpenDay: (dayOffset: number) => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const rows = muscle ? sessionRows(sessions, muscle).slice(0, MAX_ROWS) : [];
  // The footer counts from the same muCnt the "Sessions" card shows, so the two agree.
  const stats = muscle ? muscleStats(sessions, muscle, range, rows.length) : null;
  const chip = (tier: Tier) =>
    tier === "primary"
      ? { bg: mixOklab(accent, 16, colors.card), ink: accent }
      : { bg: colors.sandChip, ink: colors.muted };

  return (
    <SheetOverlay visible={muscle != null} onClose={onClose} closeLabel={t("common.cancel")}>
      {muscle != null && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 17 }} color={colors.inkHeading}>
              {t(`muscle.name.${muscle}`)}
            </Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.faint}>
              {t("muscle.sheetSub", { range: t(`muscle.range.${range}`) })}
            </Text>
          </View>

          {stats && (
            <View style={{ flexDirection: "row", gap: 7 }}>
              {[
                { k: t("muscle.stats.sessions"), v: stats.sessions, s: t(`muscle.range.${range}`) },
                { k: t("muscle.stats.primary"), v: stats.primary, s: t("muscle.stats.primarySub") },
                { k: t("muscle.stats.perWeek"), v: stats.perWeek, s: t("muscle.stats.perWeekSub") },
              ].map((ms) => (
                <View
                  key={ms.k}
                  style={{
                    flex: 1,
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    paddingVertical: 11,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: "rgba(120,100,75,0.08)",
                    gap: 1,
                  }}
                >
                  <Text
                    style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" }}
                    color={colors.faint}
                  >
                    {ms.k}
                  </Text>
                  <Text style={{ fontFamily: fonts.light, fontSize: 20, letterSpacing: -0.5 }} color={colors.inkHeading}>
                    {t("muscle.sessionCount", { n: ms.v })}
                  </Text>
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 10 }} color={colors.faint}>
                    {ms.s}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {rows.length === 0 && (
            <Text style={{ fontSize: 12 }} color={colors.muted}>
              {t("muscle.none")}
            </Text>
          )}

          {rows.map((r) => {
            const c = chip(r.tier);
            return (
              <View
                key={r.id}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 18,
                  paddingVertical: 13,
                  paddingHorizontal: 15,
                  borderWidth: 1,
                  borderColor: "rgba(120,100,75,0.08)",
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>
                    {r.program}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.extraBold,
                      fontSize: 9,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      backgroundColor: c.bg,
                      borderRadius: 7,
                      paddingVertical: 2,
                      paddingHorizontal: 6,
                      overflow: "hidden",
                    }}
                    color={c.ink}
                  >
                    {t(`muscle.tier.${r.tier}`)}
                  </Text>
                  <Text style={{ marginLeft: "auto", fontFamily: fonts.bold, fontSize: 11 }} color={colors.faint}>
                    {dateLabel(r.date)}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 18 }} color={colors.inkMuted}>
                  {r.exercises.join(" · ")}
                </Text>
                {r.canOpenDay && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onClose();
                      onOpenDay(r.dayOffset);
                    }}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={accent}>
                      {t("muscle.openDay")}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {stats != null && stats.earlier > 0 && (
            <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, textAlign: "center" }} color={colors.faint}>
              {t("muscle.earlier", { count: stats.earlier })}
            </Text>
          )}

          <Text style={{ fontSize: 10.5, textAlign: "center" }} color={colors.faint}>
            {t("muscle.footer")}
          </Text>
        </View>
      )}
    </SheetOverlay>
  );
}
