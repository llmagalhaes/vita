/**
 * APP-097 — the scenic Day header (README §2 "Scenic scenes", prototype lines 295–330).
 *
 * A 180deg A/B/C gradient per daytime with a sun (moon at evening), two hill paths and
 * 8 stars that fade in on the dark scene, then the "sheet cap" seam that rolls the
 * canvas over the scene. Every value comes from `tokens.scenes` / `tokens.scenic` —
 * nothing is redefined here.
 *
 * **Parallax runs entirely on the UI thread**: the panel's `useAnimatedScrollHandler`
 * writes `scrollY`, and the sun/hill/star layers read it in a worklet
 * (`translateY = min(340, y) × 0.38`). The prototype's 1px-threshold `setState` is
 * deliberately NOT ported (plan risk R2) — there is zero per-frame React work here.
 */
import { View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import {
  PressScale,
  Text,
  fonts,
  letterSpacing,
  scenes,
  scenic,
  shadowCap,
  typeScale,
  type SceneName,
} from "../ui";

/** The 8 stars, verbatim from the prototype's `viewBox 0 0 390 80` star field. */
const STARS = [
  { cx: 40, cy: 26, r: 1.4, o: 1 },
  { cx: 92, cy: 50, r: 1.1, o: 0.8 },
  { cx: 150, cy: 20, r: 1.3, o: 0.9 },
  { cx: 240, cy: 34, r: 1.2, o: 0.7 },
  { cx: 300, cy: 18, r: 1.5, o: 1 },
  { cx: 345, cy: 44, r: 1.1, o: 0.8 },
  { cx: 200, cy: 12, r: 1, o: 0.6 },
  { cx: 120, cy: 66, r: 1, o: 0.5 },
] as const;

/** Person glyph — the prototype's header button into the Library (where Account lives). */
function AccountGlyph({ ink }: { ink: string }) {
  return (
    <Svg width={18} height={18}>
      <Circle cx={9} cy={6.4} r={3} fill="none" stroke={ink} strokeWidth={1.6} />
      <Path d="M3.6 15 a5.5 4.6 0 0 1 10.8 0" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function ScenicHeader({
  scene,
  scrollY,
  name,
  dateStr,
  hero,
}: {
  scene: SceneName;
  /** Scroll offset in px, written by the panel's UI-thread scroll handler. */
  scrollY: SharedValue<number>;
  name: string;
  dateStr: string;
  /** Absent when the meals domain is off — the scene keeps only greeting + date. */
  hero?: { kcal: number; planKcal: number; countsLine: string };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const sc = scenes[scene];

  // min(340, y) × 0.38 — imagery exits at ~0.62× scroll speed, the cap slides over it.
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.min(scenic.parallax.maxScroll, scrollY.value) * scenic.parallax.factor }],
  }));
  const starOpacity = useDerivedValue(() => withTiming(sc.dark ? 1 : 0, { duration: scenic.stars.fadeMs }), [sc.dark]);
  const starStyle = useAnimatedStyle(() => ({ opacity: starOpacity.value }));

  return (
    <View>
      <LinearGradient
        colors={[sc.a, sc.b, sc.c]}
        locations={scenic.gradientStops as unknown as [number, number, number]}
        // Cancels the panel's 88/20 content padding so the scene bleeds edge to edge.
        style={{ marginTop: -88, marginHorizontal: -20, overflow: "hidden" }}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: 0, top: 0, right: 0, height: 80 }, parallax, starStyle]}
        >
          <Svg width="100%" height={80} viewBox="0 0 390 80">
            {STARS.map((s) => (
              <Circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} fill={scenic.stars.color} opacity={s.o} />
            ))}
          </Svg>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height: scenic.hills.viewBox.height }, parallax]}
        >
          <Svg
            width="100%"
            height={scenic.hills.viewBox.height}
            viewBox={`0 0 ${scenic.hills.viewBox.width} ${scenic.hills.viewBox.height}`}
            preserveAspectRatio="none"
          >
            <Circle cx={scenic.sun.cx} cy={scenic.sun.cy} r={scenic.sun.haloR} fill={sc.sun} opacity={scenic.sun.haloOpacity} />
            <Circle cx={scenic.sun.cx} cy={scenic.sun.cy} r={scenic.sun.r} fill={sc.sun} opacity={scenic.sun.opacity} />
            <Path d={scenic.hills.front.d} fill={sc.hill1} opacity={scenic.hills.front.opacity} />
            <Path d={scenic.hills.back.d} fill={sc.hill2} />
          </Svg>
        </Animated.View>

        <View style={{ paddingTop: 88, paddingHorizontal: 24, paddingBottom: 96 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 20 }} color={sc.ink} numberOfLines={1}>
                {t(`day.greeting.${scene}`, { name })}
              </Text>
              <Text style={{ fontFamily: fonts.semiBold, fontSize: 12.5, marginTop: 1, opacity: 0.8 }} color={sc.ink}>
                {dateStr}
              </Text>
            </View>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={t("day.openLibrary")}
              onPress={() => router.replace("/library")}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(255,253,247,0.26)",
                borderWidth: 1,
                borderColor: "rgba(255,253,247,0.32)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AccountGlyph ink={sc.ink} />
            </PressScale>
          </View>

          {hero && (
            <View style={{ alignItems: "center", paddingTop: 14 }}>
              <Text
                style={{
                  fontFamily: fonts.extraLight,
                  fontSize: typeScale.heroScenic,
                  letterSpacing: letterSpacing.heroScenic,
                  lineHeight: typeScale.heroScenic,
                }}
                color={sc.ink}
              >
                {hero.kcal.toLocaleString("en-US")}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.semiBold,
                  fontSize: 13,
                  marginTop: 5,
                  opacity: 0.92,
                  textShadowColor: scenic.textShadow,
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 8,
                }}
                color={sc.ink}
              >
                {t("day.heroSub", { plan: hero.planKcal.toLocaleString("en-US") })}
              </Text>
              <View
                style={{
                  marginTop: 9,
                  backgroundColor: scenic.glassChip.bg,
                  borderWidth: 1,
                  borderColor: scenic.glassChip.border,
                  borderRadius: scenic.glassChip.radius,
                  paddingVertical: scenic.glassChip.padV,
                  paddingHorizontal: scenic.glassChip.padH,
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={sc.ink}>
                  {hero.countsLine}
                </Text>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* The "rolling card" seam: the canvas rides up over the scene. */}
      <View
        style={{
          height: scenic.sheetCap.height,
          backgroundColor: scenic.sheetCap.bg,
          borderTopLeftRadius: scenic.sheetCap.radius,
          borderTopRightRadius: scenic.sheetCap.radius,
          marginTop: scenic.sheetCap.marginTop,
          marginHorizontal: scenic.sheetCap.marginX,
          marginBottom: scenic.sheetCap.marginBottom,
          ...shadowCap,
        }}
      />
    </View>
  );
}
