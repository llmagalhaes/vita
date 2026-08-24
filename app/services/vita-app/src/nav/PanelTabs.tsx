/**
 * v4 panel tabs (APP-096) — the frosted segmented control floating at `top:48`
 * over all three panels, plus the one-time swipe hint that lives in the Day panel.
 *
 * README §1 "Panel tabs" + prototype lines 118–121 / `panTabs` (line 1481):
 * container `rgba(255,253,247,.55)` blur 14 saturate 1.4, border `rgba(120,100,75,.12)`,
 * r20, padding 3, shadow `0 8px 22px rgba(50,38,26,.12)`; active chip `#FFFDF7` r16
 * 6×13 + `0 3px 8px rgba(105,84,60,.14)`; label 9.5/800 uppercase ls 1.2, active ink
 * = accent, idle `#8A7E70`. On the dark scene (scenic evening on Day) the whole set
 * flips to the dark variant. All values come from `tokens.panelTabs`.
 */
import { Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import Animated, { FadeOut, interpolateColor, useAnimatedStyle, useDerivedValue, withTiming } from "react-native-reanimated";
import { colors, fonts, letterSpacing, panelTabs, shadowPanelTabs, shadowTab, Text, useAccent } from "../ui";
import { appBlurTarget } from "../ui/blurTarget";
import { usePortal } from "../ui/popHost";
import { isNavSwiped } from "../db/plan";

const TOP = 48;
const TAB_KEYS = ["trends", "day", "library"] as const;
const TWEEN = { duration: 300 }; // prototype `transition:all .3s`

/**
 * Android blur ladder (APP-096 D1). CEO device round 2 (2026-08-24): the plain
 * translucent fill read as washed-out/"apagado" — real blur is now the default
 * (same `experimentalBlurMethod` the SheetBackdrop uses).
 * ponytail: one boolean, not a settings surface.
 */
const ANDROID_BLUR = true;
const blurOn = Platform.OS !== "android" || ANDROID_BLUR;

function Tab({ label, active, dark, accent, onPress }: { label: string; active: boolean; dark: boolean; accent: string; onPress: () => void }) {
  const variant = dark ? panelTabs.dark : panelTabs.light;
  const activeInk = dark ? panelTabs.dark.activeInk : accent;
  const activeBg = variant.activeBg;
  // Fade from a fully transparent copy of the active fill (not "transparent",
  // which interpolates through black and greys the chip mid-tween).
  const idleBg = "rgba(255,253,247,0)";
  const p = useDerivedValue(() => withTiming(active ? 1 : 0, TWEEN), [active]);
  const chip = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [idleBg, activeBg]) }));
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [variant.idleInk, activeInk]) }));
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} onPress={onPress}>
      <Animated.View
        style={[
          {
            borderRadius: panelTabs.chipRadius,
            paddingVertical: panelTabs.chipPadV,
            paddingHorizontal: panelTabs.chipPadH,
          },
          active && !dark ? shadowTab : null,
          chip,
        ]}
      >
        <Animated.Text
          style={[
            { fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: letterSpacing.micro, textTransform: "uppercase" },
            ink,
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export function PanelTabs({ panel, dark, onPick }: { panel: number; dark: boolean; onPick: (i: number) => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const variant = dark ? panelTabs.dark : panelTabs.light;
  const inner = (
    <>
      {TAB_KEYS.map((k, i) => (
        <Tab key={k} label={t(`shell.panels.${k}`)} active={panel === i} dark={dark} accent={accent} onPress={() => onPick(i)} />
      ))}
    </>
  );
  const shell = {
    flexDirection: "row",
    gap: 2,
    borderRadius: panelTabs.radius,
    padding: panelTabs.padding,
    borderWidth: 1,
    borderColor: variant.border,
    overflow: "hidden",
  } as const;

  // Portaled to the app-root PopHost: on Android the BlurView blurs `appBlurTarget`,
  // and a blur view INSIDE its own target makes hwui recurse until the RenderThread
  // stack overflows (device-verified SIGSEGV). The host sits outside the target.
  return usePortal(
    <View pointerEvents="box-none" style={{ position: "absolute", top: TOP, left: 0, right: 0, alignItems: "center", zIndex: 50 }}>
      <View style={shadowPanelTabs}>
        {blurOn ? (
          <BlurView
            intensity={panelTabs.light.blur}
            tint={dark ? "dark" : "light"}
            blurReductionFactor={1}
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={appBlurTarget}
            style={[shell, { backgroundColor: variant.bg }]}
          >
            {inner}
          </BlurView>
        ) : (
          // Android fallback: the same translucent fill, no blur. Reads as frosted
          // over the calm canvas; over the evening scene it reads as a dark glass chip.
          <View style={[shell, { backgroundColor: variant.bg }]}>{inner}</View>
        )}
      </View>
    </View>,
  );
}

/**
 * The one-time hint the Day panel shows until the first successful edge-swipe
 * (`nav.swiped` kv, shared with the retired v3 dot strip). Rendered by the Day
 * panel so it scrolls with the content, exactly like the prototype (line 328).
 */
export function SwipeHint() {
  const { t } = useTranslation();
  if (isNavSwiped()) return null;
  return (
    <Animated.View exiting={FadeOut}>
      <Text
        style={{
          textAlign: "center",
          fontFamily: fonts.extraBold,
          fontSize: 9,
          letterSpacing: letterSpacing.micro,
          textTransform: "uppercase",
          marginTop: 2,
        }}
        color={colors.faint}
      >
        {t("shell.swipeHint")}
      </Text>
    </Animated.View>
  );
}
