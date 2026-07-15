import { createContext, useContext, type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Chevron, Text, colors, fonts, useStartOnLayout } from "../ui";
import { ScrubOverlay } from "./scrub";

/**
 * Focus-replay epoch (APP-052). Trends is PRE-MOUNTED by TabsPager (session-6 swipe
 * fix), so a one-shot mount animation runs once, offscreen, and the bars are already
 * static by the time the user swipes in. Trends bumps this epoch every time it
 * becomes the settled tab; `TrendCard` re-keys off it so the card fade + the bars'
 * left→right grow replay on every entry (the CEO's named bug). Bumping happens on
 * navigation settle only (never mid-gesture — the pager rule stands).
 */
export const TrendsReplayContext = createContext(0);

/** Per-window bar stagger (prototype `tDelay`): 55ms/bar for the 7-day view, 16ms for 15/30. */
export const barDelay = (i: number, count: number): number => i * (count === 7 ? 55 : 16);

/**
 * A chart bar that grows up from the bottom on mount (`vtGrowY`, Fable A3). Height
 * is a % of the parent (which justifies flex-end, so growth reads bottom-up).
 * `delay` staggers neighbours. Remounts (window change, or the Trends focus-replay
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
    style={{ fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.2, textTransform: "uppercase" }}
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
 * A Trends card: uppercase title + optional unit note + a right-hand extra
 * (e.g. a bars/curve toggle). Matches the prototype: the card is collapsed by
 * default and fades in on mount. Tapping the header opens it — only then does the
 * scrub overlay mount, so a closed card never fights the tab-swipe pager for the
 * horizontal drag (CEO bug #6). While scrubbing an open card, a readout line
 * shows and the active index is handed to `children` so bars highlight/dim.
 */
export function TrendCard({
  title,
  unitNote,
  extra,
  count,
  readout,
  footer,
  children,
  dragHint,
  delay = 0,
}: {
  title: string;
  unitNote?: string;
  extra?: ReactNode;
  count?: number;
  readout?: (index: number) => { value: string; detail: string };
  footer?: string;
  dragHint?: string;
  delay?: number;
  children: (active: number | null) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const scrubbable = count != null && count > 0;
  const read = open && active != null && readout ? readout(active) : null;
  const epoch = useContext(TrendsReplayContext); // re-key on Trends entry → replay fade + bar grow

  return (
    <Animated.View
      key={epoch}
      entering={FadeInDown.duration(420).delay(delay)}
      style={{
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(120,100,75,0.06)",
        gap: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <SectionLabel>{title}</SectionLabel>
          {scrubbable && <Chevron open={open} />}
        </View>
        {extra ?? (unitNote ? (
          <Text variant="caption" style={{ fontSize: 10.5 }} color={colors.labelMuted}>
            {unitNote}
          </Text>
        ) : null)}
      </Pressable>

      {read && (
        <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: -2 }}>
          <Text style={{ fontFamily: fonts.light, fontSize: 22, letterSpacing: -0.5 }}>{read.value}</Text>
          <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
            {read.detail}
          </Text>
          {dragHint && (
            <Text variant="caption" style={{ fontSize: 10, marginLeft: "auto" }} color={colors.labelMuted}>
              {dragHint}
            </Text>
          )}
        </Animated.View>
      )}

      <View style={{ position: "relative" }}>
        {children(active)}
        {open && count != null && count > 0 && (
          <ScrubOverlay count={count} active={active} onScrub={setActive} onEnd={() => setActive(null)} accessibilityLabel={title} />
        )}
      </View>

      {footer && (
        <Text variant="caption" style={{ fontSize: 11 }} color={colors.muted}>
          {footer}
        </Text>
      )}
    </Animated.View>
  );
}
