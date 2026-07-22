import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Ellipse, G, Rect } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { Muscle } from "../api/client";
import { Text } from "./Text";
import { colors, fonts, radii } from "./tokens";

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Interactive front/back muscle silhouette. Hand-built SVG (ponytail: no charting
 * dep — the body is a handful of ellipses/rects on a neutral base figure).
 *
 * Reusable prop surface (APP-028 Trends reuses this for a muscle heatmap):
 *   highlighted — Muscle → intensity 0..1; drives each region's accent opacity.
 *   side        — controlled "front"/"back"; omit for the built-in toggle.
 *   showToggle  — hide the front/back switch (e.g. render two fixed BodyMaps).
 *   accent      — highlight colour (default the app accent).
 *   size        — SVG width in px; height derives from the 1:2 viewBox.
 */

type Shape =
  | { k: "e"; cx: number; cy: number; rx: number; ry: number }
  | { k: "r"; x: number; y: number; w: number; h: number; rx: number };

// The closed muscle vocabulary the contract defines (WorkoutDetail.muscles enum).
// `satisfies` catches a typo/extra; the _NoMissing guard below catches an omission,
// so this stays in lockstep with the generated Muscle type.
export const ALL_MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const satisfies readonly Muscle[];
type _NoMissing = Exclude<Muscle, (typeof ALL_MUSCLES)[number]>;
const _assertComplete: _NoMissing extends never ? true : false = true;
void _assertComplete;

// viewBox 0 0 200 400. Bilateral muscles list both left+right shapes.
const FRONT: Partial<Record<Muscle, Shape[]>> = {
  shoulders: [
    { k: "e", cx: 66, cy: 96, rx: 15, ry: 12 },
    { k: "e", cx: 134, cy: 96, rx: 15, ry: 12 },
  ],
  chest: [
    { k: "e", cx: 84, cy: 118, rx: 16, ry: 13 },
    { k: "e", cx: 116, cy: 118, rx: 16, ry: 13 },
  ],
  biceps: [
    { k: "e", cx: 52, cy: 132, rx: 9, ry: 20 },
    { k: "e", cx: 148, cy: 132, rx: 9, ry: 20 },
  ],
  forearms: [
    { k: "e", cx: 44, cy: 176, rx: 8, ry: 22 },
    { k: "e", cx: 156, cy: 176, rx: 8, ry: 22 },
  ],
  core: [{ k: "r", x: 86, y: 134, w: 28, h: 62, rx: 12 }],
  quads: [
    // Front thighs: sit high on the leg so the tint reads as quadriceps, not knee.
    { k: "e", cx: 85, cy: 250, rx: 13, ry: 40 },
    { k: "e", cx: 115, cy: 250, rx: 13, ry: 40 },
  ],
  calves: [
    { k: "e", cx: 85, cy: 346, rx: 10, ry: 28 },
    { k: "e", cx: 115, cy: 346, rx: 10, ry: 28 },
  ],
};

const BACK: Partial<Record<Muscle, Shape[]>> = {
  shoulders: [
    { k: "e", cx: 66, cy: 96, rx: 15, ry: 12 },
    { k: "e", cx: 134, cy: 96, rx: 15, ry: 12 },
  ],
  back: [{ k: "r", x: 78, y: 104, w: 44, h: 64, rx: 16 }],
  triceps: [
    { k: "e", cx: 52, cy: 132, rx: 9, ry: 20 },
    { k: "e", cx: 148, cy: 132, rx: 9, ry: 20 },
  ],
  forearms: [
    { k: "e", cx: 44, cy: 176, rx: 8, ry: 22 },
    { k: "e", cx: 156, cy: 176, rx: 8, ry: 22 },
  ],
  glutes: [
    // Hips, just below the torso where the legs begin.
    { k: "e", cx: 85, cy: 212, rx: 14, ry: 14 },
    { k: "e", cx: 115, cy: 212, rx: 14, ry: 14 },
  ],
  hamstrings: [
    // Back thighs, below the glutes and above the calves.
    { k: "e", cx: 85, cy: 272, rx: 13, ry: 34 },
    { k: "e", cx: 115, cy: 272, rx: 13, ry: 34 },
  ],
  calves: [
    { k: "e", cx: 85, cy: 346, rx: 10, ry: 28 },
    { k: "e", cx: 115, cy: 346, rx: 10, ry: 28 },
  ],
};

export type BodySide = "front" | "back";

export const bodyRegions = (side: BodySide): Partial<Record<Muscle, Shape[]>> =>
  side === "front" ? FRONT : BACK;

export const otherSide = (s: BodySide): BodySide => (s === "front" ? "back" : "front");

/** The side to show a picked muscle on: stay if it exists here, else flip (§6.2). */
export const sideOf = (m: Muscle, current: BodySide): BodySide =>
  bodyRegions(current)[m] ? current : otherSide(current);

/** Combined bbox center of a muscle's shapes — the transform origin for the breath pulse. */
export function shapesCenter(shapes: Shape[]): { cx: number; cy: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const [x0, y0, x1, y1] = s.k === "e" ? [s.cx - s.rx, s.cy - s.ry, s.cx + s.rx, s.cy + s.ry] : [s.x, s.y, s.x + s.w, s.y + s.h];
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Pure highlight resolution (unit-tested): for each muscle drawn on `side`, its
 * shapes and the fill opacity.
 *  - default (Trends heatmap): `highlighted` is 0..1 intensity, remapped to
 *    `0.25 + i*0.65`; idle → 0.14.
 *  - `absolute` (workout detail): `highlighted` values are the fill opacity AS-IS;
 *    a muscle absent from the map renders at the idle 0.14.
 *  - `selected`: the picked muscle boosts to 1, every other dims to `base * 0.3`.
 */
export function resolveHighlights(
  side: BodySide,
  highlighted: Partial<Record<Muscle, number>>,
  absolute = false,
  selected: Muscle | null = null,
): Array<{ muscle: Muscle; shapes: Shape[]; opacity: number }> {
  const regions = bodyRegions(side);
  return (Object.keys(regions) as Muscle[]).map((muscle) => {
    const raw = highlighted[muscle];
    const clamped = Math.max(0, Math.min(1, raw ?? 0));
    const base = absolute ? (raw != null ? clamped : 0.14) : clamped > 0 ? 0.25 + clamped * 0.65 : 0.14;
    const opacity = selected ? (selected === muscle ? 1 : base * 0.3) : base;
    return { muscle, shapes: regions[muscle]!, opacity };
  });
}

const drawShape = (muscle: Muscle, s: Shape, i: number, accent: string, opacity: number, onPress?: (m: Muscle) => void) =>
  s.k === "e" ? (
    <Ellipse key={`${muscle}-${i}`} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={accent} opacity={opacity} onPress={onPress ? () => onPress(muscle) : undefined} />
  ) : (
    <Rect key={`${muscle}-${i}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={accent} opacity={opacity} onPress={onPress ? () => onPress(muscle) : undefined} />
  );

/** The selected muscle's shapes, breathing (scale 1→1.07→1, 1.5s) about their center. */
function BreathGroup({ shapes, accent, muscle, onPress }: { shapes: Shape[]; accent: string; muscle: Muscle; onPress?: (m: Muscle) => void }) {
  const scale = useSharedValue(1);
  const { cx, cy } = useMemo(() => shapesCenter(shapes), [shapes]);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.07, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [scale]);
  const animatedProps = useAnimatedProps(() => ({
    transform: `translate(${cx} ${cy}) scale(${scale.value}) translate(${-cx} ${-cy})`,
  }));
  return <AnimatedG animatedProps={animatedProps}>{shapes.map((s, i) => drawShape(muscle, s, i, accent, 1, onPress))}</AnimatedG>;
}

function Figure({
  side,
  highlighted,
  accent,
  size,
  absolute,
  selected,
  onMusclePress,
}: {
  side: BodySide;
  highlighted: Partial<Record<Muscle, number>>;
  accent: string;
  size: number;
  absolute?: boolean;
  selected?: Muscle | null;
  onMusclePress?: (m: Muscle) => void;
}) {
  const resolved = resolveHighlights(side, highlighted, absolute, selected ?? null);
  return (
    <Svg width={size} height={size * 2} viewBox="0 0 200 400">
      {/* neutral base body: head, torso, arms, legs — muscles overlay on top */}
      <Circle cx={100} cy={40} r={22} fill={colors.track} />
      <Rect x={60} y={66} width={80} height={132} rx={26} fill={colors.track} />
      <Rect x={36} y={104} width={20} height={98} rx={10} fill={colors.track} />
      <Rect x={144} y={104} width={20} height={98} rx={10} fill={colors.track} />
      <Rect x={72} y={196} width={26} height={188} rx={13} fill={colors.track} />
      <Rect x={102} y={196} width={26} height={188} rx={13} fill={colors.track} />
      {resolved.flatMap(({ muscle, shapes, opacity }) =>
        selected === muscle && side === sideOf(muscle, side) ? (
          <BreathGroup key={`${muscle}-breath`} shapes={shapes} accent={accent} muscle={muscle} onPress={onMusclePress} />
        ) : (
          shapes.map((s, i) => drawShape(muscle, s, i, accent, opacity, onMusclePress))
        ),
      )}
    </Svg>
  );
}

export type BodyMapProps = {
  highlighted?: Partial<Record<Muscle, number>>;
  side?: BodySide;
  onSideChange?: (side: BodySide) => void;
  showToggle?: boolean;
  accent?: string;
  size?: number;
  /** Treat `highlighted` values as literal fill opacity (workout detail), not intensity. */
  absolute?: boolean;
  /** Picked muscle — boosts to full + breathes, dims the rest to 30%. */
  selected?: Muscle | null;
  /** View label shown under the figure ("Front"/"Back"; rendered uppercase). */
  frontLabel?: string;
  backLabel?: string;
  /** "⇄ See back/front" button text (defaults to the opposite view label). */
  seeFrontLabel?: string;
  seeBackLabel?: string;
  onMusclePress?: (m: Muscle) => void;
};

export function BodyMap({
  highlighted = {},
  side: controlledSide,
  onSideChange,
  showToggle = true,
  accent = colors.accent,
  size = 150,
  absolute = false,
  selected = null,
  frontLabel = "Front",
  backLabel = "Back",
  seeFrontLabel,
  seeBackLabel,
  onMusclePress,
}: BodyMapProps) {
  const [internal, setInternal] = useState<BodySide>("front");
  const side = controlledSide ?? internal;
  const setSide = (s: BodySide) => {
    onSideChange?.(s);
    if (controlledSide === undefined) setInternal(s);
  };
  // Button flips to the OTHER side; label reflects where you'd go.
  const flipLabel = side === "front" ? (seeBackLabel ?? backLabel) : (seeFrontLabel ?? frontLabel);
  const viewLabel = side === "front" ? frontLabel : backLabel;

  return (
    <View style={{ alignItems: "center", gap: 8, alignSelf: "stretch" }}>
      {showToggle && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={flipLabel}
          onPress={() => setSide(side === "front" ? "back" : "front")}
          style={{
            alignSelf: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: colors.surface,
            borderRadius: radii.pill,
            paddingVertical: 6,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.accent}>
            ⇄
          </Text>
          <Text variant="caption" style={{ fontFamily: fonts.semiBold, fontSize: 12 }} color={colors.ink}>
            {flipLabel}
          </Text>
        </Pressable>
      )}
      <Figure side={side} highlighted={highlighted} accent={accent} size={size} absolute={absolute} selected={selected} onMusclePress={onMusclePress} />
      {showToggle && (
        <Text
          variant="caption"
          style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1.4, textTransform: "uppercase" }}
          color={colors.labelMuted}
        >
          {viewLabel}
        </Text>
      )}
    </View>
  );
}
