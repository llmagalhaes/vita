import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors } from "./tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type DonutSegment = { value: number; color: string };

/** One ring segment; sweeps with the shared progress (own component: hooks per segment). */
function Seg({
  p,
  dash,
  before,
  c,
  color,
  size,
  r,
  strokeWidth,
}: {
  p: SharedValue<number>;
  dash: number;
  before: number;
  c: number;
  color: string;
  size: number;
  r: number;
  strokeWidth: number;
}) {
  const props = useAnimatedProps(() => ({
    strokeDasharray: `${dash * p.value} ${c - dash * p.value}`,
    strokeDashoffset: -(before * p.value),
  }));
  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      animatedProps={props}
    />
  );
}

/**
 * Ring chart for macro shares (prototype meal-detail donut). Segments sweep in
 * on mount (`vtArc .9s`, Fable B11) — all grow proportionally from 12 o'clock;
 * `children` overlays the centre (kcal label).
 */
export function Donut({
  segments,
  size = 140,
  strokeWidth = 15,
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(150, withTiming(1, { duration: 900, easing: Easing.out(Easing.ease) }));
  }, [p]);
  let before = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.track} strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * c;
          const el = (
            <Seg key={i} p={p} dash={dash} before={before} c={c} color={seg.color} size={size} r={r} strokeWidth={strokeWidth} />
          );
          before += dash;
          return el;
        })}
      </Svg>
      {children != null && (
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
