/**
 * The muscle-map card — BodyMap silhouette + selected-muscle info banner + chip
 * row. Extracted from `workout/[id].tsx` (APP-091) so the Workout hub renders the
 * exact same block. Controlled: the parent owns `selected` so it can highlight its
 * own exercise list; this card owns `side` (auto-flips to a tapped muscle's side).
 *
 * Behaviour is byte-identical to the inline version it replaces in the detail
 * screen — the `muscles` prop preserves the detail's explicit muscle list (with
 * the flat-0.78 fallback for old entries); when omitted (the hub) muscles derive
 * from per-exercise roles.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { Keyframe } from "react-native-reanimated";
import type { Exercise, Muscle } from "../api";
import { exercisesForMuscle, muscleIntensities, overallRole } from "./muscleExercises";
import {
  BodyMap,
  Card,
  PressScale,
  Text,
  type BodySide,
  colors,
  fonts,
  sideOf,
  tint,
  useAccent,
} from "../ui";

const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

/** Prototype vtPop for the selected-muscle info chip (Fable B8). */
const popIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(300);

export function MuscleMapCard({
  exercises,
  muscles: musclesProp,
  selected,
  onSelect,
}: {
  exercises: Exercise[];
  /** Explicit muscle list (detail screen); omit to derive from per-exercise roles (hub). */
  muscles?: Muscle[];
  selected: Muscle | null;
  onSelect: (m: Muscle | null) => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [side, setSide] = useState<BodySide>("front");

  const intensities = muscleIntensities(exercises);
  const muscles = musclesProp ?? (Object.keys(intensities) as Muscle[]);
  if (muscles.length === 0) return null;

  // Per-muscle opacity from muscleRoles (APP-080); flat 0.78 for old flat entries.
  const highlighted: Partial<Record<Muscle, number>> =
    Object.keys(intensities).length > 0
      ? Object.fromEntries(Object.entries(intensities).map(([m, v]) => [m, v!.opacity]))
      : Object.fromEntries(muscles.map((m) => [m, 0.78]));

  const hits = selected ? exercisesForMuscle(exercises, selected) : [];
  const selectedRole = selected ? (intensities[selected]?.role ?? (hits.length > 0 ? overallRole(hits) : "primary")) : null;

  // Tap a muscle (shape or chip): toggle it and auto-flip the body to its side.
  const pick = (m: Muscle) => {
    const next = selected === m ? null : m;
    if (next) setSide((s) => sideOf(m, s));
    onSelect(next);
  };

  return (
    <Card style={{ gap: 14, alignItems: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", alignSelf: "stretch" }}>
        <SectionLabel>{t("workoutDetail.musclesWorked")}</SectionLabel>
        <Text variant="caption" style={{ fontSize: 10.5 }} color={selected ? colors.accent : colors.labelMuted}>
          {selected ? t(`muscles.${selected}`) : t("workoutDetail.estimateNote")}
        </Text>
      </View>
      <BodyMap
        highlighted={highlighted}
        absolute
        selected={selected}
        side={side}
        onSideChange={setSide}
        accent={accent}
        frontLabel={t("workoutDetail.frontView")}
        backLabel={t("workoutDetail.backView")}
        seeFrontLabel={t("workoutDetail.seeFront")}
        seeBackLabel={t("workoutDetail.seeBack")}
        onMusclePress={pick}
      />
      {selected && (
        <Animated.View
          key={selected}
          entering={popIn}
          style={{
            gap: 6,
            backgroundColor: tint(accent, 8),
            borderWidth: 1,
            borderColor: tint(accent, 25),
            borderRadius: 16,
            paddingVertical: 10,
            paddingHorizontal: 14,
            alignSelf: "stretch",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Text variant="label" style={{ fontSize: 13.5, flex: 1 }} color={colors.ink}>
              {t(`muscles.${selected}`)}
            </Text>
            {selectedRole && (
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.7, textTransform: "uppercase" }} color={accent}>
                {t(`workoutDetail.role.${selectedRole}`)}
              </Text>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={() => onSelect(null)} hitSlop={8}>
              <Text color={colors.muted} style={{ fontSize: 14 }}>✕</Text>
            </Pressable>
          </View>
          {hits.length > 0 && (
            <Text variant="caption" style={{ fontSize: 12 }} color={colors.muted}>
              {hits.map((h) => h.exercise.name).join(" · ")}
            </Text>
          )}
        </Animated.View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
        {muscles.map((m) => {
          const on = m === selected;
          return (
            <PressScale
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => pick(m)}
              style={{
                backgroundColor: on ? tint(accent, 14) : colors.surface,
                borderWidth: 1,
                borderColor: on ? accent : "transparent",
                borderRadius: 12,
                paddingVertical: 6,
                paddingHorizontal: 11,
              }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={on ? accent : "#6E6355"}>
                {t(`muscles.${m}`)}
              </Text>
            </PressScale>
          );
        })}
      </View>
      <Text variant="caption" style={{ fontSize: 11, textAlign: "center" }} color={colors.labelMuted}>
        {t("workoutDetail.tapChipHint")}
      </Text>
    </Card>
  );
}
