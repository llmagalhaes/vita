/**
 * The food builder's own data shape and the four pure things that happen to it
 * (handoff v4.2 §2, §4). Kept out of the route so the estimate merge, the inline
 * kcal editor and the save conversion are testable without a renderer.
 *
 * The builder-local item is the handoff's `{ n, q, u, k, est }` — small, cheap to
 * edit, no ids. Ids arrive from the server at save (`savePlan` adopts the POST
 * echo), which is exactly why the builder must not invent any.
 */
import type { EatingPlanDraft } from "../../api/client";
import type { EstimateItem } from "../../plan/estimateKcal";
import { skel } from "../parts";

export type BuildItem = {
  /** Name, as typed. */
  n: string;
  /** Quantity. 0 = not stated (the portion line then renders nothing). */
  q: number;
  /** "g" | "ml" | "unit" | "serving". */
  u: string;
  /** Total kcal at `q`. `null` = still empty — never a zero. */
  k: number | null;
  /** True only while `k` came from the estimate pass (renders `~`, dashed). */
  est: boolean;
};

export type BuildMeal = { n: string; t: string; items: BuildItem[] };

export const UNITS = ["g", "ml", "unit", "serving"] as const;

/** The `n` highest-priority meal slots, in clock order, each with no food yet. */
export const mealsFromSkel = (n: number): BuildMeal[] =>
  skel(n).map(([name, time]) => ({ n: name, t: time, items: [] }));

/** Sum of the kcal a meal actually has. 0 means "nothing known yet" → renders `—`. */
export const mealTotal = (m: BuildMeal): number =>
  m.items.reduce((a, it) => a + (it.k ?? 0), 0);

export const dayTotal = (meals: BuildMeal[]): number =>
  meals.reduce((a, m) => a + mealTotal(m), 0);

/** `bmAnyK` — is there a single kcal on the screen yet? Drives the review copy. */
export const anyK = (meals: BuildMeal[]): boolean =>
  meals.some((m) => m.items.some((it) => it.k != null));

/** Every item still without a kcal, flat and in order — the estimate request. */
export const emptyItems = (meals: BuildMeal[]): EstimateItem[] =>
  meals.flatMap((m) => m.items.filter((it) => it.k == null).map((it) => ({ name: it.n, quantity: it.q, unit: it.u })));

/**
 * Fold an index-aligned answer back onto the same flat order `emptyItems` produced.
 *
 * A number the user typed is NEVER overwritten (criterion 11) — that is structural
 * here, not a check: an item with a `k` was never sent and never consumes an answer.
 * A `null` answer leaves the dash alone rather than substituting a zero.
 */
export function mergeEstimates(meals: BuildMeal[], values: (number | null)[]): BuildMeal[] {
  let i = 0;
  return meals.map((m) => ({
    ...m,
    items: m.items.map((it) => {
      if (it.k != null) return it;
      const v = values[i++];
      return v == null ? it : { ...it, k: v, est: true };
    }),
  }));
}

/**
 * Save the inline editor (handoff §2.4). `key` is `"{mealIndex}-{itemIndex}"`.
 * Empty or not a number keeps whatever was there; a valid number lands verbatim
 * and drops the `est` flag — a corrected estimate is no longer an estimate.
 *
 * Stale key ⇒ no-op: the key addresses a nested array by index, so a list that
 * moved under it must change nothing at all (app-plan §D risk 2).
 */
export function saveEdit(meals: BuildMeal[], key: string, raw: string): BuildMeal[] {
  const [mi, ii] = key.split("-").map(Number);
  const item = meals[mi!]?.items[ii!];
  if (!item) return meals;
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v) || v < 0) return meals;
  return meals.map((m, x) =>
    x !== mi ? m : { ...m, items: m.items.map((it, y) => (y !== ii ? it : { ...it, k: Math.round(v), est: false })) },
  );
}

/**
 * Builder draft → the wire document (contract v0.9.0, PLAN R1).
 *
 * `kcal` is the item's TOTAL at its quantity — not per unit — and `kcalEstimated`
 * rides along with it, so the `~` survives the save onto every plan surface.
 * A meal (or a day) whose numbers are not all in yet gets NO total: half a sum is
 * a wrong number, and Vita would rather show nothing than a wrong number.
 */
export function toDraft(meals: BuildMeal[], summary: string): EatingPlanDraft {
  const complete = (m: BuildMeal) => m.items.length > 0 && m.items.every((it) => it.k != null);
  const all = meals.flatMap((m) => m.items);
  return {
    summary,
    status: "ready",
    ...(all.length > 0 && all.every((it) => it.k != null) ? { dailyTotals: { kcal: dayTotal(meals) } } : null),
    meals: meals.map((m) => ({
      name: m.n,
      time: m.t,
      ...(complete(m) ? { kcal: mealTotal(m) } : null),
      items: m.items.map((it) => ({
        name: it.n,
        ...(it.q > 0 ? { quantity: it.q } : null),
        unit: it.u,
        ...(it.k != null ? { kcal: it.k, ...(it.est ? { kcalEstimated: true } : null) } : null),
      })),
    })),
  };
}
