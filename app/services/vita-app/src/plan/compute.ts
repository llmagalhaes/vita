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
import type { EatingPlanDraft, MacroTotals, PlanItem, PlanMeal } from "../api/client";

const ZERO: Required<MacroTotals> = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const add = (a: Required<MacroTotals>, b: MacroTotals): Required<MacroTotals> => ({
  kcal: a.kcal + (b.kcal ?? 0),
  proteinG: a.proteinG + (b.proteinG ?? 0),
  carbsG: a.carbsG + (b.carbsG ?? 0),
  fatG: a.fatG + (b.fatG ?? 0),
});

/** Effective quantity for an item: portion override → default quantity → 1. */
export const qtyOf = (item: PlanItem, portions: Record<string, number> = {}): number =>
  (item.id != null ? portions[item.id] : undefined) ?? item.quantity ?? 1;

/** Nutrition for one item = per-unit × quantity (explicit qty, else default). */
export function itemTotals(item: PlanItem, qty: number = item.quantity ?? 1): Required<MacroTotals> {
  const per = item.nutritionPerUnit;
  if (!per) return { ...ZERO };
  return { kcal: (per.kcal ?? 0) * qty, proteinG: (per.proteinG ?? 0) * qty, carbsG: (per.carbsG ?? 0) * qty, fatG: (per.fatG ?? 0) * qty };
}

export const mealTotals = (meal: PlanMeal, portions: Record<string, number> = {}): Required<MacroTotals> =>
  meal.items.reduce((t, it) => add(t, itemTotals(it, qtyOf(it, portions))), { ...ZERO });

export const planDailyTotals = (plan: EatingPlanDraft, portions: Record<string, number> = {}): Required<MacroTotals> =>
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

/** Portion slider bounds: server-authoritative when present, else the heuristic. */
export const boundsOf = (item: PlanItem): { min: number; max: number; step: number } =>
  item.portion ?? portionRange(item.quantity);

/** Slider bounds fallback for items without server bounds (e.g. edit-mode adds). */
export function portionRange(quantity: number | undefined): { min: number; max: number; step: number } {
  const q = quantity && quantity > 0 ? quantity : 1;
  if (q >= 20) return { min: 0, max: Math.ceil((q * 2) / 5) * 5, step: 5 };
  return { min: 0, max: Math.max(Math.ceil(q * 3), 4), step: 0.25 };
}

/**
 * Prune/reset overlay keys after a document edit (PUT /plan) — A5: an edit
 * touches ONLY the edited item's override. Removed item → key dropped; an item
 * whose quantity/unit changed → its override reset (default/bounds changed);
 * everything else survives.
 */
export function pruneOverlayAfterEdit(
  oldDoc: EatingPlanDraft,
  newDoc: EatingPlanDraft,
  portions: Record<string, number>,
): Record<string, number> {
  const oldById = new Map<string, PlanItem>();
  for (const m of oldDoc.meals) for (const it of m.items) if (it.id != null) oldById.set(it.id, it);
  const newById = new Map<string, PlanItem>();
  for (const m of newDoc.meals) for (const it of m.items) if (it.id != null) newById.set(it.id, it);

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
