/**
 * APP-097 — Overview · Weight (prototype lines 504–518 + the "Log weight" modal).
 *
 * A value and where it came from. `+` opens the centered manual modal: one typed
 * field, 20–300 kg, comma or dot (R18-D — the slider stopped at 100 kg and excluded
 * people). The reading is written under `weight:<date>`, so logging twice corrects
 * today rather than stacking readings; the toast offers undo.
 */
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path, Rect } from "react-native-svg";
import {
  PopOverlay,
  PressScale,
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
  WEIGHT_TYPED,
  parsedKg,
  recordWeight,
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
  // The raw text is the state: clamping per keystroke made the field untypeable.
  const [txt, setTxt] = useState(() => seed.toFixed(1));
  useEffect(() => {
    if (visible) setTxt(seed.toFixed(1));
  }, [visible, seed]);
  const kg = parsedKg(txt);

  const save = () => {
    if (kg === null) return;
    const { undo } = recordWeight(kg);
    onClose();
    showToast(t("overview.weight.savedToast", { kg: kg.toFixed(1) }), { undo });
  };

  return (
    <PopOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ backgroundColor: colors.card, borderRadius: radii.modal, padding: 17, borderWidth: 1, borderColor: "rgba(120,100,75,0.08)", gap: 13, ...shadowModal }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text variant="title" style={{ fontSize: 16 }}>
            {t("overview.weight.modalTitle")}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color={colors.inkHeading}>
            {kg === null ? "—" : t("overview.weight.value", { kg: kg.toFixed(1) })}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TextInput
            value={txt}
            keyboardType="decimal-pad"
            selectTextOnFocus
            onChangeText={setTxt}
            accessibilityLabel={t("overview.weight.typedLabel")}
            style={{
              borderWidth: 1,
              borderColor: kg === null ? colors.amber.ink : colors.borderControlStrong,
              backgroundColor: colors.input,
              borderRadius: 12,
              paddingVertical: 11,
              width: 96,
              textAlign: "center",
              fontFamily: fonts.bold,
              fontSize: 18,
              color: colors.ink,
            }}
          />
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, flex: 1 }} color={colors.muted}>
            {t("overview.weight.hint", { min: WEIGHT_TYPED.min, max: WEIGHT_TYPED.max })}
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
            disabled={kg === null}
            style={{ flex: 1.2, height: 44, borderRadius: 22, backgroundColor: accent, alignItems: "center", justifyContent: "center", opacity: kg === null ? 0.45 : 1 }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">
              {t("overview.weight.save")}
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
          <MicroLabel>{t("overview.weight.label")}</MicroLabel>
          <View style={{ marginTop: 2 }}>
            <BigValue>{latest ? t("overview.weight.value", { kg: latest.kg.toFixed(1) }) : "—"}</BigValue>
          </View>
          <Text style={{ fontSize: 11, marginTop: 1 }} color={colors.faint}>
            {latest ? t("overview.weight.sourceManual", { time: timeOf(latest.at) }) : t("overview.weight.sourceNone")}
          </Text>
        </View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t("overview.weight.modalTitle")}
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
