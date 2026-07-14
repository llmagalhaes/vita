import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text, colors, fonts } from "../ui";
import { ActivityTab } from "../trends/ActivityTab";
import { FoodTab } from "../trends/FoodTab";
import { vacationRanges } from "../db/vacation";
import { type TrendWindow, WINDOW_DAYS, vacationExcluder, windowRange } from "../trends/aggregate";

const WINDOWS: TrendWindow[] = ["W", "F", "M"];

function Segment<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  flex,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  flex?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#F0EDE2", borderRadius: 16, padding: 3, gap: 2, flex: flex ? 1 : undefined }}>
      {options.map((opt) => {
        const on = opt === value;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(opt)}
            style={{ flex: flex ? 1 : undefined, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 13, backgroundColor: on ? colors.card : "transparent", alignItems: "center" }}
          >
            <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.ink : colors.muted}>
              {labelOf(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Trends() {
  const { t } = useTranslation();
  const [window, setWindow] = useState<TrendWindow>("W");
  const [tab, setTab] = useState<"food" | "activity">("food");

  // Real persisted vacation ranges (APP-030) drive the exclusion; the aggregation
  // already honors the predicate. Empty until the user sets a trip.
  const isExcluded = vacationExcluder(vacationRanges());

  const { start, end } = windowRange(window);
  const rangeLabel = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(end.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 150, gap: 13 }}>
      {/* header: label + W/F/M window switch */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text variant="caption" style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }} color={colors.labelMuted}>
          {t("trends.title")}
        </Text>
        <View style={{ marginLeft: "auto" }}>
          <Segment options={WINDOWS} value={window} onChange={setWindow} labelOf={(w) => t(`trends.window.${w}`)} />
        </View>
      </View>
      <Text variant="caption" style={{ fontSize: 11.5, paddingHorizontal: 2 }} color={colors.labelMuted}>
        {rangeLabel} · {WINDOW_DAYS[window]} {t("trends.days")} · {t("trends.recordedOnly")}
      </Text>

      {/* Food / Activity tabs */}
      <Segment
        options={["food", "activity"] as const}
        value={tab}
        onChange={setTab}
        labelOf={(k) => (k === "food" ? t("trends.food") : t("trends.activity"))}
        flex
      />

      {tab === "food" ? (
        <FoodTab window={window} isExcluded={isExcluded} />
      ) : (
        <ActivityTab window={window} isExcluded={isExcluded} />
      )}
    </ScrollView>
  );
}
