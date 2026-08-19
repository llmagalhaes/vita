/**
 * APP-098 — the "Close the day" node (prototype lines 673–691). It is the final node
 * of the evening timeline and the twin of the day-close notification: both appear from
 * `recapStartHour`, both offer the same one tap.
 *
 * It never claims anything. The line names exactly which meals are still marked
 * planned; the sub-line says what happens if you walk away ("Leave it open and nothing
 * is assumed"); and the tap records only the meals that are already DUE.
 *
 * Presentational: Timeline owns the write and the undo.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { ZoomIn } from "react-native-reanimated";
import { PressScale, Text, colors, fonts, mixOklab, motion, radii, shadowCard, shadowCta, useAccent } from "../../ui";
import type { DayMeal } from "../record";

export function CloseDayCard({
  pending,
  onCloseDay,
  onLeaveOpen,
}: {
  /** Meals still marked planned AND already due — APP-094's `pendingMeals`. */
  pending: DayMeal[];
  onCloseDay: () => void;
  onLeaveOpen: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();

  const line = pending.length
    ? t("timeline.close.pending", {
        names: pending.map((m) => m.name).join(t("timeline.close.and")),
        verb: t(pending.length > 1 ? "timeline.close.verbAre" : "timeline.close.verbIs"),
      })
    : t("timeline.close.allConfirmed");

  return (
    <Animated.View
      entering={ZoomIn.duration(motion.vtPop.durationMs + 50)}
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderColor: mixOklab(accent, 35, colors.card),
        padding: 17,
        gap: 10,
        ...shadowCard,
      }}
    >
      <Text style={{ fontFamily: fonts.extraBold, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" }} color={accent}>
        {t("timeline.close.label")}
      </Text>
      <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 }} color={colors.ink}>
        {line}
      </Text>
      <Text style={{ fontSize: 11.5, lineHeight: 17 }} color={colors.muted}>
        {t("timeline.close.sub")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <PressScale
          accessibilityRole="button"
          onPress={onCloseDay}
          style={{
            flex: 1.35,
            height: 46,
            borderRadius: 23,
            backgroundColor: accent,
            alignItems: "center",
            justifyContent: "center",
            ...shadowCta(accent),
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 14 }} color="#FFF9F1">
            {t("timeline.close.cta")}
          </Text>
        </PressScale>
        <PressScale
          accessibilityRole="button"
          onPress={onLeaveOpen}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 23,
            borderWidth: 1.5,
            borderColor: colors.borderControlStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkMuted}>
            {t("timeline.close.leaveOpen")}
          </Text>
        </PressScale>
      </View>
    </Animated.View>
  );
}
