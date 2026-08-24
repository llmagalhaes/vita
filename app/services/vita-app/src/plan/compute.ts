/**
 * Pure local recompute for the eating plan. An item's nutrition is
 * `quantity × nutritionPerUnit`; a meal is the sum of its items; the plan's
 * daily totals are the sum of its meals. The Eating Plan screen recomputes these
 * live as the user drags the portion slider — no server round-trip per edit.
 *
 * Portions are a read-time lens: a sparse `{ itemId: qty }` overlay (the design's
 * `planQty`) selects an item's effective quantity; a missing key falls back to the
 * item's default `quantity`. One lens, no fork of the plan document.
 */
import type { EatingPlanDraft, MacroTotals, PlanItem, PlanMeal, SwapOption } from "../api/client";

const ZERO: Required<MacroTotals> = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const add = (a: Required<MacroTotals>, b: MacroTotals): Required<MacroTotals> => ({
  kcal: a.kcal + (b.kcal ?? 0),
  proteinG: a.proteinG + (b.proteinG ?? 0),
  carbsG: a.carbsG + (b.carbsG ?? 0),
  fatG: a.fatG + (b.fatG ?? 0),
});

/** Effective quantity for an item: portion override → effective default → 1.
 *  Default routes through the swap lens so a usual swap's stated quantity wins. */
export const qtyOf = (item: PlanItem, portions: Record<string, number> = {}): number =>
  (item.id != null ? portions[item.id] : undefined) ?? effectiveQuantity(item);

// ---- usual swap (persisted, plan-level) — §5.4 + reconciliation §2 -----------
// A chosen usual (usualSwapIndex) shows the swap's name/quantity/unit IN PLACE.
// Swaps carry NO nutrition; a substitution at its stated quantity is treated as
// equivalent to the original item's total, so the swap's per-unit macros derive
// from the equivalence formula: effectivePerUnit = base.perUnit × base.qty / swap.qty.

/** The chosen usual swap for an item, or null when the original is in use. */
export function effectiveSwap(item: PlanItem): SwapOption | null {
  const i = item.usualSwapIndex;
  return i != null && item.swaps?.[i] ? item.swaps[i]! : null;
}

/** Display name accounting for the usual swap. */
export const effectiveName = (item: PlanItem): string => effectiveSwap(item)?.name ?? item.name;

/** Effective default quantity (the swap's stated quantity when a usual is set). */
export function effectiveQuantity(item: PlanItem): number {
  const sw = effectiveSwap(item);
  return (sw ? sw.quantity : undefined) ?? item.quantity ?? 1;
}

/** Effective unit (the swap's unit when a usual is set, e.g. "à vontade"). */
export const effectiveUnit = (item: PlanItem): string | undefined => {
  const sw = effectiveSwap(item);
  return sw ? sw.unit : item.unit;
};

/**
 * True when the effective composition is "as much as you like" — a usual swap with
 * no stated quantity. Such an item has no number to adjust: the qty pill shows its
 * raw unit text, the row does NOT open PortionPop, and `boundsOf` returns null.
 */
export const isAdLib = (item: PlanItem): boolean => {
  const sw = effectiveSwap(item);
  return sw != null && sw.quantity == null;
};

/**
 * Contract 0.9.0 (D2): a HAND-BUILT item states its TOTAL kcal at its stated
 * quantity and carries no macros at all. Priced per unit here, once, so the
 * portion slider, every meal card and every daily total keep reading the single
 * `nutritionPerUnit` path — nothing downstream learns about the new field.
 */
const perUnitFromKcal = (item: PlanItem): MacroTotals | undefined => {
  const q = item.quantity ?? 1;
  return item.kcal != null && q > 0 ? { kcal: item.kcal / q } : undefined;
};

/**
 * Per-unit macros of the effective composition. Original item → its own perUnit.
 * A usual swap → the equivalence estimate (undefined when the swap has no usable
 * quantity, e.g. "as much as you like" — the app shows no number, `~` covers it).
 */
export function effectivePerUnit(item: PlanItem): MacroTotals | undefined {
  const sw = effectiveSwap(item);
  const own = item.nutritionPerUnit ?? perUnitFromKcal(item);
  if (!sw) return own;
  const per = own;
  const baseQty = item.quantity ?? 1;
  const swQty = sw.quantity;
  if (!per || swQty == null || swQty <= 0) return undefined;
  const f = baseQty / swQty;
  return { kcal: (per.kcal ?? 0) * f, proteinG: (per.proteinG ?? 0) * f, carbsG: (per.carbsG ?? 0) * f, fatG: (per.fatG ?? 0) * f };
}

/**
 * Nutrition for one item through the EFFECTIVE lens: a chosen usual swap prices in
 * its own space (effectivePerUnit × swap-space quantity), so the number agrees with
 * ItemRow and PortionPop. No swap → the item's own per-unit × quantity. Default qty
 * is the effective default quantity.
 */
export function itemTotals(item: PlanItem, qty: number = effectiveQuantity(item)): Required<MacroTotals> {
  const per = effectivePerUnit(item);
  if (!per) return { ...ZERO };
  return { kcal: (per.kcal ?? 0) * qty, proteinG: (per.proteinG ?? 0) * qty, carbsG: (per.carbsG ?? 0) * qty, fatG: (per.fatG ?? 0) * qty };
}

/** Sum a list of items through the effective lens + portion overlay. */
const itemsTotals = (items: PlanItem[], portions: Record<string, number>): Required<MacroTotals> =>
  items.reduce((t, it) => add(t, itemTotals(it, qtyOf(it, portions))), { ...ZERO });

/** A meal's BASE composition totals (its own items). */
export const mealTotals = (meal: PlanMeal, portions: Record<string, number> = {}): Required<MacroTotals> =>
  itemsTotals(meal.items, portions);

/**
 * The items of a meal's persisted-usual composition: the chosen option's items when
 * usualOptionIndex is set, else the meal's own (base) items.
 */
export const usualItems = (meal: PlanMeal): PlanItem[] => {
  const oi = meal.usualOptionIndex;
  return oi != null && meal.options?.[oi] ? meal.options[oi]!.items : meal.items;
};

/** A meal's USUAL-composition totals (base or the chosen option), effective lens. */
export const mealUsualTotals = (meal: PlanMeal, portions: Record<string, number> = {}): Required<MacroTotals> =>
  itemsTotals(usualItems(meal), portions);

/**
 * Daily totals over each meal's USUAL composition — so Today's summary and Home's
 * plan row agree with the per-meal cards (which render the usual composition).
 * Always an estimate (the caller labels it). Session-local "switch for today" option
 * changes are NOT reflected here (they don't persist — deliberate asymmetry).
 */
export const planDailyTotals = (plan: EatingPlanDraft, portions: Record<string, number> = {}): Required<MacroTotals> =>
  plan.meals.reduce((t, m) => add(t, mealUsualTotals(m, portions)), { ...ZERO });

/** Daily totals over each meal's BASE composition — the Eating Plan doc editor
 *  renders base meals, so its header sums base (matches the per-meal cards there). */
export const planBaseTotals = (plan: EatingPlanDraft, portions: Record<string, number> = {}): Required<MacroTotals> =>
  plan.meals.reduce((t, m) => add(t, mealTotals(m, portions)), { ...ZERO });

// ---- micros (fiber/sodium/iron/calcium), overlay-aware -----------------------

export type MicroTotals = { fiberG: number; sodiumMg: number; ironMg: number; calciumMg: number };

/**
 * Live daily micros summed from every item's `microsPerUnit × qty`, or `null`
 * when ANY item lacks micros data — the caller then shows the plan's static
 * daily `micros` chips instead of a sum that would silently undercount (honesty).
 */
export function planMicroTotals(plan: EatingPlanDraft, portions: Record<string, number> = {}): MicroTotals | null {
  const t: MicroTotals = { fiberG: 0, sodiumMg: 0, ironMg: 0, calciumMg: 0 };
  for (const meal of plan.meals) {
    for (const it of meal.items) {
      const m = it.microsPerUnit;
      if (!m) return null; // all-or-nothing
      const q = qtyOf(it, portions);
      t.fiberG += (m.fiberG ?? 0) * q;
      t.sodiumMg += (m.sodiumMg ?? 0) * q;
      t.ironMg += (m.ironMg ?? 0) * q;
      t.calciumMg += (m.calciumMg ?? 0) * q;
    }
  }
  return t;
}

// ---- display helpers (verbatim handoff §1.3) ---------------------------------

/** Macro bar % relative to the largest macro with 10% headroom — never hits 100. */
export function barPct(g: number, tP: number, tC: number, tF: number): number {
  const pMax = Math.max(tP, tC, tF) * 1.1 || 1;
  return Math.round((g / pMax) * 100);
}

const G_UNITS = new Set(["g", "gram", "grams"]);
const ML_UNITS = new Set(["ml", "milliliter", "milliliters", "millilitre", "millilitres"]);
const norm = (u?: string) => (u ?? "").trim().toLowerCase();

/** "180 g" · "200 ml" · "2 × egg" · "1 × slice". Measured units drop the "×". */
export const qtyLabel = (unit: string | undefined, q: number): string =>
  G_UNITS.has(norm(unit)) ? `${q} g` : ML_UNITS.has(norm(unit)) ? `${q} ml` : `${q} × ${unit || "unit"}`;

/** "~1,756" — the "~" estimate marker is mandatory (product philosophy). */
export const kcalLabel = (tK: number): string => "~" + Math.round(tK).toLocaleString("en-US");

/**
 * Portion slider bounds: server-authoritative when present, else a heuristic from the
 * effective default quantity. `null` for an "as much as you like" usual swap — there
 * is no number to adjust (the backend omits bounds too; the row won't open the pop).
 */
export const boundsOf = (item: PlanItem): { min: number; max: number; step: number } | null =>
  isAdLib(item) ? null : (item.portion ?? portionRange(effectiveQuantity(item)));

/** Slider bounds fallback for items without server bounds (e.g. edit-mode adds). */
export function portionRange(quantity: number | undefined): { min: number; max: number; step: number } {
  const q = quantity && quantity > 0 ? quantity : 1;
  if (q >= 20) return { min: 0, max: Math.ceil((q * 2) / 5) * 5, step: 5 };
  return { min: 0, max: Math.max(Math.ceil(q * 3), 4), step: 0.25 };
}

/** Every item across every meal — base items first, then each option's items,
 *  matching the backend's base-then-options stable-id assignment order. */
export const allPlanItems = (doc: EatingPlanDraft): PlanItem[] =>
  doc.meals.flatMap((m) => [...m.items, ...(m.options ?? []).flatMap((o) => o.items)]);

/**
 * Prune/reset overlay keys after a document edit (PUT /plan) — A5: an edit
 * touches ONLY the edited item's override. Removed item → key dropped; an item
 * whose quantity/unit changed → its override reset (default/bounds changed);
 * everything else survives. Options-aware: option items carry overrides too.
 */
export function pruneOverlayAfterEdit(
  oldDoc: EatingPlanDraft,
  newDoc: EatingPlanDraft,
  portions: Record<string, number>,
): Record<string, number> {
  const oldById = new Map<string, PlanItem>();
  for (const it of allPlanItems(oldDoc)) if (it.id != null) oldById.set(it.id, it);
  const newById = new Map<string, PlanItem>();
  for (const it of allPlanItems(newDoc)) if (it.id != null) newById.set(it.id, it);

  const next: Record<string, number> = {};
  for (const [id, qty] of Object.entries(portions)) {
    const cur = newById.get(id);
    if (!cur) continue; // removed → prune
    const before = oldById.get(id);
    if (before && (before.quantity !== cur.quantity || before.unit !== cur.unit)) continue; // edited → reset
    next[id] = qty;
  }
  return next;
}
