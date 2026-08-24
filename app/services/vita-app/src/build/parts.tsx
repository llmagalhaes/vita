/**
 * APP-118 — the only chrome the two v4.2 builders share (handoff §2/§3, §5 tokens).
 *
 * Deliberately three components and one table. The food builder and the training
 * builder have different rhythms (handoff §7: merging them was rejected), so
 * anything past the shell, the count row and the phase question belongs to one
 * builder and lives in its own file.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Keyboard, ScrollView, TextInput, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { BackButton, KeyboardAvoider, PressScale, Text, colors, fonts, motion } from "../ui";

/**
 * APP-132 — the shell's scroll view, handed to the fields inside it.
 *
 * `KeyboardAvoider` only SHRINKS the viewport (Android edge-to-edge here never
 * gets `adjustResize`, see `src/ui/keyboard.tsx`); it does not move a field that
 * the keyboard now covers. Nothing else in the app scrolls a field into view, so
 * this is the one mechanism: measure the field against the keyboard's own top and
 * scroll the difference.
 */
const ShellScroll = createContext<{ view: RefObject<ScrollView | null>; offset: { current: number } } | null>(null);

/**
 * `const f = useFieldVisible()` → `<TextInput ref={f.ref} onFocus={f.onFocus} />`.
 * A no-op outside a `BuilderShell`, or when the keyboard is not up (hardware
 * keyboard, tests).
 */
export function useFieldVisible() {
  const ctx = useContext(ShellScroll);
  const ref = useRef<TextInput>(null);
  const onFocus = useCallback(() => {
    // ponytail: one timeout instead of a keyboard subscription per field — focus
    // fires BEFORE the keyboard frame exists, and 320ms is past both platforms'
    // show animation. Raise it if a slow device ever measures too early.
    setTimeout(() => {
      const view = ctx?.view.current;
      const node = ref.current;
      const keyboardTop = Keyboard.metrics?.()?.screenY;
      if (!view || !keyboardTop || typeof node?.measureInWindow !== "function") return;
      node.measureInWindow((_x, y, _w, h) => {
        const hidden = y + h + 16 - keyboardTop; // 16 = breathing room under the field
        if (hidden > 0) view.scrollTo({ y: (ctx?.offset.current ?? 0) + hidden, animated: true });
      });
    }, 320);
  }, [ctx]);
  return { ref, onFocus };
}

/**
 * Full-screen builder shell: canvas, the Plan-Setup header (back · eyebrow ·
 * step label) and a keyboard-aware scroll body. Both builders are ScrollViews
 * full of small inputs and Android edge-to-edge does not apply `adjustResize`
 * (see `src/ui/keyboard.tsx`) — `KeyboardAvoider` is the mechanism that works.
 */
export function BuilderShell({
  eyebrow,
  step,
  onBack,
  backLabel,
  children,
}: {
  eyebrow: string;
  /** Right-hand step label. Empty on the first phase (handoff `bmStepLbl`). */
  step?: string;
  /** One button for "back a step" and "leave" alike — the phase decides. */
  onBack: () => void;
  backLabel: string;
  children: ReactNode;
}) {
  const view = useRef<ScrollView>(null);
  const offset = useRef(0);
  const scroll = useMemo(() => ({ view, offset }), []);

  return (
    <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
      <ShellScroll.Provider value={scroll}>
        <ScrollView
          ref={view}
          onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 22, paddingBottom: 60, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* ponytail: the app-wide BackButton (42px, CEO batch #8) rather than the
                handoff's 34px circle — one back button, one size, everywhere. */}
            <BackButton onPress={onBack} label={backLabel} />
            <Text
              variant="caption"
              style={{ flex: 1, textAlign: "center", fontFamily: fonts.extraBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase" }}
              color={colors.labelMuted}
            >
              {eyebrow}
            </Text>
            <View style={{ width: 42, alignItems: "flex-end" }}>
              <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11 }} color={colors.labelMuted}>
                {step ?? ""}
              </Text>
            </View>
          </View>
          {children}
        </ScrollView>
      </ShellScroll.Provider>
    </KeyboardAvoider>
  );
}

/** The 27px phase question and its quiet sub (handoff §5 "Pergunta de fase"). */
export function PhaseQuestion({ text, sub }: { text: string; sub?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: fonts.semiBold, fontSize: 27, lineHeight: 32.4, letterSpacing: -0.2 }} color={colors.inkHeading}>
        {text}
      </Text>
      {sub ? (
        <Text variant="caption" style={{ fontSize: 13, lineHeight: 19 }} color={colors.muted}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * `3 4 5 6 +` (meals) / `1 2 3 4 5 +` (sessions). Above the base row the current
 * value joins the row as an extra, selected chip; the `+` climbs to `max` and
 * disappears there (criteria 3 and 15).
 */
export function CountChips({
  values,
  value,
  onChange,
  max = 10,
  height = 58,
  fontSize = 20,
  plusWidth = 50,
  plusLabel = "+",
}: {
  /** The base chips, always shown. */
  values: number[];
  value: number;
  onChange: (n: number) => void;
  /** Ceiling of the `+` button — 10 meals, 10 sessions. */
  max?: number;
  height?: number;
  fontSize?: number;
  plusWidth?: number;
  plusLabel?: string;
}) {
  const base = Math.max(...values);
  const chips = value > base ? [...values, value] : values;
  return (
    <View style={{ flexDirection: "row", gap: 9 }}>
      {chips.map((n) => {
        const selected = n === value;
        return (
          <PressScale
            key={n}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={String(n)}
            onPress={() => onChange(n)}
            style={{
              flex: 1,
              height,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? colors.dark.bg : colors.card,
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.borderControlStrong,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize }} color={selected ? colors.dark.ink : colors.inkMuted}>
              {n}
            </Text>
          </PressScale>
        );
      })}
      {value < max && (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={plusLabel}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={{
            width: plusWidth,
            height,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: colors.dashedBorder,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize }} color={colors.inkMuted}>
            {plusLabel}
          </Text>
        </PressScale>
      )}
    </View>
  );
}

/**
 * "Fill in the calories for me" / "Work it out for me" — the quiet estimate
 * control both builders wear (handoff §2.4, CEO Round-16 #4). Deliberately NOT
 * the CTA of its screen: it is one of two ways to fill a column, the other being
 * typing the number yourself.
 *
 * Working state is `vtBreath` — the box swells 7% and back, 1.6s, forever. No
 * spinner, no percentage, no step log: the app is not narrating itself.
 */
export function EstimateAction({
  busy,
  label,
  working,
  onPress,
}: {
  busy: boolean;
  label: string;
  working: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!busy) return;
    scale.value = withRepeat(
      withTiming(motion.vtBreath.toScale, { duration: motion.vtBreath.durationMs / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => void (scale.value = 1);
  }, [busy, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const box = { height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" } as const;

  if (busy) {
    return (
      <Animated.View accessibilityRole="progressbar" style={[box, { backgroundColor: colors.well }, style]}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.muted}>
          {working}
        </Text>
      </Animated.View>
    );
  }
  return (
    <PressScale
      accessibilityRole="button"
      onPress={onPress}
      style={{ ...box, backgroundColor: colors.card, borderWidth: 1.5, borderColor: "rgba(120,100,75,0.18)" }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.inkMuted}>
        {label}
      </Text>
    </PressScale>
  );
}

/**
 * Meal slots by priority (handoff §2.2). Not a table per count: `n` meals are
 * the `n` highest-priority slots, handed back in clock order — so every count
 * from 3 to 10 produces names a person recognises, instead of "Meal 7".
 *
 * These are seeds for a field the user immediately edits, so they stay data
 * here rather than i18n chrome.
 */
export const MSLOT: [name: string, time: string, priority: number][] = [
  ["Breakfast", "07:00", 0],
  ["Morning snack", "09:30", 4],
  ["Late morning", "11:00", 8],
  ["Lunch", "12:30", 1],
  ["Early afternoon", "14:30", 9],
  ["Afternoon snack", "16:00", 3],
  ["Pre-workout", "17:30", 6],
  ["Dinner", "19:30", 2],
  ["Post-workout", "20:30", 7],
  ["Supper", "21:30", 5],
];

/** The `n` most important meal slots, in clock order. `n` is clamped to 1…10. */
export function skel(n: number): [name: string, time: string][] {
  return MSLOT.slice()
    .sort((a, b) => a[2] - b[2])
    .slice(0, Math.max(1, Math.min(10, n)))
    .sort((a, b) => MSLOT.indexOf(a) - MSLOT.indexOf(b))
    .map(([name, time]) => [name, time]);
}
