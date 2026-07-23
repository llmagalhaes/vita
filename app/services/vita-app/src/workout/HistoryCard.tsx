/**
 * 30-day history strip (APP-091) — extracted verbatim from `workout/[id].tsx` so
 * the Workout hub renders the identical rows. Presentational: takes merged rows
 * + an open handler; the preview-sheet state lives in `useWorkoutHistory`.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { HistoryRow } from "./history";
import { Card, Chevron, Text, colors, fonts, tint, useAccent } from "../ui";

const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

const isTodayIso = (iso: string) => {
  const dd = new Date(iso);
  const now = new Date();
  return dd.getFullYear() === now.getFullYear() && dd.getMonth() === now.getMonth() && dd.getDate() === now.getDate();
};

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

export function HistoryCard({ history, onOpen }: { history: HistoryRow[]; onOpen: (row: HistoryRow) => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  if (history.length === 0) return null;
  return (
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
            onPress={() => onOpen(row)}
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
  );
}
