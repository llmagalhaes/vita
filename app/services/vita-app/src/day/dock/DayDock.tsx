/**
 * APP-099 — day travel: the label row (Today / Yesterday / weekday · short date ·
 * "Today ↺" · calendar button) over the 10-dot dock date picker. Prototype lines
 * 336–352; the magnifier math itself is untouched (`dock.ts` + `DockDatePicker`).
 *
 * The only writer of `src/day/selection.ts`: every other surface ("Open this day →"
 * in the muscle sheet, the habit calendar, a Trends week bar) travels by calling
 * `setSelectedOffset` / `setSelectedDate` — never by touching this component.
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { Text, colors, fonts, letterSpacing, mixOklab, typeScale, useAccent } from "../../ui";
import { useLogVersion } from "../../db/notify";
import { CalendarSheet } from "../CalendarSheet";
import { dateForOffset, offsetForDate, setSelectedDate, setSelectedOffset, useSelectedDate } from "../selection";
import { recentStatuses } from "../statuses";
import { DockDatePicker } from "./DockDatePicker";
import { MAXD, NDAYS } from "./dock";

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Rect x={1.5} y={2.5} width={11} height={10} rx={2} fill="none" stroke={color} strokeWidth={1.4} />
      <Path d="M1.5 5.5 h11 M4.5 1 v3 M9.5 1 v3" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

export function DayDock() {
  const { t } = useTranslation();
  const accent = useAccent();
  const version = useLogVersion(); // a close / retro-close repaints the dots
  const selected = useSelectedDate();
  const [calendar, setCalendar] = useState(false);

  const { offset, label, dateShort, dayDates, statuses } = useMemo(() => {
    const today = new Date();
    const off = offsetForDate(selected, today);
    const at = (o: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - o);
    // Today is deliberately status-less: the day isn't over, so there is nothing
    // to report about it yet (the calendar leaves today blank for the same reason).
    const seen = recentStatuses(today, NDAYS);
    return {
      offset: off,
      label:
        off === 0
          ? t("calendar.today")
          : off === 1
            ? t("calendar.yesterday")
            : at(off).toLocaleDateString(undefined, { weekday: "long" }),
      dateShort: shortDate(at(off)),
      dayDates: Array.from({ length: NDAYS }, (_, i) => (MAXD - i === 0 ? t("calendar.today") : shortDate(at(MAXD - i)))),
      statuses: Array.from({ length: NDAYS }, (_, i) =>
        MAXD - i === 0 ? undefined : seen[dateForOffset(MAXD - i, today)],
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, version, t]);

  return (
    <View style={{ paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            fontFamily: fonts.extraBold,
            fontSize: typeScale.micro,
            letterSpacing: letterSpacing.zoneLabel,
            textTransform: "uppercase",
          }}
          color={colors.faint}
        >
          {label}
        </Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 10.5 }} color={colors.disabled}>
          {dateShort}
        </Text>
        {offset > 0 && (
          <Animated.View entering={FadeIn.duration(250)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("calendar.backToday")}
              onPress={() => setSelectedOffset(0)}
              hitSlop={6}
              style={{
                backgroundColor: mixOklab(accent, 10, colors.card),
                borderRadius: 11,
                paddingVertical: 4,
                paddingHorizontal: 9,
              }}
            >
              <Text
                style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }}
                color={accent}
              >
                {t("calendar.backToday")}
              </Text>
            </Pressable>
          </Animated.View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.open")}
          onPress={() => setCalendar(true)}
          hitSlop={8}
          style={{
            marginLeft: "auto",
            width: 28,
            height: 28,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.borderControl,
            backgroundColor: colors.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CalendarIcon color={colors.muted} />
        </Pressable>
      </View>

      <View style={{ marginTop: 10 }}>
        {/* An offset outside 0..9 (a day picked from the calendar) matches no dot —
            the dock simply shows no selection rather than lying about one. */}
        <DockDatePicker
          selectedOffset={offset}
          goDay={setSelectedOffset}
          dayDates={dayDates}
          statuses={statuses}
        />
      </View>

      <CalendarSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        selected={selected}
        onPick={(date) => {
          setSelectedDate(date);
          setCalendar(false);
        }}
      />
    </View>
  );
}
