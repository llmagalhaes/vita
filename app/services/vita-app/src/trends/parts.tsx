import { createContext, useContext, type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Text, colors, fonts, motion, radii, shadowCard, useAccent, useStartOnLayout } from "../ui";
import { ScrubOverlay } from "./scrub";
import { barGap, barHeightPct, tipLeftPct } from "./series";

/**
 * Focus-replay epoch (APP-052). All three panels are PRE-MOUNTED by PanelShell, so a
 * one-shot mount animation runs once, offscreen, and the bars are already static by
 * the time the user swipes in. TrendsPanel bumps this epoch every time it becomes the
 * settled panel; every card re-keys off it so the card fade + the bars' left→right
 * grow replay on every entry (the CEO's named bug). Bumped on navigation settle only
 * — never mid-gesture (the pager rule stands).
 */
export const TrendsReplayContext = createContext(0);

/** Per-window bar stagger (prototype `tDelay`): 55ms/bar for the 7-day view, 16ms for 12/30. */
export const barDelay = (i: number, count: number): number => i * (count === 7 ? 55 : 16);

/**
 * A chart bar that grows up from the bottom on mount (`vtGrowY`, Fable A3). Height
 * is a % of the parent (which justifies flex-end, so growth reads bottom-up).
 * `delay` staggers neighbours. Remounts (range change, or the Trends focus-replay
 * key) re-grow it. The first grow starts from onLayout (see useStartOnLayout);
 * target changes tween.
 */
export function GrowBar({ pct, color, delay = 0, style }: { pct: number; color: string; delay?: number; style?: StyleProp<ViewStyle> }) {
  const target = Math.max(0, Math.min(100, pct));
  const h = useSharedValue(0);
  const started = useRef(false);
  const onLayout = useStartOnLayout(() => {
    h.value = withDelay(delay, withTiming(target, { duration: 550 })); // vtGrowY .55s
    started.current = true;
  });
  useEffect(() => {
    if (started.current) h.value = withTiming(target, { duration: 500 });
  }, [target, h]);
  const grow = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return <Animated.View onLayout={onLayout} style={[style, { backgroundColor: color }, grow]} />;
}

export const SectionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase" }}
    color={colors.labelMuted}
  >
    {children}
  </Text>
);

/** Build an SVG polyline path across evenly-spaced x with y scaled to [0,max]. */
export function linePath(values: number[], w: number, h: number, pad = 6): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const step = values.length === 1 ? 0 : (w - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * The v4 Trends card: `#FFFDF7` r24, 15×17, hairline + card shadow, and the
 * prototype's `vtFade` entrance (8px lift, no slide). Re-keys on the replay epoch.
 */
export function TrendsCard({ children, gap = 10, delay = 0 }: { children: ReactNode; gap?: number; delay?: number }) {
  const epoch = useContext(TrendsReplayContext);
  return (
    <Animated.View
      key={epoch}
      entering={FadeInDown.duration(motion.vtFade.longMs)
        .easing(Easing.bezier(...motion.ease))
        .delay(delay)
        .withInitialValues({ opacity: 0, transform: [{ translateY: motion.vtFade.offsetY }] })}
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.card,
        paddingVertical: 15,
        paddingHorizontal: 17,
        borderWidth: 1,
        borderColor: colors.borderFaint,
        gap,
        ...shadowCard,
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Card header: uppercase label left, a counter note right (both baseline-aligned). */
export const CardHead = ({ label, note }: { label: string; note?: string }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
    <SectionLabel>{label}</SectionLabel>
    {note ? (
      <Text style={{ fontFamily: fonts.bold, fontSize: 11, flexShrink: 1, textAlign: "right" }} color={colors.muted}>
        {note}
      </Text>
    ) : null}
  </View>
);

/** Caption under a card — counters, never targets. */
export const CardFoot = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 10.5, lineHeight: 15 }} color={colors.faint}>
    {children}
  </Text>
);

/**
 * The pinned/scrubbed tooltip (`vtTip`). RN has no `translateX(-50%)`, so the pill
 * measures itself once and offsets by half its own width; it stays invisible for that
 * one frame rather than flashing off-centre.
 */
function Tip({ text, leftPct }: { text: string; leftPct: number }) {
  const accent = useAccent();
  const [w, setW] = useState(0);
  return (
    <Animated.View
      entering={FadeIn.duration(motion.vtTip.durationMs).easing(Easing.bezier(...motion.vtTip.bezier))}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: `${leftPct}%`,
        transform: [{ translateX: -w / 2 }],
        opacity: w ? 1 : 0,
        zIndex: 2,
        backgroundColor: accent,
        borderRadius: 9,
        paddingVertical: 4,
        paddingHorizontal: 9,
      }}
    >
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color="#FFF9F1">
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * One Trends bar chart: a 72px box of `flex:1` bars, the pinned one in accent, an
 * optional axis-label row, and the scrub/pin overlay on top of the whole block (the
 * prototype puts the pointer handlers on the wrapper, tooltip padding included).
 */
export function BarChart({
  values,
  color,
  labels,
  pinned,
  tip,
  onScrub,
  onEnd,
  accessibilityLabel,
}: {
  values: number[];
  color: string;
  /** Axis labels (W and Y only — the 30-day month has no room). */
  labels?: string[];
  pinned: number | null;
  tip?: string;
  onScrub: (i: number) => void;
  onEnd: () => void;
  accessibilityLabel: string;
}) {
  const accent = useAccent();
  const n = values.length;
  const max = Math.max(...values, 1);
  const gap = barGap(n);
  return (
    <View style={{ position: "relative", paddingTop: 26 }}>
      {tip != null && pinned != null && <Tip text={tip} leftPct={tipLeftPct(pinned, n)} />}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap }}>
        {values.map((v, i) => (
          <GrowBar
            key={i}
            pct={barHeightPct(v, max)}
            color={i === pinned ? accent : color}
            delay={barDelay(i, n)}
            style={{ flex: 1, borderRadius: 3 }}
          />
        ))}
      </View>
      {labels && (
        <View style={{ flexDirection: "row", paddingTop: 5, gap }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, fontFamily: fonts.bold }} color={colors.faint}>
              {l}
            </Text>
          ))}
        </View>
      )}
      <ScrubOverlay count={n} onScrub={onScrub} onEnd={onEnd} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

/** The detail card a pin opens: `#FBF6EC` r16, "· " lines, optional day jump. */
export function DetailCard({ title, lines, onOpenDay, openLabel }: { title: string; lines: string[]; onOpenDay?: () => void; openLabel?: string }) {
  const accent = useAccent();
  return (
    <Animated.View
      entering={FadeIn.duration(motion.vtFade.durationMs)}
      style={{ backgroundColor: colors.sheet, borderRadius: radii.innerBlockTight, paddingVertical: 11, paddingHorizontal: 13, gap: 5 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5, flexShrink: 1 }} color={colors.inkHeading}>
          {title}
        </Text>
        {onOpenDay && openLabel && (
          <Pressable accessibilityRole="button" onPress={onOpenDay} hitSlop={12} style={{ marginLeft: "auto" }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11 }} color={accent}>
              {openLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {lines.map((l, i) => (
        <Text key={i} style={{ fontSize: 11.5, fontFamily: fonts.semiBold, lineHeight: 17 }} color={colors.inkMuted}>
          {`· ${l}`}
        </Text>
      ))}
    </Animated.View>
  );
}
