/**
 * APP-120 — phase `count` (handoff v4.2 §2.2).
 *
 * One question, the chip row, and a preview of the skeleton the answer produces.
 * The preview exists so the count is not an abstract number: 7 is "Breakfast …
 * Supper", not "Meal 7".
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Text, colors, fonts, shadowWaterCard } from "../../ui";
import { CountChips, PhaseQuestion, skel } from "../parts";

export function CountPhase({ n, onN, onStart }: { n: number; onN: (n: number) => void; onStart: () => void }) {
  const { t } = useTranslation();
  const rows = skel(n);
  return (
    <View style={{ gap: 18 }}>
      <PhaseQuestion text={t("build.plan.count.question")} sub={t("build.plan.count.sub")} />
      <CountChips values={[3, 4, 5, 6]} value={n} onChange={onN} />

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 26,
          padding: 18,
          borderWidth: 1,
          borderColor: colors.borderFaint,
          ...shadowWaterCard,
        }}
      >
        {rows.map(([name, time]) => (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.peachSoft }} />
            <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 14 }} color={colors.ink}>
              {name}
            </Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={colors.labelMuted}>
              {time}
            </Text>
          </View>
        ))}
        <Text style={{ fontSize: 11, lineHeight: 16 }} color={colors.labelMuted}>
          {t("build.plan.count.previewFooter")}
        </Text>
      </View>

      <Button label={t("build.plan.count.cta", { n })} onPress={onStart} />
    </View>
  );
}
