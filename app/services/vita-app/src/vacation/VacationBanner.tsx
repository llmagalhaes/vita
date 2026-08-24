/**
 * The Day panel's vacation banner (prototype lines 331–336) — the surface the CEO
 * flagged missing on device round 2: with a trip running, only the accents flipped
 * to sea and nothing SAID vacation. A sea-gradient card with the sun glyph, the
 * duration · keep-water line, and End (same confirm as the Library row).
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { ConfirmSheet, Text, colors, fonts, mixOklab, showToast, useAccent } from "../ui";
import { endVacation, getVacation, isVacationActive } from "../db/vacation";
import { useLogVersion } from "../db/notify";

const SunGlyph = ({ color }: { color: string }) => (
  <Svg width={17} height={17}>
    <Circle cx={8.5} cy={8.5} r={3.2} fill="none" stroke={color} strokeWidth={1.5} />
    <Path
      d="M8.5 1.5 v1.9 M8.5 13.6 v1.9 M1.5 8.5 h1.9 M13.6 8.5 h1.9 M3.6 3.6 l1.3 1.3 M12.1 12.1 l1.3 1.3 M13.4 3.6 l-1.3 1.3 M3.6 13.4 l1.3 -1.3"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </Svg>
);

export function VacationBanner() {
  const { t } = useTranslation();
  const version = useLogVersion();
  void version; // plain kv reads — re-evaluated on every log change
  const accent = useAccent(); // the sea tone while a trip runs
  const [endOpen, setEndOpen] = useState(false);
  if (!isVacationActive()) return null;

  const vac = getVacation();
  const sub = `${t(`vacation.duration.${vac.duration}`)} · ${t(vac.keepWater ? "library.away.keepingWater" : "library.away.allPaused")}`;
  return (
    <Animated.View entering={FadeInDown.duration(350)} exiting={FadeOut.duration(220)}>
      <LinearGradient
        colors={[colors.vacation.bannerFrom, colors.vacation.bannerTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 11,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: mixOklab(accent, 32),
          paddingVertical: 12,
          paddingHorizontal: 15,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: "#FFFDF7", alignItems: "center", justifyContent: "center" }}>
          <SunGlyph color={accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color={colors.vacation.ink}>
            {t("vacation.title")}
          </Text>
          <Text style={{ fontSize: 11.5, marginTop: 1 }} color={colors.vacation.inkSoft}>
            {sub}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEndOpen(true)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 13,
            borderRadius: 15,
            backgroundColor: "#FFFDF7",
            boxShadow: "0 4px 10px rgba(62,143,163,0.14)",
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={accent}>
            {t("library.away.end")}
          </Text>
        </Pressable>
      </LinearGradient>
      <ConfirmSheet
        visible={endOpen}
        title={t("library.away.endConfirmTitle")}
        message={t("library.away.endConfirmBody")}
        confirmLabel={t("library.away.end")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          endVacation();
          setEndOpen(false);
          showToast(t("library.away.endedToast"));
        }}
        onClose={() => setEndOpen(false)}
      />
    </Animated.View>
  );
}
