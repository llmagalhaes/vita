/**
 * A view-mode plan item row (APP-087): dot · name · tappable qty pill · ~kcal.
 * Honors the persisted usual swap (effectiveName/effectiveUnit/effectivePerUnit)
 * and the day-scoped portion overlay (qty passed in). Tapping opens PortionPop.
 * Kept presentational so Today's meal cards render item rows identical to the
 * Eating Plan doc screen.
 */
import { Pressable, View } from "react-native";
import { effectiveName, effectivePerUnit, effectiveUnit, isAdLib, qtyLabel } from "./compute";
import type { PlanItem } from "../api/client";
import { Text, colors, fonts, tint, useAccent } from "../ui";

export function ItemRow({
  item,
  qty,
  last,
  onPress,
}: {
  item: PlanItem;
  qty: number;
  last?: boolean;
  onPress?: () => void;
}) {
  const accent = useAccent();
  const per = effectivePerUnit(item);
  const adlib = isAdLib(item);
  const kcal = per?.kcal != null ? Math.round(per.kcal * qty) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 11,
        opacity: pressed ? 0.6 : 1,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "rgba(120,100,75,0.07)",
      })}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#E8B48C" }} />
      <Text variant="label" style={{ flex: 1, fontSize: 14, fontFamily: fonts.semiBold }} color="#4A4238">
        {effectiveName(item)}
      </Text>
      <View style={{ backgroundColor: tint(accent, 10), borderRadius: 11, paddingVertical: 4, paddingHorizontal: 9 }}>
        <Text variant="caption" style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={accent}>
          {/* à vontade: no number — show the raw unit phrase ("as much as you like"). */}
          {adlib ? (effectiveUnit(item) ?? "") : qtyLabel(effectiveUnit(item), qty)}
        </Text>
      </View>
      {kcal != null ? (
        <Text variant="caption" style={{ fontSize: 12.5, minWidth: 44, textAlign: "right" }} color={colors.muted}>
          ~{kcal}
        </Text>
      ) : null}
    </Pressable>
  );
}
