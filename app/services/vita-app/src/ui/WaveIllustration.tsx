import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { entryPalette } from "./tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DASH = 420; // path length of the crest line — the draw-on stroke

/**
 * Organic wave footer for timeline/detail cards — paths from the prototype.
 * memo'd: a parent re-render mid-draw recreates the SVG animatedProps and
 * freezes the in-flight crest tween (styles survive re-renders, SVG animated
 * props don't) — props are scalars, so memo keeps the component untouched.
 */
export const WaveIllustration = memo(function WaveIllustration({
  kind,
  height = 72,
  delay = 0,
}: {
  kind: keyof typeof entryPalette;
  height?: number;
  /** Stagger the crest draw-on to match the prototype's per-card delay. */
  delay?: number;
}) {
  const p = entryPalette[kind];
  // Prototype vtDraw: the crest strokes on from 0 over ~1.1s (stroke-dashoffset 420→0).
  const offset = useSharedValue(DASH);
  useEffect(() => {
    offset.value = withDelay(delay, withTiming(0, { duration: 1100, easing: Easing.out(Easing.ease) }));
    // Safety net: SVG animated props can drop a tween scheduled during a busy
    // cold boot — pin the final state so the crest is never left invisible.
    const id = setTimeout(() => {
      offset.value = 0;
    }, delay + 1400);
    return () => clearTimeout(id);
  }, [delay, offset]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  return (
    <View pointerEvents="none" style={{ width: "100%", height }}>
      <Svg width="100%" height="100%" viewBox="0 0 348 72" preserveAspectRatio="none">
        <Circle cx={282} cy={32} r={17} fill="#F2B45C" opacity={0.45} />
        <Path
          d="M0 42 C60 22 120 54 180 38 C240 22 300 48 348 32 L348 72 L0 72 Z"
          fill={p.c1}
          opacity={0.55}
        />
        <Path
          d="M0 56 C70 40 140 64 210 50 C280 38 320 58 348 48 L348 72 L0 72 Z"
          fill={p.c2}
        />
        <Circle cx={24} cy={63} r={5} fill={p.c2} opacity={0.8} />
        <Circle cx={329} cy={65} r={6} fill={p.c1} />
        <AnimatedPath
          d="M8 44 C60 16 104 58 162 42 C222 26 268 18 340 24"
          fill="none"
          stroke={p.line}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeDasharray={DASH}
          animatedProps={lineProps}
        />
      </Svg>
    </View>
  );
});
