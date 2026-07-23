import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { Text, colors, fonts } from "../ui";
import { ActivityTab } from "../trends/ActivityTab";
import { FoodTab } from "../trends/FoodTab";
import { TrendsReplayContext } from "../trends/parts";
import { MuscleSheet, type MuscleSelection } from "../trends/MuscleSheet";
import { WorkoutPreviewSheet } from "../workout/PreviewSheet";
import { vacationRanges } from "../db/vacation";
import { hasEntriesInRange, type LocalEntry } from "../db/entries";
import { useLogVersion } from "../db/notify";
import { consecutiveLogWeeks, consistencyKey } from "../trends/consistency";
import { dayKey, type TrendWindow, WINDOW_DAYS, vacationExcluder, windowRange } from "../trends/aggregate";

/**
 * "N weeks in a row of showing up" — ordinal phrasing only, never a number
 * (product non-negotiable). Rendered only at n ≥ 2 (see caller); below that it
 * simply disappears — no zero state, no reset-to-zero counter.
 */
function ConsistencyCard({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path d="M13.5 2.5 C7 2.5 3 6 3 11 C3 12 3.3 13 3.3 13 C3.3 13 8 12.5 11 9.5 C13.5 7 13.5 2.5 13.5 2.5 Z" fill="#8CA58A" />
        <Path d="M4 13 C5.5 10 8.5 7 11.5 5.5" fill="none" stroke="#A9BC9B" strokeWidth={1} strokeLinecap="round" />
      </Svg>
      <Text variant="caption" style={{ fontSize: 12.5, flex: 1, fontFamily: fonts.semiBold }} color="#6E6355">
        {label}
      </Text>
    </View>
  );
}

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
  // Focus-replay (APP-052): bump an epoch every time Trends becomes the settled tab
  // so its charts re-run their left→right grow on each entry, not just once at the
  // offscreen pre-mount. pathname flips only on navigation settle — never mid-swipe.
  const focused = usePathname() === "/trends";
  const [replayEpoch, setReplayEpoch] = useState(0);
  useEffect(() => {
    if (focused) setReplayEpoch((e) => e + 1);
  }, [focused]);
  // Sheets live here so they absolute-fill the screen (not the scroll content).
  const [preview, setPreview] = useState<LocalEntry | null>(null);
  const [muscleSel, setMuscleSel] = useState<MuscleSelection | null>(null);

  // Real persisted vacation ranges (APP-030) drive the exclusion; the aggregation
  // already honors the predicate. Empty until the user sets a trip.
  const isExcluded = vacationExcluder(vacationRanges());

  // Consecutive ≥1-log weeks (vacation weeks bridge). Recomputed when the log
  // changes; the card renders only at n ≥ 2 (disappears rather than resets).
  const logVersion = useLogVersion();
  const consistency = useMemo(
    () =>
      consecutiveLogWeeks(
        new Date(),
        (s, e) => hasEntriesInRange(s, e),
        (s, e) => {
          for (const d = new Date(s); d < e; d.setDate(d.getDate() + 1)) if (!isExcluded(dayKey(d))) return false;
          return true;
        },
      ),
    [logVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { start, end } = windowRange(window);
  const rangeLabel = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(end.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <View style={{ flex: 1 }}>
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

      {/* consistency (ordinal, never numeric) — only at ≥ 2 weeks in a row */}
      {consistency >= 2 && <ConsistencyCard label={t(consistencyKey(consistency))} />}

      {/* Food / Activity tabs */}
      <Segment
        options={["food", "activity"] as const}
        value={tab}
        onChange={setTab}
        labelOf={(k) => (k === "food" ? t("trends.food") : t("trends.activity"))}
        flex
      />

      <TrendsReplayContext.Provider value={replayEpoch}>
        {tab === "food" ? (
          <FoodTab window={window} isExcluded={isExcluded} />
        ) : (
          <ActivityTab window={window} isExcluded={isExcluded} onPreview={setPreview} onMuscle={(muscle, sessions) => setMuscleSel({ muscle, sessions })} />
        )}
      </TrendsReplayContext.Provider>
    </ScrollView>
    <MuscleSheet selection={muscleSel} onClose={() => setMuscleSel(null)} onPreview={setPreview} />
    <WorkoutPreviewSheet entry={preview} onClose={() => setPreview(null)} />
    </View>
  );
}
