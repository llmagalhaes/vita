/**
 * The "+N more" searchable substitution sheet (APP-086 §5.4). Rides the app's one
 * SheetOverlay chrome (drag-dismiss, keyboard lift). Shows the full swaps list for
 * one item as radio rows over a case-insensitive name filter; the ORIGINAL restore
 * row is pinned first and always visible regardless of the filter. Selecting a row
 * closes the sheet and reports the chosen swap index (or null = restore original).
 */
import { useMemo, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import type { PlanItem, SwapOption } from "../api/client";
import { SheetOverlay, Text, colors, fonts, tint, useAccent } from "../ui";

/** The quantity fragment of a swap/item: "150 g" · "1 unit" · "as much as you like". */
export function swapQty(quantity?: number, unit?: string): string {
  return (quantity != null ? `${quantity} ${unit ?? ""}`.trim() : unit?.trim()) ?? "";
}

/** "{name} · {qty}" for a swap; the qty part is dropped when the swap has none. */
export function swapLabel(name: string, quantity?: number, unit?: string): string {
  const q = swapQty(quantity, unit);
  return q ? `${name} · ${q}` : name;
}

/**
 * One radio row shared by the inline list and the sheet. `selected` fills the
 * circle with the accent + a white check. `original` right-aligns the ORIGINAL tag.
 */
export function SwapRadioRow({
  label,
  selected,
  original,
  onPress,
}: {
  label: string;
  selected: boolean;
  original?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          width: 15,
          height: 15,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? accent : "transparent",
          borderWidth: selected ? 0 : 1.5,
          borderColor: "rgba(120,100,75,0.3)",
        }}
      >
        {selected ? (
          <Svg width={9} height={9} viewBox="0 0 10 10">
            <Path d="M1.5 5 L4 7.5 L8.5 2.5" fill="none" stroke="#FFF9F1" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <Text variant="label" style={{ flex: 1, fontSize: 12, fontFamily: fonts.semiBold }} color="#6E6355">
        {label}
      </Text>
      {original ? (
        <Text style={{ fontFamily: fonts.extraBold, fontSize: 9.5, letterSpacing: 0.7, textTransform: "uppercase" }} color={colors.labelMuted}>
          {t("planSetup.original")}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SwapSheet({
  item,
  selectedIndex,
  onSelect,
  onClose,
}: {
  item: PlanItem;
  /** Currently chosen swap index (null = original). */
  selectedIndex: number | null;
  /** Report a chosen swap index, or null to restore the original. Closes on call. */
  onSelect: (index: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  const [query, setQuery] = useState("");
  const swaps = item.swaps ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return swaps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (q ? s.name.toLowerCase().includes(q) : true));
  }, [query, swaps]);

  const renderRow = (entry: { s: SwapOption; i: number }) => (
    <SwapRadioRow
      label={swapLabel(entry.s.name, entry.s.quantity, entry.s.unit)}
      selected={selectedIndex === entry.i}
      onPress={() => onSelect(entry.i)}
    />
  );

  return (
    <SheetOverlay visible onClose={onClose} closeLabel={t("common.cancel")} lift>
      <View style={{ gap: 4 }}>
        <Text variant="title" style={{ fontSize: 17 }}>
          {item.name}
        </Text>
        <Text variant="caption" style={{ fontSize: 11.5 }} color={colors.muted}>
          {t("planSetup.sheetCaption", { n: swaps.length })}
        </Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("planSetup.searchSwaps")}
        placeholderTextColor={colors.labelMuted}
        accessibilityLabel={t("planSetup.searchSwaps")}
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: "rgba(120,100,75,0.16)",
          borderRadius: 14,
          paddingVertical: 10,
          paddingHorizontal: 14,
          fontFamily: fonts.semiBold,
          fontSize: 14,
          color: colors.ink,
        }}
      />
      {/* Original restore row — pinned, always visible regardless of the filter. */}
      <SwapRadioRow
        label={swapLabel(item.name, item.quantity, item.unit)}
        selected={selectedIndex == null}
        original
        onPress={() => onSelect(null)}
      />
      <View style={{ height: 1, backgroundColor: tint(accent, 8, colors.sheet) }} />
      <FlatList
        data={filtered}
        keyExtractor={(entry) => String(entry.i)}
        renderItem={({ item: entry }) => renderRow(entry)}
        style={{ maxHeight: 320 }}
        keyboardShouldPersistTaps="handled"
      />
    </SheetOverlay>
  );
}
