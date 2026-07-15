import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text, colors, fonts, useAccent } from "../../ui";
import { DockDatePicker } from "./DockDatePicker";
import { NDAYS, MAXD } from "./dock";

const dayAt = (offset: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d;
};

/**
 * The date-section header (Home v2): a label (Today / Yesterday / weekday) with
 * a short date, a "Today ↺" return pill when browsing the past, and the dock
 * date picker below. The label just swaps text on day change (no slide — only
 * the timeline content below slides).
 */
export function DaySection({
  selectedOffset,
  goDay,
}: {
  selectedOffset: number;
  goDay: (offset: number) => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();

  const label =
    selectedOffset === 0
      ? t("home.today")
      : selectedOffset === 1
        ? t("home.dayYesterday")
        : dayAt(selectedOffset).toLocaleDateString(undefined, { weekday: "long" });
  const dateShort = dayAt(selectedOffset).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Dock tooltip labels: dot i (left→right) → day at offset (9 − i).
  const dayDates = useMemo(
    () =>
      Array.from({ length: NDAYS }, (_, i) =>
        dayAt(MAXD - i).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      ),
    [],
  );

  return (
    <View style={{ paddingHorizontal: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase" }}
          color={colors.labelMuted}
        >
          {label}
        </Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color="#CFC5B4">
          {dateShort}
        </Text>
        {selectedOffset > 0 && (
          <Animated.View entering={FadeIn.duration(250)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("home.todayReturn")}
              onPress={() => goDay(0)}
              hitSlop={6}
              style={{ backgroundColor: `${accent}1A`, borderRadius: 11, paddingVertical: 4, paddingHorizontal: 9 }}
            >
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" }} color={accent}>
                {t("home.todayReturn")}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
      <View style={{ marginTop: 10 }}>
        <DockDatePicker selectedOffset={selectedOffset} goDay={goDay} dayDates={dayDates} />
      </View>
    </View>
  );
}
