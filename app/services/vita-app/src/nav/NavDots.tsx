/**
 * The v3 navigation dot strip (APP-084) — the complete 6-position map that sits
 * above every tab: the word "TODAY" then 5 dots (Home · Trends · Workout · Habits
 * · Integrations). The active position stretches to a 16px accent pill; the word
 * turns accent when Today is active. A one-time "SWIPE" hint trails the last dot
 * until the user has swiped (kv nav.swiped). Tapping any position navigates.
 *
 * Mounted once in (main)/_layout, gated to tab screens with no sheet open — the
 * same visibility rule as the capture pill.
 */
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { FadeOut, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, fonts, useAnySheetOpen, useAccent, Text } from "../ui";
import { TAB_ROUTES, tabIndex } from "./TabsPager";
import { isNavSwiped, setNavSwiped } from "../db/plan";

// ponytail: fixed top offset matching the prototype's 844 canvas (no
// SafeAreaProvider mounted). Swap for `useSafeAreaInsets().top + 6` if one lands.
const TOP = 46;

function Dot({ active, accent, onPress, label }: { active: boolean; accent: string; onPress: () => void; label: string }) {
  const w = useSharedValue(active ? 16 : 5);
  const c = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    w.value = withTiming(active ? 16 : 5, { duration: 300 });
    c.value = withTiming(active ? 1 : 0, { duration: 300 });
  }, [active, w, c]);
  const style = useAnimatedStyle(() => ({
    width: w.value,
    backgroundColor: interpolateColor(c.value, [0, 1], [colors.dotIdle, accent]),
  }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10}>
      <Animated.View style={[{ height: 5, borderRadius: 3 }, style]} />
    </Pressable>
  );
}

export function NavDots() {
  const { t } = useTranslation();
  const router = useRouter();
  const accent = useAccent();
  const pathname = usePathname();
  const active = tabIndex(pathname);
  const anySheet = useAnySheetOpen();
  const swiped = isNavSwiped();

  // TODAY word colour tween.
  const todayC = useSharedValue(active === 0 ? 1 : 0);
  useEffect(() => {
    todayC.value = withTiming(active === 0 ? 1 : 0, { duration: 300 });
  }, [active, todayC]);
  const wordStyle = useAnimatedStyle(() => ({ color: interpolateColor(todayC.value, [0, 1], [colors.labelMuted, accent]) }));

  if (active < 0 || anySheet) return null;

  const go = (i: number) => {
    setNavSwiped();
    if (TAB_ROUTES[i] !== pathname) router.replace(TAB_ROUTES[i]);
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: TOP, left: 0, right: 0, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("nav.today")} onPress={() => go(0)} hitSlop={10} style={{ paddingRight: 3 }}>
          <Animated.Text style={[{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase" }, wordStyle]}>
            {t("nav.today")}
          </Animated.Text>
        </Pressable>
        {[1, 2, 3, 4, 5].map((i) => (
          <Dot key={i} active={i === active} accent={accent} onPress={() => go(i)} label={TAB_ROUTES[i]!} />
        ))}
        {!swiped ? (
          <Animated.View exiting={FadeOut}>
            <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", paddingLeft: 3 }} color={colors.labelMuted}>
              {t("nav.swipe")}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
