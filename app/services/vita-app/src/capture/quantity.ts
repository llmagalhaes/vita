/**
 * Quantity steppers for photo-parsed meal items (APP-020). Nutrition scales
 * linearly with quantity; raw (unrounded) values are kept so stepping is exactly
 * reversible — rounding happens only at display.
 */
import type { MacroTotals, MealItem } from "../api";

const scale = (v: number | undefined, f: number) => (v == null ? v : v * f);

/** Step an item's quantity by delta (min 1), scaling kcal + macros linearly. */
export function stepItem(item: MealItem, delta: number): MealItem {
  const q = item.quantity ?? 1;
  const nq = Math.max(1, q + delta);
  const f = nq / q;
  return {
    ...item,
    quantity: nq,
    kcal: item.kcal * f,
    proteinG: scale(item.proteinG, f),
    carbsG: scale(item.carbsG, f),
    fatG: scale(item.fatG, f),
  };
}

/** Recompute meal totals from items (server recomputes too; this keeps the card live). */
export function mealTotals(items: MealItem[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      proteinG: (t.proteinG ?? 0) + (i.proteinG ?? 0),
      carbsG: (t.carbsG ?? 0) + (i.carbsG ?? 0),
      fatG: (t.fatG ?? 0) + (i.fatG ?? 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
