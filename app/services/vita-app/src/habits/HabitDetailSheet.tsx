/**
 * APP-102 — habit detail sheet (README §3 "Habit detail sheet", prototype lines
 * 1233–1290). Loop-inspired, counters only: three tiles, the current month's
 * calendar, eight by-month bars and the last 30 days by weekday. Every section
 * derives from real check-in entries via `stats.ts`; nothing here is a score,
 * a streak or a target — the footer says so out loud.
 *
 * Opened by the Trends habit rows (APP-100): pass the habit and an `onOpenDay`
 * that jumps the Day panel to that offset.
 */
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Habit } from "../db/habits";
import { entriesInRange } from "../db/entries";
import { useLogVersion } from "../db/notify";
import { vacationRanges } from "../db/vacation";
import { SheetOverlay, Text, colors, fonts, radii, useAccent } from "../ui";
import {
  MON_FIRST,
  canOpenDay,
  dateOfKey,
  habitStats,
  monthBarHeight,
  weekdayDiameter,
  weekdayOpacity,
  type CalendarCell,
} from "./stats";

/** Calendar geometry (README §3): 34px cells, r11, 7 columns, 4px gutters. */
const CELL = { size: 34, radius: 11, gutter: 2 }; // gutter × 2 = the 4px gap
const CARD = { radius: 18, padV: 13, padH: 15, gap: 9 };
/** Check-ins are few — reading the whole history is cheaper than a windowed query. */
const EPOCH = new Date(0);

const monthShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
const fullDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const sinceDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", year: "numeric" });

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: CARD.radius,
        paddingVertical: CARD.padV,
        paddingHorizontal: CARD.padH,
        borderWidth: 1,
        borderColor: colors.border,
        gap: CARD.gap,
      }}
    >
      <Text
        style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}
        color={colors.faint}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/** One 34px calendar cell. Future days are inert — there is nothing to say yet. */
function DayCell({
  cell,
  selected,
  accent,
  onPress,
}: {
  cell: CalendarCell;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <View style={{ width: `${100 / 7}%`, padding: CELL.gutter }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: cell.future }}
        disabled={cell.future}
        onPress={onPress}
        style={{
          height: CELL.size,
          borderRadius: CELL.radius,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: selected ? accent : "transparent",
          backgroundColor: cell.done ? colors.green.fill : cell.future ? "transparent" : colors.sandChip,
        }}
      >
        <Text
          style={{ fontFamily: fonts.bold, fontSize: 11.5 }}
          // done ink is the prototype's warm off-white `#FFF9F1` — it exists only here, so no token
          color={cell.future ? colors.sand : cell.done ? "#FFF9F1" : colors.inkMuted}
        >
          {cell.day}
        </Text>
      </Pressable>
    </View>
  );
}

export function HabitDetailSheet({
  habit,
  onClose,
  onOpenDay,
}: {
  habit: Habit | null;
  onClose: () => void;
  /** Jump the Day panel to a day `offset` days before today. */
  onOpenDay?: (offset: number) => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);

  // Keep the last habit while the sheet slides back down, so the exit animation
  // isn't an empty card.
  const last = useRef<Habit | null>(null);
  if (habit != null) last.current = habit;
  const shown = habit ?? last.current;

  const today = new Date();
  const stats = useMemo(
    () =>
      habitStats({
        habitId: shown?.id ?? "",
        entries: shown ? entriesInRange("checkin", EPOCH, new Date(Date.now() + 86400000)) : [],
        today,
        vacationRanges: vacationRanges(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown?.id, version],
  );

  const close = () => {
    setSelected(null);
    onClose();
  };

  /** The weekday's label, taken from this week's real date (no hardcoded names). */
  const weekdayLabel = (wd: number, style: "narrow" | "short") =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + wd).toLocaleDateString(
      undefined,
      { weekday: style },
    );

  const topNames = stats.topWeekdays.map((wd) => weekdayLabel(wd, "short"));
  const tiles = [
    { v: t("habitDetail.times", { n: stats.monthCount }), l: t("habitDetail.thisMonth") },
    { v: t("habitDetail.times", { n: stats.totalCount }), l: t("habitDetail.total") },
    { v: topNames.length > 0 ? topNames.join(" · ") : t("habitDetail.none"), l: t("habitDetail.mostOften") },
  ];

  const cell = selected == null ? null : (stats.calendar.find((c) => c.day === selected) ?? null);
  const selLine =
    cell == null
      ? ""
      : [
          cell.offset === 0 ? t("habitDetail.today") : fullDate(dateOfKey(cell.key)),
          cell.done ? t("habitDetail.done") : t("habitDetail.notMarked"),
          ...(cell.onVacation ? [t("habitDetail.onVacation")] : []),
        ].join(" · ");

  const scheduleLine =
    shown == null
      ? ""
      : [
          shown.days.every(Boolean)
            ? t("library.habits.everyDay")
            : MON_FIRST.filter((wd) => shown.days[wd])
                .map((wd) => weekdayLabel(wd, "narrow"))
                .join(" "),
          shown.time,
          ...(stats.since ? [t("habitDetail.since", { date: sinceDate(stats.since) })] : []),
        ]
          .filter(Boolean)
          .join(" · ");

  const barMax = Math.max(...stats.months.map((m) => m.count));

  return (
    <SheetOverlay visible={habit != null} onClose={close} closeLabel={t("common.cancel")}>
      {shown != null && (
        <>
          <View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 17 }} color={colors.inkHeading}>
              {shown.name}
            </Text>
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 11.5, marginTop: 2 }} color={colors.muted}>
              {scheduleLine}
            </Text>
          </View>

          {/* Three counter tiles */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {tiles.map((tile) => (
              <View
                key={tile.l}
                style={{
                  flex: 1,
                  backgroundColor: colors.card,
                  borderRadius: radii.innerBlockTight,
                  paddingVertical: 11,
                  paddingHorizontal: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 15 }} numberOfLines={1} color={colors.inkHeading}>
                  {tile.v}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.extraBold,
                    fontSize: 9.5,
                    letterSpacing: 0.7,
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}
                  color={colors.faint}
                >
                  {tile.l}
                </Text>
              </View>
            ))}
          </View>

          {/* ponytail: the sections scroll, the header drags — a ScrollView and the sheet's
              pan gesture can't both own a downward swipe, and the handle stays the drag target. */}
          <ScrollView style={{ maxHeight: height * 0.55 }} contentContainerStyle={{ gap: 12 }}>
            <SectionCard label={stats.monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -CELL.gutter }}>
                {stats.calendar.map((c, i) =>
                  c.day == null ? (
                    <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, height: CELL.size + CELL.gutter * 2 }} />
                  ) : (
                    <DayCell
                      key={c.key}
                      cell={c}
                      accent={accent}
                      selected={selected === c.day}
                      onPress={() => setSelected(selected === c.day ? null : c.day)}
                    />
                  ),
                )}
              </View>
              {cell != null && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.divider,
                    borderStyle: "dashed",
                    paddingTop: 8,
                  }}
                >
                  <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5, flex: 1 }} color={colors.inkHeading}>
                    {selLine}
                  </Text>
                  {canOpenDay(cell.offset) && onOpenDay != null && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const offset = cell.offset;
                        close();
                        onOpenDay(offset);
                      }}
                    >
                      <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={accent}>
                        {t("habitDetail.openDay")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </SectionCard>

            <SectionCard label={t("habitDetail.byMonth")}>
              <View style={{ flexDirection: "row", gap: 7, alignItems: "flex-end" }}>
                {stats.months.map((m) => (
                  <View key={m.date.toISOString()} style={{ flex: 1, alignItems: "center", gap: 3 }}>
                    <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5 }} color={colors.muted}>
                      {m.count}
                    </Text>
                    <View
                      style={{
                        width: "100%",
                        height: monthBarHeight(m.count, barMax),
                        borderRadius: 5,
                        backgroundColor: m.current ? colors.green.fill : colors.barIdle,
                      }}
                    />
                    <Text
                      style={{ fontFamily: fonts.extraBold, fontSize: 8.5, textTransform: "uppercase" }}
                      color={colors.faint}
                    >
                      {monthShort(m.date)}
                    </Text>
                  </View>
                ))}
              </View>
            </SectionCard>

            <SectionCard label={t("habitDetail.byWeekday")}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  paddingHorizontal: 6,
                }}
              >
                {stats.weekdays.map((w) => {
                  const d = weekdayDiameter(w.share);
                  return (
                    <View key={w.weekday} style={{ width: 24, alignItems: "center", gap: 5 }}>
                      <View style={{ height: 24, justifyContent: "center" }}>
                        <View
                          style={{
                            width: d,
                            height: d,
                            borderRadius: d / 2,
                            backgroundColor: colors.green.fill,
                            opacity: weekdayOpacity(w.count, w.share),
                          }}
                        />
                      </View>
                      <Text style={{ fontFamily: fonts.extraBold, fontSize: 9 }} color={colors.faint}>
                        {weekdayLabel(w.weekday, "narrow")}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </SectionCard>

            <Text style={{ fontSize: 10.5, textAlign: "center" }} color={colors.faint}>
              {t("habitDetail.footer")}
            </Text>
          </ScrollView>
        </>
      )}
    </SheetOverlay>
  );
}
