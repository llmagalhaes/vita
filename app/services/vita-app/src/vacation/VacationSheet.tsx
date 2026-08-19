/**
 * Vacation mode sheet (APP-030 → APP-103, prototype lines 1184–1202).
 *
 * v4 dropped the two date fields and the trip-habit list: the sheet is two
 * duration chips + one "keep the water card" switch + Start. The duration IS the
 * range, so "This week" expires by itself (db/vacation.ts) — nothing to sweep.
 * Starting flips the accent to the sea tone and reschedules notifications through
 * the single notifier gate.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SheetOverlay, Text, Toggle, colors, fonts, radii, shadowCta, showToast } from "../ui";
import { getVacation, startVacation, type VacationDuration } from "../db/vacation";

const SEA = colors.vacationAccent;
const DURATIONS: VacationDuration[] = ["thisWeek", "untilEnded"];

export function VacationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState<VacationDuration>(getVacation().duration);
  const [keepWater, setKeepWater] = useState(getVacation().keepWater);

  const start = () => {
    startVacation(duration, keepWater);
    onClose();
    showToast(t("library.away.startedToast"));
  };

  return (
    <SheetOverlay visible={visible} onClose={onClose} closeLabel={t("common.cancel")}>
      <View style={{ gap: 13 }}>
        <Text variant="title" style={{ fontSize: 16 }}>{t("vacation.title")}</Text>
        <Text variant="caption" style={{ fontSize: 12.5, marginTop: -6, lineHeight: 19 }} color={colors.muted}>
          {t("vacation.subtitle")}
        </Text>

        {/* duration chips — the prototype's `vacDurChips` (dark = picked) */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          {DURATIONS.map((d) => {
            const on = duration === d;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setDuration(d)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 15,
                  borderWidth: 1.5,
                  borderColor: on ? colors.dark.bg : colors.borderControl,
                  backgroundColor: on ? colors.dark.bg : colors.card,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12.5 }} color={on ? colors.dark.ink : colors.inkMuted}>
                  {t(`vacation.duration.${d}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* keep the water card — real behaviour: the card and its reminder stay live */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: colors.card,
            borderRadius: radii.innerBlockTight,
            paddingVertical: 12,
            paddingHorizontal: 15,
            borderWidth: 1,
            borderColor: colors.borderFaint,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 13.5 }}>{t("vacation.keepWater")}</Text>
            <Text variant="caption" style={{ fontSize: 11.5, marginTop: 1 }} color={colors.muted}>
              {t("vacation.keepWaterSub")}
            </Text>
          </View>
          <Toggle on={keepWater} onToggle={() => setKeepWater((v) => !v)} onColor={SEA} accessibilityLabel={t("vacation.keepWater")} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={start}
          style={{ height: 48, borderRadius: 24, backgroundColor: SEA, alignItems: "center", justifyContent: "center", ...shadowCta(SEA) }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 14.5 }} color="#F2FAFC">{t("vacation.start")}</Text>
        </Pressable>
      </View>
    </SheetOverlay>
  );
}
