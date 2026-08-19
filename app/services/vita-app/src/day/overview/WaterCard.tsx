/**
 * APP-097 — Overview · Water (prototype lines 445–472 + the "Exact water" modal).
 *
 * Tap the card to unfold today's drinks; `+250 ml` logs one; "Add an exact amount →"
 * opens the centered modal where the slider (50–1000 step 50) and the typed field
 * (clamped 0–2000) are equal citizens — dual input everywhere, non-negotiable.
 */
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { WaterDetail } from "../../api/client";
import type { LocalEntry } from "../../db/entries";
import {
  Chevron,
  PopOverlay,
  PressScale,
  Text,
  colors,
  fonts,
  radii,
  shadowModal,
  Slider,
  useAccent,
  useStartOnLayout,
} from "../../ui";
import { showToast } from "../../ui/toast";
import { WATER_FILL_MS, WATER_QUICK_ML, WATER_SLIDER, addWater, clampTypedMl, waterPct } from "../water";
import { BigValue, MicroLabel, cardSurfaceRaised } from "./parts";

const VESSEL_W = 54;
const VESSEL_H = 82;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The filling tank. Height animates in px (an animated %-height never applied on the
 *  new Android arch) — the vessel is fixed-height, so px is exact anyway. */
function Vessel({ ml }: { ml: number }) {
  const px = (waterPct(ml) / 100) * VESSEL_H;
  const h = useSharedValue(0);
  const [started, setStarted] = useState(false);
  const onLayout = useStartOnLayout(() => {
    h.value = withTiming(px, { duration: WATER_FILL_MS });
    setStarted(true);
  });
  useEffect(() => {
    if (started) h.value = withTiming(px, { duration: WATER_FILL_MS });
  }, [px, h, started]);
  const fill = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <View
      onLayout={onLayout}
      style={{ width: VESSEL_W, height: VESSEL_H, borderRadius: 19, backgroundColor: colors.green.track, overflow: "hidden" }}
    >
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: "hidden" }, fill]}>
        <LinearGradient colors={[colors.green.fillSoft, colors.green.fill]} style={{ flex: 1 }} />
      </Animated.View>
      <Svg width={16} height={18} style={{ position: "absolute", left: 19, top: 31 }}>
        <Path d="M8 1.5 C8 1.5 2.8 8 2.8 11.4 a5.2 5.2 0 0 0 10.4 0 C13.2 8 8 1.5 8 1.5 Z" fill="rgba(255,253,247,0.85)" />
      </Svg>
    </View>
  );
}

/** The centered "Add water" modal — slider AND typed field, both authoritative. */
function ExactWaterPop({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (ml: number) => void }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [ml, setMl] = useState(WATER_QUICK_ML);
  const live = useSharedValue(WATER_QUICK_ML);
  useEffect(() => {
    if (visible) {
      setMl(WATER_QUICK_ML);
      live.value = WATER_QUICK_ML;
    }
  }, [visible, live]);

  const commit = (next: number) => {
    setMl(next);
    live.value = next;
  };

  return (
    <PopOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ backgroundColor: colors.card, borderRadius: radii.modal, padding: 17, borderWidth: 1, borderColor: "rgba(120,100,75,0.08)", gap: 13, ...shadowModal }}>
        <Text variant="title" style={{ fontSize: 16 }}>
          {t("day.water.exactTitle")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Slider
              value={ml}
              live={live}
              min={WATER_SLIDER.min}
              max={WATER_SLIDER.max}
              step={WATER_SLIDER.step}
              onCommit={commit}
              accessibilityLabel={t("day.water.exactTitle")}
            />
          </View>
          <TextInput
            value={String(ml)}
            keyboardType="number-pad"
            onChangeText={(txt) => commit(clampTypedMl(Number(txt.replace(/[^0-9]/g, "")) || 0))}
            accessibilityLabel={t("day.water.typedLabel")}
            style={{
              borderWidth: 1,
              borderColor: colors.borderControlStrong,
              backgroundColor: colors.input,
              borderRadius: 12,
              paddingVertical: 9,
              width: 64,
              textAlign: "center",
              fontFamily: fonts.bold,
              fontSize: 14,
              color: colors.ink,
            }}
          />
          <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.muted}>
            {t("common.ml")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <PressScale
            accessibilityRole="button"
            onPress={onClose}
            style={{ flex: 1, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderControlStrong, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkMuted}>
              {t("common.cancel")}
            </Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            onPress={() => onAdd(ml)}
            style={{ flex: 1.2, height: 44, borderRadius: 22, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">
              {t("day.water.add")}
            </Text>
          </PressScale>
        </View>
      </View>
    </PopOverlay>
  );
}

export function WaterCard({ totalMl, drinks }: { totalMl: number; drinks: LocalEntry[] }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [open, setOpen] = useState(false);
  const [exact, setExact] = useState(false);

  const log = (ml: number) => {
    addWater(ml);
    showToast(t("day.water.added", { ml: ml.toLocaleString("en-US"), total: (totalMl + ml).toLocaleString("en-US") }));
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t("day.water.label")} onPress={() => setOpen((o) => !o)} style={{ flex: 1.05 }}>
        <Animated.View layout={LinearTransition.duration(220)} style={{ ...cardSurfaceRaised, padding: 15, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 13, alignItems: "center" }}>
            <Vessel ml={totalMl} />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <MicroLabel>{t("day.water.label")}</MicroLabel>
                <Chevron open={open} flip />
              </View>
              <BigValue>{t("day.water.value", { ml: totalMl.toLocaleString("en-US") })}</BigValue>
              <PressScale
                accessibilityRole="button"
                onPress={() => log(WATER_QUICK_ML)}
                scale={0.94}
                style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 13, borderRadius: radii.chip, backgroundColor: colors.green.bg }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={colors.green.ink}>
                  {t("day.water.quickAdd", { ml: WATER_QUICK_ML })}
                </Text>
              </PressScale>
            </View>
          </View>

          {open && (
            <Animated.View
              entering={FadeIn.duration(250)}
              style={{ borderTopWidth: 1, borderStyle: "dashed", borderTopColor: colors.divider, paddingTop: 10, gap: 7 }}
            >
              {drinks.map((w) => (
                <View key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green.fill }} />
                  <Text variant="caption" numberOfLines={1} style={{ fontFamily: fonts.semiBold, fontSize: 11.5, flex: 1, minWidth: 0 }} color={colors.inkMuted}>
                    {t("day.water.value", { ml: ((w.detail as WaterDetail).amountMl ?? 0).toLocaleString("en-US") })}
                  </Text>
                  <Text variant="caption" style={{ fontSize: 11.5, flexShrink: 0 }} color={colors.faint}>
                    {timeOf(w.occurredAt)}
                  </Text>
                </View>
              ))}
              <Pressable accessibilityRole="button" onPress={() => setExact(true)} style={{ alignSelf: "flex-start" }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={accent}>
                  {t("day.water.exactLink")}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>

      <ExactWaterPop
        visible={exact}
        onClose={() => setExact(false)}
        onAdd={(ml) => {
          setExact(false);
          log(ml);
        }}
      />
    </>
  );
}
