import { createContext, useContext, type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { Text, colors, fonts, mixOklab, motion, radii, shadowCard, useAccent, useStartOnLayout } from "../ui";
import { ScrubOverlay } from "./scrub";
import { avgLinePct, barGap, barHeightPct, tipLeftPct } from "./series";

/** Bars fade to 38% while another one is pinned; colour/opacity cross in .2s (§5). */
const DIM = 0.38;
const XFADE_MS = 200;
/** Below-average deviation pill (prototype `#EEF1E9` / `#6E7A63`) — the only two v4.1 colours tokens doesn't carry yet. */
const belowAvg = { bg: "#EEF1E9", ink: "#6E7A63" } as const;

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
export function GrowBar({
  pct,
  color,
  delay = 0,
  active = false,
  dim = false,
  style,
}: {
  pct: number;
  color: string;
  delay?: number;
  /** The pinned bar — crosses to the accent in .2s. */
  active?: boolean;
  /** Another bar is pinned — this one recedes to 38%. */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = useAccent();
  const target = Math.max(0, Math.min(100, pct));
  const h = useSharedValue(0);
  const on = useSharedValue(active ? 1 : 0);
  const op = useSharedValue(dim ? DIM : 1);
  const started = useRef(false);
  const onLayout = useStartOnLayout(() => {
    h.value = withDelay(delay, withTiming(target, { duration: 550 })); // vtGrowY .55s
    started.current = true;
  });
  useEffect(() => {
    if (started.current) h.value = withTiming(target, { duration: 350, easing: Easing.bezier(0.22, 0.9, 0.32, 1) });
  }, [target, h]);
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: XFADE_MS });
    op.value = withTiming(dim ? DIM : 1, { duration: XFADE_MS });
  }, [active, dim, on, op]);
  const grow = useAnimatedStyle(() => ({
    height: `${h.value}%`,
    opacity: op.value,
    backgroundColor: interpolateColor(on.value, [0, 1], [color, accent]),
  }));
  return <Animated.View onLayout={onLayout} style={[style, grow]} />;
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
 * The pinned/scrubbed tooltip (`vtTip`). Carries the DATE only — the value lives in
 * the card header now, and the same number twice in one card is the exact thing the
 * v4.1 redesign deleted. RN has no `translateX(-50%)`, so the pill measures itself
 * once and offsets by half its own width; it stays invisible for that one frame
 * rather than flashing off-centre. The `.34,1.56,.64,1` bezier overshoots past 1 —
 * that's where the pop comes from, no spring needed.
 */
function Tip({ text, leftPct }: { text: string; leftPct: number }) {
  const accent = useAccent();
  const [w, setW] = useState(0);
  const s = useSharedValue<number>(motion.vtTip.scales[0]);
  useEffect(() => {
    s.value = withTiming(1, { duration: motion.vtTip.durationMs, easing: Easing.bezier(...motion.vtTip.bezier) });
  }, [s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ translateX: -w / 2 }, { scale: s.value }] }));
  return (
    <Animated.View
      entering={FadeIn.duration(motion.vtTip.durationMs).easing(Easing.bezier(...motion.vtTip.bezier))}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: `${leftPct}%`,
          opacity: w ? 1 : 0,
          zIndex: 2,
          backgroundColor: accent,
          borderRadius: 9,
          paddingVertical: 4,
          paddingHorizontal: 9,
        },
        pop,
      ]}
    >
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5 }} color="#FFF9F1">
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * Level 1 — the card's headline. Nothing selected: the period's average. Selected:
 * that bucket's own value plus a deviation pill. `sub` carries the coverage line
 * ("N of M days recorded") or, when pinned, the rank — the one sentence that says
 * where a day falls without judging it.
 */
export function ChartHead({
  label,
  value,
  sub,
  pill,
  above,
  onClear,
  clearLabel,
}: {
  label: string;
  value: string;
  sub: string;
  /** `+340 vs avg` — omitted for a bucket with no record. */
  pill?: string;
  /** Above the average → accent tint; below → the quiet green-grey. */
  above?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const accent = useAccent();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <SectionLabel>{label}</SectionLabel>
        {onClear && clearLabel ? (
          <Pressable accessibilityRole="button" onPress={onClear} hitSlop={12}>
            <Text
              style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase" }}
              color={colors.faint}
            >
              {clearLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: fonts.light, fontSize: 27, letterSpacing: -0.7, lineHeight: 32 }} color={colors.inkHeading}>
          {value}
        </Text>
        {pill ? (
          <Animated.View
            entering={FadeIn.duration(motion.vtPop.durationMs)
              .easing(Easing.bezier(...motion.ease))
              .withInitialValues({ opacity: 0, transform: [{ scale: motion.vtPop.fromScale }] })}
            style={{
              borderRadius: 9,
              paddingVertical: 3,
              paddingHorizontal: 8,
              backgroundColor: above ? mixOklab(accent, 14) : belowAvg.bg,
            }}
          >
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 10 }} color={above ? accent : belowAvg.ink}>
              {pill}
            </Text>
          </Animated.View>
        ) : null}
      </View>
      <Text style={{ fontSize: 11, fontFamily: fonts.semiBold, lineHeight: 15.4 }} color={colors.faint}>
        {sub}
      </Text>
    </View>
  );
}

export type StatCard = { key: string; label: string; value: string; sub: string; on: boolean; onPress: () => void };

/**
 * Level 3 — stat cards as NAVIGATION. Highest/Lowest pin their bar on tap and light
 * up while they own the pin; the leading card (Total on a Year count, Per week on a
 * Month) clears the pin. `flex:1` so two cards fill the row when there is no third.
 */
export function StatRow({ cards }: { cards: StatCard[] }) {
  const accent = useAccent();
  return (
    <View style={{ flexDirection: "row", gap: 7 }}>
      {cards.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          accessibilityState={{ selected: c.on }}
          onPress={c.onPress}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            borderRadius: 13,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            backgroundColor: c.on ? mixOklab(accent, 10) : colors.sheet,
            borderColor: c.on ? mixOklab(accent, 34) : colors.borderFaint,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text
            style={{ fontFamily: fonts.extraBold, fontSize: 8.5, letterSpacing: 0.7, textTransform: "uppercase" }}
            color={colors.faint}
          >
            {c.label}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} numberOfLines={1} color={colors.inkHeading}>
            {c.value}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 }} numberOfLines={1} color={colors.faint}>
            {c.sub}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** High (solid) / low (outlined) marker, 3px above its bar. Month/Year only. */
function PeakDot({ index, count, pct, color, solid }: { index: number; count: number; pct: number; color: string; solid: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: `${tipLeftPct(index, count)}%`,
        bottom: `${pct}%`,
        marginBottom: 3,
        transform: [{ translateX: -2.5 }],
        width: 5,
        height: 5,
        borderRadius: 2.5,
        borderWidth: 1.5,
        borderColor: color,
        backgroundColor: solid ? color : "transparent",
        zIndex: 1,
      }}
    />
  );
}

/**
 * Level 2 — the ANNOTATED chart: a 72px box of `flex:1` bars, the dashed average line
 * (unlabelled — the header already says the number), high/low markers on Month/Year,
 * the pinned bar in accent with the rest at 38%, an optional axis-label row, and the
 * scrub/pin overlay over the whole block (pointer handlers live on the wrapper, the
 * tooltip's 26px of padding included; bars themselves never take the pointer).
 */
export function BarChart({
  values,
  color,
  labels,
  pinned,
  tip,
  avg = 0,
  peaks,
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
  /** Average over recorded buckets — draws the dashed line. 0 hides it. */
  avg?: number;
  /** High/low marker indices — Month/Year only (seven labelled bars need no dots). */
  peaks?: { hi: number; lo: number };
  onScrub: (i: number) => void;
  onEnd: () => void;
  accessibilityLabel: string;
}) {
  const n = values.length;
  const max = Math.max(...values, 1);
  const gap = barGap(n);
  return (
    <View style={{ position: "relative", paddingTop: 26 }}>
      {/* No `key` on the Tip: it pops ONCE when a pin appears and then slides with the
          finger — re-keying it would re-fire vtTip on every bar of a 30-day drag. */}
      {tip != null && pinned != null && <Tip text={tip} leftPct={tipLeftPct(pinned, n)} />}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap }}>
        {values.map((v, i) => (
          <GrowBar
            key={i}
            pct={barHeightPct(v, max)}
            color={color}
            active={i === pinned}
            dim={pinned != null && i !== pinned}
            delay={barDelay(i, n)}
            style={{ flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }}
          />
        ))}
        {avg > 0 && (
          <Svg width="100%" height={1} pointerEvents="none" style={{ position: "absolute", left: 0, bottom: `${avgLinePct(avg, max)}%` }}>
            <Line x1="0" y1="0.5" x2="100%" y2="0.5" stroke={colors.dashedBorder} strokeWidth={1} strokeDasharray="3 3" />
          </Svg>
        )}
        {peaks && values[peaks.hi]! > 0 && (
          <>
            <PeakDot index={peaks.hi} count={n} pct={barHeightPct(values[peaks.hi]!, max)} color={color} solid />
            {peaks.lo !== peaks.hi && (
              <PeakDot index={peaks.lo} count={n} pct={barHeightPct(values[peaks.lo]!, max)} color={color} solid={false} />
            )}
          </>
        )}
      </View>
      {labels && (
        <View style={{ flexDirection: "row", paddingTop: 5, gap }}>
          {labels.map((l, i) => (
            // A 30-column row leaves ~10px per slot — a fixed-width centred Text
            // overflowing the slot keeps "30" on one line instead of stacking digits.
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text numberOfLines={1} style={{ width: 22, textAlign: "center", fontSize: 9, fontFamily: fonts.bold }} color={colors.faint}>
                {l}
              </Text>
            </View>
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
