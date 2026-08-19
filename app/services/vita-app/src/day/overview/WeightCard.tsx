/**
 * APP-097 — Overview · Weight (prototype lines 504–518 + the "Log weight" modal).
 *
 * A value and where it came from. `+` opens the centered manual modal: slider
 * 60–100 step 0.1 **and** a typed field clamped 30–200 — either one is a real entry
 * (dual input). The reading is written under `weight:<date>`, so logging twice
 * corrects today rather than stacking readings; the toast offers undo.
 */
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path, Rect } from "react-native-svg";
import { useSharedValue } from "react-native-reanimated";
import {
  PopOverlay,
  PressScale,
  Slider,
  Text,
  colors,
  fonts,
  radii,
  shadowModal,
  useAccent,
} from "../../ui";
import { showToast } from "../../ui/toast";
import {
  WEIGHT_DEFAULT,
  WEIGHT_SLIDER,
  clampTypedKg,
  recordWeight,
  roundKg,
  todaysWeight,
  type WeightReading,
} from "../weight";
import { BigValue, MicroLabel, cardSurface } from "./parts";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ScaleGlyph() {
  return (
    <Svg width={16} height={16}>
      <Rect x={1.5} y={3} width={13} height={10} rx={3} fill="none" stroke={colors.amber.ink} strokeWidth={1.5} />
      <Path d="M8 3 v3.5 M5.4 6.5 h5.2" fill="none" stroke={colors.amber.ink} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function LogWeightPop({ visible, onClose, seed }: { visible: boolean; onClose: () => void; seed: number }) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [kg, setKg] = useState(seed);
  const live = useSharedValue(seed);
  useEffect(() => {
    if (visible) {
      setKg(seed);
      live.value = seed;
    }
  }, [visible, seed, live]);

  const commit = (next: number) => {
    const v = roundKg(next);
    setKg(v);
    live.value = v;
  };

  const save = () => {
    const { undo } = recordWeight(kg);
    onClose();
    showToast(t("day.weight.savedToast", { kg: kg.toFixed(1) }), { undo });
  };

  return (
    <PopOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ backgroundColor: colors.card, borderRadius: radii.modal, padding: 17, borderWidth: 1, borderColor: "rgba(120,100,75,0.08)", gap: 13, ...shadowModal }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text variant="title" style={{ fontSize: 16 }}>
            {t("day.weight.modalTitle")}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>
            {t("day.weight.value", { kg: kg.toFixed(1) })}
          </Text>
        </View>
        <Slider
          value={kg}
          live={live}
          min={WEIGHT_SLIDER.min}
          max={WEIGHT_SLIDER.max}
          step={WEIGHT_SLIDER.step}
          onCommit={commit}
          accessibilityLabel={t("day.weight.modalTitle")}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput
            value={String(kg)}
            keyboardType="decimal-pad"
            onChangeText={(txt) => commit(clampTypedKg(Number(txt.replace(",", ".").replace(/[^0-9.]/g, "")) || 0))}
            accessibilityLabel={t("day.weight.typedLabel")}
            style={{
              borderWidth: 1,
              borderColor: colors.borderControlStrong,
              backgroundColor: colors.input,
              borderRadius: 12,
              paddingVertical: 9,
              width: 74,
              textAlign: "center",
              fontFamily: fonts.bold,
              fontSize: 14,
              color: colors.ink,
            }}
          />
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, flex: 1 }} color={colors.muted}>
            {t("day.weight.dualHint")}
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
            onPress={save}
            style={{ flex: 1.2, height: 44, borderRadius: 22, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">
              {t("day.weight.save")}
            </Text>
          </PressScale>
        </View>
      </View>
    </PopOverlay>
  );
}

export function WeightCard({ latest }: { latest: WeightReading | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Seed from today's reading if there is one, else the last one, else the neutral start.
  const seed = todaysWeight()?.kg ?? latest?.kg ?? WEIGHT_DEFAULT;

  return (
    <>
      <View style={{ ...cardSurface, paddingVertical: 15, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.well, alignItems: "center", justifyContent: "center" }}>
          <ScaleGlyph />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <MicroLabel>{t("day.weight.label")}</MicroLabel>
          <View style={{ marginTop: 2 }}>
            <BigValue>{latest ? t("day.weight.value", { kg: latest.kg.toFixed(1) }) : "—"}</BigValue>
          </View>
          <Text style={{ fontSize: 11, marginTop: 1 }} color={colors.faint}>
            {latest ? t("day.weight.sourceManual", { time: timeOf(latest.at) }) : t("day.weight.sourceNone")}
          </Text>
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t("day.weight.modalTitle")}
          onPress={() => setOpen(true)}
          scale={0.9}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.well, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 18 }} color={colors.amber.ink}>
            +
          </Text>
        </PressScale>
      </View>

      <LogWeightPop visible={open} onClose={() => setOpen(false)} seed={seed} />
    </>
  );
}
