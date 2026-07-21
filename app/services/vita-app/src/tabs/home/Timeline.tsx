import { useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { MealDetail, WaterDetail, WorkoutDetail } from "../../api";
import type { LocalEntry } from "../../db/entries";
import { formatVolume } from "../../lib/units";
import { Chevron, PressScale, Text, colors, entryPalette, fonts, shadowRow } from "../../ui";
import { tabsPagerRef } from "../../nav/pagerRef";
import { MAXD } from "./dock";
import { daySummary, mealExpanded, workoutExpanded } from "./timelineData";

const GUTTER_W = 38;
const SPINE_W = 12;
const TILE = 34;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function inputMethodLabel(e: LocalEntry, t: (k: string) => string): string {
  switch (e.inputMethod) {
    case "voice":
      return t("home.byVoice");
    case "photo":
      return t("home.byPhoto");
    case "tap":
      return t("home.byTap");
    default:
      return t("home.byText");
  }
}

/** Compact sync note for an unsynced entry — "" when synced. */
function syncNote(e: LocalEntry, t: (k: string) => string): string {
  if (e.syncState === "pending") return ` · ${t("home.waitingToSync")}`;
  if (e.syncState === "failed") return ` · ${t("home.notSaved")}`;
  return "";
}

function MealIcon() {
  const c = entryPalette.meal.badgeInk;
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      {/* fork */}
      <Path d="M5 2 V6 M4 2 V5.2 M6 2 V5.2 M5 6 V16" stroke={c} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      {/* knife */}
      <Path d="M12.5 2 C10.8 3 10.8 7 12.5 8 V16" stroke={c} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function WorkoutIcon() {
  const c = entryPalette.workout.badgeInk;
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      {/* barbell */}
      <Path d="M6 9 H12" stroke={c} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={2.5} y={5.6} width={2.4} height={6.8} rx={1} fill={c} />
      <Rect x={13.1} y={5.6} width={2.4} height={6.8} rx={1} fill={c} />
      <Rect x={4.9} y={7} width={1.6} height={4} rx={0.6} fill={c} />
      <Rect x={11.5} y={7} width={1.6} height={4} rx={0.6} fill={c} />
    </Svg>
  );
}

function WaterDrop() {
  return (
    <Svg width={11} height={13} viewBox="0 0 16 18">
      <Path d="M8 1.5 C8 1.5 2.8 8 2.8 11.4 a5.2 5.2 0 0 0 10.4 0 C13.2 8 8 1.5 8 1.5 Z" fill={entryPalette.water.dot} />
    </Svg>
  );
}

const Chip = ({ label }: { label: string }) => (
  <View style={{ backgroundColor: "#F3EBDD", borderRadius: 11, paddingVertical: 4, paddingHorizontal: 9 }}>
    <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color="#6E6355">
      {label}
    </Text>
  </View>
);

/** One spine cell: a coloured dot with a soft ring, and the rail dropping below it. */
function Spine({ color }: { color: string }) {
  return (
    <View style={{ width: SPINE_W, alignItems: "center" }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: "#FFF9F1",
          marginTop: 16,
          // soft ring
          shadowColor: "#78644B",
          shadowOpacity: 0.14,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }}
      />
      <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 }} />
    </View>
  );
}

/** Passive water marker — a drop + amount + method. No card, not tappable. */
function WaterRow({ entry }: { entry: LocalEntry }) {
  const { t } = useTranslation();
  const amount = formatVolume((entry.detail as WaterDetail).amountMl, t);
  return (
    <View style={{ flexDirection: "row", gap: 11 }}>
      <Text style={{ width: GUTTER_W, textAlign: "right", fontFamily: fonts.bold, fontSize: 10.5, paddingTop: 16 }} color={colors.labelMuted}>
        {timeOf(entry.occurredAt)}
      </Text>
      <Spine color={entryPalette.water.dot} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 8, paddingBottom: 2 }}>
        <WaterDrop />
        <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color="#7E9480">
          {amount}
        </Text>
        <Text style={{ fontSize: 11.5 }} color={colors.labelMuted}>
          {" · "}
          {inputMethodLabel(entry, t)}
          {syncNote(entry, t)}
        </Text>
      </View>
    </View>
  );
}

/** Meal or workout — a tappable card that expands in place (multi-open). */
function EntryRow({
  entry,
  expanded,
  onToggle,
  onDismiss,
  showFullDetails,
}: {
  entry: LocalEntry;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (id: string) => void;
  showFullDetails: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const kind = entry.type as "meal" | "workout";
  const pal = entryPalette[kind];

  const est = entry.isEstimate ? "~" : "";
  let title: string;
  let sub: string;
  let meta: string;
  let chips: string[] = [];
  let items: { label: string; detail: string }[] = [];

  if (kind === "meal") {
    const d = entry.detail as MealDetail;
    title = d.title ?? t("home.meal");
    sub = (d.items ?? []).map((i) => i.name).join(", ") || (entry.sourcePhrase ?? "");
    const kcal = Math.round(d.totals?.kcal ?? 0);
    meta = `${est}${kcal} ${t("common.kcal")}`;
    const ex = mealExpanded(d);
    chips = [
      t("home.chipProtein", { g: ex.pcf.p }),
      t("home.chipCarbs", { g: ex.pcf.c }),
      t("home.chipFat", { g: ex.pcf.f }),
    ];
    items = ex.items.map((it) => ({ label: it.name, detail: `~${it.kcal} ${t("common.kcal")}` }));
  } else {
    const d = entry.detail as WorkoutDetail;
    title = d.title || t("home.workout");
    const ex = workoutExpanded(d);
    sub = ex.minutes != null ? `${ex.minutes} ${t("common.min")}` : inputMethodLabel(entry, t);
    meta = d.kcal != null ? `${est}${Math.round(d.kcal)} ${t("common.kcal")}` : ex.minutes != null ? `${ex.minutes} ${t("common.min")}` : t("home.workout");
    if (ex.minutes != null) chips.push(t("home.minChip", { min: ex.minutes }));
    if (ex.exerciseCount > 0) chips.push(t("home.exercisesChip", { count: ex.exerciseCount }));
    items = ex.items.map((it) => ({
      label: it.name,
      detail: it.sets != null && it.reps != null ? t("home.setsReps", { sets: it.sets, reps: it.reps }) : "",
    }));
  }

  return (
    <View style={{ flexDirection: "row", gap: 11 }}>
      <Text style={{ width: GUTTER_W, textAlign: "right", fontFamily: fonts.bold, fontSize: 10.5, paddingTop: 16 }} color={colors.labelMuted}>
        {timeOf(entry.occurredAt)}
      </Text>
      <Spine color={pal.dot} />
      <Animated.View layout={LinearTransition.duration(220)} style={{ flex: 1 }}>
        <PressScale
          scale={0.985}
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={onToggle}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: "rgba(120,100,75,0.07)",
            borderRadius: 20,
            paddingVertical: 12,
            paddingHorizontal: 14,
            ...shadowRow,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: TILE, height: TILE, borderRadius: 12, backgroundColor: pal.badgeBg, alignItems: "center", justifyContent: "center" }}>
              {kind === "meal" ? <MealIcon /> : <WorkoutIcon />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15 }} color="#453E35" numberOfLines={1}>
                {title}
              </Text>
              {!!(sub || entry.syncState !== "synced") && (
                <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted} numberOfLines={1}>
                  {sub}
                  {syncNote(entry, t)}
                </Text>
              )}
              {entry.syncState === "failed" && (
                <Pressable accessibilityRole="button" onPress={() => onDismiss(entry.id)} hitSlop={8} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.accent}>
                    {t("home.dismiss")}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={{ backgroundColor: pal.badgeBg, borderRadius: 13, paddingVertical: 5, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5 }} color={pal.badgeInk}>
                {meta}
              </Text>
            </View>
            <Chevron open={expanded} flip />
          </View>

          {expanded && (
            <Animated.View
              entering={FadeIn.duration(250)}
              style={{
                borderTopWidth: 1,
                borderStyle: "dashed",
                borderTopColor: "rgba(120,100,75,0.16)",
                marginTop: 11,
                paddingTop: 11,
                gap: 8,
              }}
            >
              {chips.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {chips.map((c, k) => (
                    <Chip key={k} label={c} />
                  ))}
                </View>
              )}
              {items.map((it, k) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <Text style={{ fontSize: 12.5, flex: 1 }} color="#453E35" numberOfLines={1}>
                    {it.label}
                  </Text>
                  {!!it.detail && (
                    <Text style={{ fontSize: 12 }} color={colors.labelMuted}>
                      {it.detail}
                    </Text>
                  )}
                </View>
              ))}
              {showFullDetails && (
                <Pressable accessibilityRole="link" onPress={() => router.push(`/${kind}/${entry.id}`)} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 2 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.accent}>
                    {t("home.fullDetails")}
                  </Text>
                </Pressable>
              )}
            </Animated.View>
          )}
        </PressScale>
      </Animated.View>
    </View>
  );
}

/**
 * Home v2 timeline (HOME-V2-6/7). The summary line + entry rows for the
 * selected day. Horizontally swipeable to change days: a right drag loads the
 * older day, a left drag the newer one, with elastic ends and a slide-in on
 * commit. Coexists with the tab pager via `blocksExternalGesture` — inside this
 * region a horizontal drag means "change day", not "change tab" (Trends-scrub
 * precedent). Water is a passive marker; meals/workouts expand in place.
 */
export function Timeline({
  entries,
  selectedOffset,
  goDay,
  expandedKeys,
  onToggle,
  onDismiss,
}: {
  entries: LocalEntry[];
  selectedOffset: number;
  goDay: (offset: number) => void;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const showFullDetails = selectedOffset === 0; // "Full details →" today-only (design fidelity)

  const s = daySummary(entries);
  const summary = t("home.tlSummary", {
    meals: t(s.meals === 1 ? "home.tlMealOne" : "home.tlMealMany", { count: s.meals }),
    workouts: t(s.workouts === 1 ? "home.tlWorkoutOne" : "home.tlWorkoutMany", { count: s.workouts }),
    water: t("home.tlWater", { amount: formatVolume(s.waterMl, t) }),
  });

  // Day-swipe: dragX follows the finger (UI thread); enterX plays the slide-in
  // after a discrete day commit. Both sum into one translateX so a residual drag
  // and the entrance never fight. offsetSV mirrors selectedOffset so the gesture
  // reads live bounds without being recreated (no mid-flight recreation).
  const dragX = useSharedValue(0);
  const enterX = useSharedValue(0);
  const offsetSV = useSharedValue(selectedOffset);
  const prevOffset = useRef(selectedOffset);
  const firstMount = useRef(true);
  useEffect(() => {
    offsetSV.value = selectedOffset;
    if (firstMount.current) {
      firstMount.current = false;
      prevOffset.current = selectedOffset;
      return;
    }
    const older = selectedOffset > prevOffset.current;
    prevOffset.current = selectedOffset;
    dragX.value = 0; // clear residual drag; the entrance takes over
    enterX.value = older ? -34 : 34; // vtDayL (older, from left) / vtDayR (newer, from right)
    enterX.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.ease) });
  }, [selectedOffset, dragX, enterX, offsetSV]);

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14]) // mirror the pager's horizontal-intent gate
        .failOffsetY([-18, 18]) // vertical intent → fail → ScrollView scrolls
        .blocksExternalGesture(tabsPagerRef) // pager waits for us inside the region
        .onUpdate((e) => {
          "worklet";
          let dx = e.translationX;
          const off = offsetSV.value;
          if ((off === 0 && dx < 0) || (off === MAXD && dx > 0)) dx = dx / 3.5; // elastic at ends
          dragX.value = dx;
        })
        .onEnd((e) => {
          "worklet";
          const off = offsetSV.value;
          if (e.translationX > 70 && off < MAXD) runOnJS(goDay)(off + 1); // drag right → older
          else if (e.translationX < -70 && off > 0) runOnJS(goDay)(off - 1); // drag left → newer
          else dragX.value = withTiming(0, { duration: 250 }); // snap back
        }),
    [goDay, dragX, offsetSV],
  );

  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value + enterX.value }] }));

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View style={wrapStyle}>
        <Text style={{ fontSize: 13, paddingHorizontal: 4, marginBottom: 6 }} color={colors.muted}>
          {summary}
        </Text>
        {entries.length === 0 ? (
          <Text variant="body" color={colors.muted} style={{ paddingHorizontal: 4, paddingTop: 8 }}>
            {t("home.emptyTimeline")}
          </Text>
        ) : (
          <View>
            {entries.map((e) =>
              e.type === "water" ? (
                <WaterRow key={e.id} entry={e} />
              ) : (
                <EntryRow
                  key={e.id}
                  entry={e}
                  showFullDetails={showFullDetails}
                  onDismiss={onDismiss}
                  expanded={expandedKeys.has(`e_${selectedOffset}_${e.id}`)}
                  onToggle={() => onToggle(`e_${selectedOffset}_${e.id}`)}
                />
              ),
            )}
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
