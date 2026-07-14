/**
 * Pure local recompute for the eating plan. An item's nutrition is
 * `quantity × nutritionPerUnit`; a meal is the sum of its items; the plan's
 * daily totals are the sum of its meals. The Eating Plan screen recomputes these
 * live as the user drags the portion slider — no server round-trip per edit.
 */
import type { EatingPlanDraft, MacroTotals, PlanItem, PlanMeal } from "../api/client";

const ZERO: Required<MacroTotals> = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const add = (a: Required<MacroTotals>, b: MacroTotals): Required<MacroTotals> => ({
  kcal: a.kcal + (b.kcal ?? 0),
  proteinG: a.proteinG + (b.proteinG ?? 0),
  carbsG: a.carbsG + (b.carbsG ?? 0),
  fatG: a.fatG + (b.fatG ?? 0),
});

/** Nutrition for one item = per-unit × quantity (quantity defaults to 1). */
export function itemTotals(item: PlanItem): Required<MacroTotals> {
  const per = item.nutritionPerUnit;
  if (!per) return { ...ZERO };
  const q = item.quantity ?? 1;
  return { kcal: (per.kcal ?? 0) * q, proteinG: (per.proteinG ?? 0) * q, carbsG: (per.carbsG ?? 0) * q, fatG: (per.fatG ?? 0) * q };
}

export const mealTotals = (meal: PlanMeal): Required<MacroTotals> =>
  meal.items.reduce((t, it) => add(t, itemTotals(it)), { ...ZERO });

export const planDailyTotals = (plan: EatingPlanDraft): Required<MacroTotals> =>
  plan.meals.reduce((t, m) => add(t, mealTotals(m)), { ...ZERO });

/** Slider bounds for a portion: 0 → ~2-3× the current quantity, sensible step. */
export function portionRange(quantity: number | undefined): { min: number; max: number; step: number } {
  const q = quantity && quantity > 0 ? quantity : 1;
  if (q >= 20) return { min: 0, max: Math.ceil((q * 2) / 5) * 5, step: 5 };
  return { min: 0, max: Math.max(Math.ceil(q * 3), 4), step: 0.25 };
}
