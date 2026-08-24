/**
 * APP-116 — "Fill in the calories for me" (handoff v4.2 §2.4).
 *
 * One seam, two legs:
 *  - online: POST /v1/estimate/food-kcal — the seeded food table, the estimate
 *    cache and (for misses only) the model, all server-side (ADR-0020). Rounding
 *    is the SERVER's job there; the numbers come back ready to render.
 *  - offline / mock / any throw / any timeout: the handoff's own `FKG`/`FKU`
 *    tables, on the device. Not a second implementation for its own sake — mock
 *    mode and offline both have to work, and criterion 8 pins the table's output
 *    (`Oats · 60 g → 235`), so it has to exist here anyway. `api/mock.ts` calls
 *    the same `estK`, so there is exactly one device-side copy.
 *
 * Every number this returns is an ESTIMATE. The caller marks what it accepts
 * with `PlanItem.kcalEstimated: true` so the `~` survives the save (PLAN R1).
 */
import type { Api } from "../api/client";

/**
 * Lazy, like `src/api/index.ts` does for the session: `api/mock.ts` imports
 * `estK` from this file, so a module-scope `import { api }` closes a cycle that
 * leaves the mock half-initialised. Type-only import + require at call time.
 */
const client = (): Api => (require("../api") as { api: Api }).api;

export type EstimateItem = {
  /** As typed ("Aveia", "Oats"). */
  name: string;
  quantity?: number;
  /** "g" | "ml" | "unit" | "serving". */
  unit?: string;
};

/** kcal per gram / ml, keyed by the food's FIRST word, lowercased (57 keys). */
export const FKG: Record<string, number> = {
  rice: 1.3, chicken: 1.65, banana: 0.89, oats: 3.89, egg: 1.55, bread: 2.6, yogurt: 0.72,
  whey: 4.03, beans: 0.95, potato: 0.86, pasta: 1.31, beef: 2.5, tilapia: 0.96, salad: 0.35,
  avocado: 1.6, cheese: 3.5, milk: 0.64, coffee: 0.02, juice: 0.45, apple: 0.52, peanut: 5.9,
  honey: 2.9, tuna: 1.3, shrimp: 0.99, quinoa: 1.2, broccoli: 0.34, olive: 8.84, granola: 4.1,
  protein: 3.8, fruit: 0.6, salmon: 2.08, turkey: 1.35, cottage: 0.98, corn: 0.86, cassava: 1.6,
  tapioca: 3.6, almonds: 5.79, water: 0, tea: 0.01, soda: 0.42, couscous: 1.12, lentils: 1.16,
  chickpeas: 1.64, spinach: 0.23, tomato: 0.18, carrot: 0.41, mango: 0.6, orange: 0.47,
  strawberry: 0.32, butter: 7.17, sugar: 4, chocolate: 5.4, nuts: 6.1, sausage: 3,
  bacon: 5.4, ham: 1.45, pork: 2.42,
};

/** kcal per unit / serving (15 keys). */
export const FKU: Record<string, number> = {
  egg: 78, bread: 75, banana: 105, apple: 95, orange: 62, tortilla: 120, toast: 75,
  slice: 75, scoop: 120, capsule: 5, coffee: 2, yogurt: 110, bar: 200, wrap: 180, pancake: 90,
};

/**
 * The device-side estimate. Always a multiple of 5 with a floor of 5: a `237`
 * would claim a precision the estimate does not have. The server rounds
 * identically (PLAN R4), so both legs agree on the CEO's device.
 */
export function estK(it: EstimateItem): number {
  const key = (it.name || "").toLowerCase().split(/[\s,]+/)[0];
  const q = Number(it.quantity) || 1;
  const f =
    it.unit === "g" || it.unit === "ml"
      ? (FKG[key] ?? (it.unit === "ml" ? 0.45 : 1.3))
      : (FKU[key] ?? (it.unit === "serving" ? 135 : 90));
  return Math.max(5, Math.round((q * f) / 5) * 5);
}

/** The contract's cap per call (400 above it) — a longer plan goes in slices. */
const MAX_PER_CALL = 60;
/** ponytail: a flat ceiling, no backoff. The pass falls back to the table anyway. */
const TIMEOUT_MS = 20_000;

const timeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("estimate timeout")), ms))]);

/**
 * Estimate every item's total kcal at its stated quantity. Index-aligned with
 * the request, always the same length; `null` = nothing could answer (the
 * caller leaves its dash — never substitutes a zero).
 *
 * Send ONLY items whose kcal is still empty: a number the user typed must never
 * be overwritten (criterion 11), and this seam has no way to tell them apart.
 */
export async function estimateKcal(items: EstimateItem[]): Promise<(number | null)[]> {
  if (items.length === 0) return [];
  try {
    const slices: EstimateItem[][] = [];
    for (let i = 0; i < items.length; i += MAX_PER_CALL) slices.push(items.slice(i, i + MAX_PER_CALL));
    const answers = await timeout(
      Promise.all(slices.map((slice) => client().estimateFoodKcal({ items: slice }))),
      TIMEOUT_MS,
    );
    const flat = answers.flatMap((a) => a.items);
    // Positional by contract, but never trust a short array into a misaligned plan.
    return items.map((_, i) => flat[i]?.kcal ?? null);
  } catch {
    return items.map(estK);
  }
}
