/**
 * APP-098 — one meal node of "Your day" (prototype lines 533–583).
 *
 * Collapsed: name + state tag + composition sub-line + ~kcal badge. A meal that is
 * **planned and already due** gets the accent border and the inline "As planned" /
 * "Adjust" row; a meal later in the day says "· later today" and offers nothing to
 * confirm — Vita never records something that hasn't happened.
 *
 * Expanded: the option chips ("any of these is on plan"), one row per item (tap →
 * the portion modal, which rides PopOverlay so it centers on the SCREEN, not on the
 * tall Day scroll content) and "Didn't have this meal".
 *
 * Every write goes through the APP-094 model: state changes are `recordMeals`
 * (deterministic entry ids, idempotent), composition tweaks are `setOverlay` — the
 * **day-scoped** overlay, never `PUT /plan/portions`. Undo on every one of them.
 *
 * **Two rendering modes, and the split is the whole correctness story.** Before a meal
 * is recorded the card renders the PLAN under today's overlay (`composeItems`) — the
 * overlay is the pre-record tweak surface. Once it HAS a record, the card renders the
 * record: a record is self-describing (R7), and for a capture delta it is the only
 * place the swap the user spoke exists at all — `src/capture/delta.ts` deliberately
 * never writes the overlay. Adjusting a recorded meal therefore edits its own items;
 * re-deriving from the plan would silently put the white rice back.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { MacroTotals, MealItem, PlanItem, PlanMeal } from "../../api/client";
import { recordMeals, setOverlay } from "../../db/dayRecord";
import { deleteEntry } from "../../db/entries";
import { logChanged } from "../../db/notify";
import { effectiveName, effectiveQuantity, effectiveUnit, isAdLib, itemTotals, qtyLabel } from "../../plan/compute";
import { PortionPop } from "../../plan/PortionPop";
import {
  Chevron,
  PopOverlay,
  PressScale,
  Text,
  colors,
  fonts,
  hit,
  mixOklab,
  radii,
  shadowCard,
  shadowCta,
  useAccent,
} from "../../ui";
import { showToast } from "../../ui/toast";
import {
  buildMealRecord,
  composeItems,
  emptyOverlay,
  mealEntryId,
  optionIndexFor,
  sumTotals,
  type DayOverlay,
  type MealRecord,
  type MealState,
} from "../record";


/** Base composition is chip `-1`: `options[-1]` is undefined, which APP-094's
 *  `optionIndexFor` already reads as "the meal's own items". No sentinel type needed. */
export const BASE_OPTION = -1;

const TAG: Record<"done" | "adjusted" | "skipped", { bg: string; ink: string }> = {
  done: { bg: colors.green.bg, ink: colors.green.ink },
  adjusted: { bg: colors.amber.bg, ink: colors.amber.ink },
  skipped: { bg: colors.sandChip, ink: colors.muted },
};

const kcalOf = (items: PlanItem[]): number => items.reduce((a, it) => a + itemTotals(it).kcal, 0);

export type ItemRowData = {
  /** The item under today's swap lens — priced and labelled like the plan screen. */
  lens: PlanItem;
  id?: string;
  qty: number;
  kcal: number;
  skipped: boolean;
  swapped: boolean;
};

/** Every plan item of a meal (base + options) by its stable id. */
function planItemsById(meal: PlanMeal): Map<string, PlanItem> {
  const by = new Map<string, PlanItem>();
  for (const src of [meal.items, ...(meal.options ?? []).map((o) => o.items)]) {
    for (const it of src) if (it.id != null) by.set(it.id, it);
  }
  return by;
}

/**
 * The rows of a meal that HAS a record — read straight off the record's own items, so
 * the card's kcal is the same number the hero, MacrosCard and Trends read, and a
 * captured swap shows as the food that was actually eaten.
 *
 * The synthetic `lens` exists only so the shared row/PortionPop rendering keeps working:
 * a record item stores TOTALS at its recorded quantity, so per-unit is totals ÷ qty.
 * ponytail: no `portion` bounds are carried over — the plan item's bounds are in the
 * PLAN item's unit space and a swapped item lives in another; `portionRange(qty)` is
 * always coherent with the number on screen.
 */
export function recordRows(rec: MealRecord, meal: PlanMeal): ItemRowData[] {
  const planned = planItemsById(meal);
  return rec.items.map((it) => {
    const qty = it.quantity ?? 1;
    const per = (v: number | undefined) => (qty > 0 ? (v ?? 0) / qty : 0);
    const base = it.replacesItemId != null ? planned.get(it.replacesItemId) : undefined;
    const lens: PlanItem = {
      name: it.name,
      quantity: qty,
      ...(it.unit ? { unit: it.unit } : {}),
      nutritionPerUnit: { kcal: per(it.kcal), proteinG: per(it.proteinG), carbsG: per(it.carbsG), fatG: per(it.fatG) },
      ...(it.replacesItemId != null ? { id: it.replacesItemId } : {}),
    };
    return {
      lens,
      ...(it.replacesItemId != null ? { id: it.replacesItemId } : {}),
      qty,
      kcal: Math.round(it.kcal ?? 0),
      skipped: false, // a record lists what happened; a skipped item simply isn't in it
      swapped: base != null && effectiveName(base) !== it.name,
    };
  });
}

/** One record item re-priced to a new quantity (its macros are totals, so they scale). */
const scaleItem = (it: MealItem, qty: number): MealItem => {
  const q0 = it.quantity ?? 1;
  const f = q0 > 0 ? qty / q0 : 0;
  return {
    ...it,
    quantity: qty,
    kcal: (it.kcal ?? 0) * f,
    proteinG: (it.proteinG ?? 0) * f,
    carbsG: (it.carbsG ?? 0) * f,
    fatG: (it.fatG ?? 0) * f,
  };
};

/** The rows of a meal's composition today: the picked option, with swaps/qty/skips applied. */
export function itemRows(meal: PlanMeal, ov: DayOverlay): ItemRowData[] {
  const oi = optionIndexFor(meal, ov);
  const src = oi != null ? meal.options![oi]!.items : meal.items;
  return src.map((item) => {
    const id = item.id;
    const sw = id != null ? ov.swap[id] : undefined;
    const lens: PlanItem = sw ? { ...item, swaps: [sw], usualSwapIndex: 0 } : item;
    const qty = (id != null ? ov.qty[id] : undefined) ?? effectiveQuantity(lens);
    return {
      lens,
      ...(id != null ? { id } : {}),
      qty,
      kcal: Math.round(itemTotals(lens, qty).kcal),
      skipped: id != null && ov.skip[id] === true,
      swapped: sw != null,
    };
  });
}

function Check({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size}>
      <Path d="M2.5 7 l3 3 L10.5 3.5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MealNode({
  date,
  meal,
  state,
  due,
  overlay,
  record,
  dailyTotals,
  expanded,
  onToggle,
}: {
  date: string;
  meal: PlanMeal;
  state: MealState;
  due: boolean;
  overlay: DayOverlay;
  /** The meal's day record, when it has one — the undo target. */
  record?: MealRecord;
  /** The plan's day totals under today's portions — the portion modal's live card. */
  dailyTotals: Required<MacroTotals>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const accent = useAccent();
  // `qty` is the LIVE slider value. For a recorded meal the write happens once, on
  // close (one undoable action) — the overlay is not the store any more.
  const [sel, setSel] = useState<{ row: number; openQty: number; qty: number } | null>(null);

  // A recorded meal renders from its record; only a still-unrecorded one renders the
  // plan under the overlay. A `skipped` record has no items, so the card still lists
  // what was planned (struck through) while every number reads 0 — which is the truth.
  const fromRecord = record != null && record.items.length > 0;
  const rows = fromRecord ? recordRows(record, meal) : itemRows(meal, overlay);
  const oi = record
    ? record.planOptionIndex != null && meal.options?.[record.planOptionIndex]
      ? record.planOptionIndex
      : undefined
    : optionIndexFor(meal, overlay);
  const kcal = Math.round(record ? record.totals.kcal : sumTotals(composeItems(meal, overlay)).kcal);
  const tag = state === "planned" ? null : TAG[state];
  const selRow = sel ? rows[sel.row] : null;

  // ── writes ─────────────────────────────────────────────────────────────────
  /** Put the meal's record back exactly as it was (or remove it if there was none). */
  const restore = () => {
    if (record) recordMeals([record]);
    else if (meal.id != null) deleteEntry(mealEntryId(date, meal.id)), logChanged();
  };

  const write = (next: "done" | "skipped" | "adjusted", ov: DayOverlay = overlay) =>
    recordMeals([buildMealRecord(date, meal, next, ov)]);

  const confirm = () => {
    write("done");
    showToast(t("timeline.meal.confirmedToast", { name: meal.name }), { undo: restore });
  };

  const skipMeal = () => {
    write("skipped");
    onToggle(); // the prototype collapses the card on skip
    showToast(t("timeline.meal.skippedToast", { name: meal.name }), { undo: restore });
  };

  /**
   * Patch today's overlay. A meal that is already recorded is re-recorded as
   * `adjusted` so the entry always describes what the card shows (APP-094 R7).
   */
  const patchOverlay = (patch: Partial<DayOverlay>, toast: string) => {
    const before = { ...emptyOverlay(), ...overlay };
    const next = setOverlay(date, patch);
    if (state === "done" || state === "adjusted") write("adjusted", next);
    showToast(toast, {
      undo: () => {
        setOverlay(date, before);
        if (record) recordMeals([record]);
      },
    });
  };

  const pickOption = (index: number) =>
    meal.id != null &&
    patchOverlay(
      { option: { ...overlay.option, [meal.id]: index } },
      t("timeline.meal.adjustedToast", { name: meal.name }),
    );

  /**
   * Re-record a meal that ALREADY has a record, from its own items. Never
   * `buildMealRecord` — that re-derives from the plan composition and would throw away
   * a swap the user captured by voice (the capture path never touches the overlay).
   */
  const writeRecordItems = (items: MealItem[], toast: string) => {
    const before = record!;
    recordMeals([{ ...before, state: items.length === 0 ? "skipped" : "adjusted", items, totals: sumTotals(items) }]);
    showToast(toast, { undo: () => recordMeals([before]) });
  };

  const changeQty = (qty: number) => {
    setSel((s) => (s ? { ...s, qty } : s));
    // Pre-record: the overlay IS the store, and writing it live keeps the plan's daily
    // totals card in the pop moving with the slider.
    if (!fromRecord && selRow?.id != null) setOverlay(date, { qty: { ...overlay.qty, [selRow.id]: qty } });
  };

  const skipItem = (item: ItemRowData) => {
    const row = sel?.row;
    setSel(null);
    const toast = t("timeline.portion.skippedToast", { name: effectiveName(item.lens) });
    if (fromRecord && row != null) return writeRecordItems(record!.items.filter((_, i) => i !== row), toast);
    if (item.id == null) return;
    patchOverlay({ skip: { ...overlay.skip, [item.id]: true } }, toast);
  };

  /** Closing the modal is where a portion change becomes one undoable action. */
  const closePortion = () => {
    // `overlay` is the parent's fresh prop — every slider commit re-rendered this node.
    if (sel && selRow && sel.qty !== sel.openQty) {
      const toast = t("timeline.meal.adjustedToast", { name: meal.name });
      if (fromRecord) {
        writeRecordItems(
          record!.items.map((it, i) => (i === sel.row ? scaleItem(it, sel.qty) : it)),
          toast,
        );
      } else if (selRow.id != null) {
        const before = { ...emptyOverlay(), ...overlay, qty: { ...overlay.qty, [selRow.id]: sel.openQty } };
        if (state === "done" || state === "adjusted") write("adjusted");
        showToast(toast, {
          undo: () => {
            setOverlay(date, before);
            if (record) recordMeals([record]);
          },
        });
      }
    }
    setSel(null);
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.card,
        borderWidth: state === "planned" && due ? 1.5 : 1,
        borderColor: state === "planned" && due ? mixOklab(accent, 32, colors.card) : colors.borderFaint,
        opacity: state === "skipped" ? 0.6 : 1,
        ...shadowCard,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={meal.name}
        onPress={onToggle}
        style={{ paddingVertical: 13, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <Text
              style={{ fontFamily: fonts.bold, fontSize: 15, textDecorationLine: state === "skipped" ? "line-through" : "none" }}
              color={colors.inkHeading}
            >
              {meal.name}
            </Text>
            {tag ? (
              <View style={{ backgroundColor: tag.bg, borderRadius: radii.chipTight, paddingVertical: 2, paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: fonts.extraBold, fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase" }} color={tag.ink}>
                  {t(`timeline.tag.${state}`)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, marginTop: 1 }} color={colors.faint} numberOfLines={1}>
            {(oi != null ? meal.options![oi]!.name : t(rows.length === 1 ? "timeline.itemsOne" : "timeline.itemsMany", { n: rows.length })) +
              (state === "planned" && !due ? t("timeline.laterToday") : "")}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.amber.bg, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 11.5 }} color={colors.amber.ink}>
            {t("timeline.kcal", { n: kcal.toLocaleString("en-US") })}
          </Text>
        </View>
        <Chevron open={expanded} flip color={colors.muted} />
      </Pressable>

      {state === "planned" && due ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 13 }}>
          <PressScale
            accessibilityRole="button"
            onPress={confirm}
            style={{
              flex: 1.4,
              height: hit.button,
              borderRadius: hit.button / 2,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
              ...shadowCta(accent),
            }}
          >
            <Check color="#FFF9F1" />
            <Text style={{ fontFamily: fonts.bold, fontSize: 13.5 }} color="#FFF9F1">
              {t("timeline.meal.confirm")}
            </Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            onPress={() => {
              if (!expanded) onToggle();
            }}
            style={{
              flex: 1,
              height: hit.button,
              borderRadius: hit.button / 2,
              borderWidth: 1.5,
              borderColor: colors.borderControlStrong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 13 }} color={colors.inkMuted}>
              {t("timeline.meal.adjust")}
            </Text>
          </PressScale>
        </Animated.View>
      ) : null}

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            borderStyle: "dashed",
            marginHorizontal: 16,
            paddingTop: 11,
            paddingBottom: 13,
            gap: 2,
          }}
        >
          {meal.options?.length ? (
            <View style={{ gap: 7, paddingBottom: 9 }}>
              <Text style={{ fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }} color={colors.faint}>
                {t("timeline.meal.options")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {[{ i: BASE_OPTION, name: meal.name, kcal: meal.kcal ?? kcalOf(meal.items) }, ...meal.options.map((o, i) => ({ i, name: o.name, kcal: o.kcal ?? kcalOf(o.items) }))].map(
                  (c) => {
                    const on = (oi ?? BASE_OPTION) === c.i;
                    return (
                      <PressScale
                        key={c.i}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => pickOption(c.i)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 15,
                          borderWidth: 1.5,
                          borderColor: on ? colors.dark.bg : colors.borderControl,
                          backgroundColor: on ? colors.dark.bg : colors.card,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Text style={{ fontFamily: fonts.bold, fontSize: 12 }} color={on ? colors.dark.ink : colors.inkMuted}>
                          {c.name}
                        </Text>
                        <Text style={{ fontSize: 10, opacity: 0.65 }} color={on ? colors.dark.ink : colors.inkMuted}>
                          ~{Math.round(c.kcal).toLocaleString("en-US")}
                        </Text>
                      </PressScale>
                    );
                  },
                )}
              </View>
            </View>
          ) : null}

          {rows.map((r, i) => {
            // Record rows are addressed by position, so an off-plan item (no plan id)
            // in a recorded meal is still adjustable.
            const tappable = (fromRecord || r.id != null) && !r.skipped && !isAdLib(r.lens);
            return (
              <Pressable
                key={r.id ?? i}
                accessibilityRole="button"
                accessibilityLabel={effectiveName(r.lens)}
                disabled={!tappable}
                onPress={() => setSel({ row: i, openQty: r.qty, qty: r.qty })}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.borderFaint,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.peachSoft }} />
                <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text
                    style={{ fontFamily: fonts.semiBold, fontSize: 13.5, textDecorationLine: r.skipped ? "line-through" : "none" }}
                    color={colors.inkHeading}
                  >
                    {effectiveName(r.lens)}
                  </Text>
                  {r.swapped ? (
                    <View style={{ backgroundColor: mixOklab(accent, 10, colors.card), borderRadius: radii.chipTight, paddingVertical: 2, paddingHorizontal: 6 }}>
                      <Text style={{ fontFamily: fonts.extraBold, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase" }} color={accent}>
                        {t("timeline.swapped")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontFamily: fonts.bold, fontSize: 11.5 }} color={colors.muted}>
                  {isAdLib(r.lens) ? (effectiveUnit(r.lens) ?? "") : qtyLabel(effectiveUnit(r.lens), r.qty)}
                </Text>
                <Text style={{ fontSize: 11, minWidth: 50, textAlign: "right" }} color={colors.faint}>
                  {r.skipped ? "—" : t("timeline.kcal", { n: r.kcal.toLocaleString("en-US") })}
                </Text>
              </Pressable>
            );
          })}

          {state !== "skipped" && due ? (
            <Text
              accessibilityRole="button"
              onPress={skipMeal}
              style={{ alignSelf: "flex-start", fontFamily: fonts.semiBold, fontSize: 11.5, textDecorationLine: "underline", paddingTop: 8 }}
              color={colors.faint}
            >
              {t("timeline.meal.skip")}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      <PopOverlay visible={sel != null} onClose={closePortion} closeLabel={t("common.cancel")}>
        {sel && selRow ? (
          <PortionPop
            item={selRow.lens}
            qty={sel.qty}
            openQty={sel.openQty}
            mealName={meal.name}
            {...(meal.time ? { mealTime: meal.time } : {})}
            dailyTotals={dailyTotals}
            onChangeQty={changeQty}
            onSkip={() => skipItem(selRow)}
            onClose={closePortion}
          />
        ) : null}
      </PopOverlay>
    </View>
  );
}
