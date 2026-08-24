/**
 * APP-099 — the month sheet behind the dock's calendar button (prototype lines
 * 887–911). A 7-column grid of 42px cells for the CURRENT month; every past day
 * carries its record status as a dot: green as-planned · amber adjusted · a RING
 * for a day with no record. The ring is the whole point — an untouched day is an
 * absence, never a failed fill, so it is never a filled "missed" marker.
 *
 * Future days are disabled (sand ink, no dot); today carries no dot either — the
 * day isn't over, so there is nothing to report about it yet.
 *
 * ponytail: no month paging — the prototype has none and the dock already covers
 * the last 10 days. Add prev/next arrows when the CEO asks to reach further back.
 */
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SheetOverlay, Text, colors, fonts, useAccent } from "../ui";
import { dayKey } from "./record";
import { monthStatuses, type DayStatus } from "./statuses";

const CELL_H = 42;
const DOT = 5;

export type CalendarCell = {
  /** Local YYYY-MM-DD, or null for a leading blank before the 1st. */
  date: string | null;
  day: number;
  future: boolean;
  status: DayStatus;
};

/** The month grid `today` falls in: leading blanks, then every day with its status. */
export function monthCells(today: Date, statuses: Record<string, DayStatus>): CalendarCell[] {
  const y = today.getFullYear();
  const m = today.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) cells.push({ date: null, day: 0, future: false, status: "unrecorded" });
  for (let d = 1; d <= days; d++) {
    const date = dayKey(new Date(y, m, d));
    cells.push({ date, day: d, future: d > today.getDate(), status: statuses[date] ?? "unrecorded" });
  }
  return cells;
}

/** Dot paint per status — `unrecorded` is a ring, never a fill. */
export const dotStyle = (status: DayStatus, isToday: boolean) =>
  isToday || status === "unrecorded"
    ? {
        backgroundColor: "transparent",
        ...(isToday ? {} : { borderWidth: 1.5, borderColor: colors.ringNoRecord }),
      }
    : { backgroundColor: status === "adjusted" ? colors.amber.fill : colors.green.fill };

export function CalendarSheet({
  visible,
  onClose,
  selected,
  onPick,
  today = new Date(),
}: {
  visible: boolean;
  onClose: () => void;
  /** The day the panel is showing, local YYYY-MM-DD. */
  selected: string;
  onPick: (date: string) => void;
  today?: Date;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const todayKey = dayKey(today);
  // Read the month's entries once, when the sheet is actually up. Keyed on the DAY,
  // not on the `today` object: it is a default parameter, so a fresh Date identity
  // every render made this memo never hit and re-ran two ranged scans per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cells = useMemo(() => (visible ? monthCells(today, monthStatuses(today)) : []), [visible, todayKey]);

  const legend = (color: string | null, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          ...(color ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: colors.ringNoRecord }),
        }}
      />
      <Text style={{ fontFamily: fonts.bold, fontSize: 10 }} color={colors.muted}>
        {label}
      </Text>
    </View>
  );

  const sheet = (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 17 }} color={colors.inkHeading}>
            {today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.faint}>
            {t("calendar.sub")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((c, i) =>
            c.date == null ? (
              <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: CELL_H }} />
            ) : (
              <View key={c.date} style={{ width: `${100 / 7}%`, padding: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: c.future, selected: c.date === selected }}
                  accessibilityLabel={String(c.day)}
                  disabled={c.future}
                  onPress={() => onPick(c.date!)}
                  style={{
                    height: CELL_H,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    backgroundColor: c.date === selected ? accent : "transparent",
                  }}
                >
                  <Text
                    style={{ fontFamily: fonts.bold, fontSize: 13 }}
                    color={c.future ? colors.sand : c.date === selected ? "#FFF9F1" : colors.inkHeading}
                  >
                    {c.day}
                  </Text>
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: DOT / 2,
                      ...(c.future ? { backgroundColor: "transparent" } : dotStyle(c.status, c.date === todayKey)),
                    }}
                  />
                </Pressable>
              </View>
            ),
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
          {legend(colors.green.fill, t("calendar.legend.asPlanned"))}
          {legend(colors.amber.fill, t("calendar.legend.adjusted"))}
          {legend(null, t("calendar.legend.noRecord"))}
        </View>
      </View>
    </SheetOverlay>
  );

  // SheetOverlay now portals itself to the app-root PopHost, so rendering in place
  // is safe even inside the Day panel's ScrollView.
  return sheet;
}
