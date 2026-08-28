/**
 * The food builder's own data shape and the four pure things that happen to it
 * (handoff v4.2 §2, §4). Kept out of the route so the estimate merge, the inline
 * kcal editor and the save conversion are testable without a renderer.
 *
 * The builder-local item is the handoff's `{ n, q, u, k, est }` — small, cheap to
 * edit, no ids. Ids arrive from the server at save (`savePlan` adopts the POST
 * echo), which is exactly why the builder must not invent any.
 */
import type { EatingPlanDraft, PlanItem } from "../../api/client";
import type { EstimateItem } from "../../plan/estimateKcal";
import { effectiveName, effectivePerUnit, effectiveSwap, usualItems } from "../../plan/compute";
import { numOf, skel } from "../parts";

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

/** WHERE an estimate was asked for, next to WHAT was asked — the merge's key. */
export type EmptySlot = { mi: number; ii: number; item: EstimateItem };

/** Every item still without a kcal, flat and in order — the estimate request. */
export const emptySlots = (meals: BuildMeal[]): EmptySlot[] =>
  meals.flatMap((m, mi) =>
    m.items.flatMap((it, ii) => (it.k == null ? [{ mi, ii, item: { name: it.n, quantity: it.q, unit: it.u } }] : [])),
  );

/**
 * Fold an index-aligned answer back onto the slots it was asked for.
 *
 * Positional alignment holds only while nothing moved: the list is editable and
 * the pass takes seconds, so the answer is merged BY KEY (meal, item, name) and
 * anything that no longer matches is dropped silently — an estimate on the wrong
 * food is worse than no estimate.
 *
 * A number the user typed is NEVER overwritten (criterion 11): the slot must
 * still be empty. A `null` answer leaves the dash alone rather than a zero.
 */
export function mergeEstimates(meals: BuildMeal[], slots: EmptySlot[], values: (number | null)[]): BuildMeal[] {
  const hit = new Map<string, number>();
  slots.forEach((s, i) => {
    const v = values[i];
    const target = meals[s.mi]?.items[s.ii];
    if (v != null && target && target.k == null && target.n === s.item.name) hit.set(`${s.mi}-${s.ii}`, v);
  });
  if (hit.size === 0) return meals;
  return meals.map((m, mi) => ({
    ...m,
    items: m.items.map((it, ii) => {
      const v = hit.get(`${mi}-${ii}`);
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
  const v = numOf(raw);
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
/**
 * The meal time as the contract will take it (`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
 * — the field is free text, so "7:00" and " 12:30 " are normalised and anything
 * that is still not a clock time simply doesn't travel (`time` is optional).
 */
export function wireTime(raw: string): string | undefined {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec((raw ?? "").replace(/\s/g, ""));
  const h = m ? Number(m[1]) : 24;
  return m && h < 24 ? `${String(h).padStart(2, "0")}:${m[2]}` : undefined;
}

export function toDraft(meals: BuildMeal[], summary: string): EatingPlanDraft {
  const complete = (m: BuildMeal) => m.items.length > 0 && m.items.every((it) => it.k != null);
  const all = meals.flatMap((m) => m.items);
  return {
    summary,
    status: "ready",
    ...(all.length > 0 && all.every((it) => it.k != null) ? { dailyTotals: { kcal: dayTotal(meals) } } : null),
    meals: meals.map((m) => ({
      name: m.n,
      ...(wireTime(m.t) ? { time: wireTime(m.t) } : null),
      ...(complete(m) ? { kcal: mealTotal(m) } : null),
      items: m.items.map((it) => ({
        name: it.n,
        ...(it.q > 0 ? { quantity: it.q } : null),
        ...(it.u ? { unit: it.u } : null),
        ...(it.k != null ? { kcal: it.k, ...(it.est ? { kcalEstimated: true } : null) } : null),
      })),
    })),
  };
}

// ---- the other direction: an existing plan back into the builder (APP-138) ----

/**
 * True when the plan carries structure the BUILDER cannot hold — meal options or
 * item swap lists (anything parsed out of a nutritionist PDF). The sheet says so
 * before opening the builder: rebuilding such a plan by hand keeps the food and
 * the numbers, and drops the alternatives.
 */
export const hasSwapsOrOptions = (doc: EatingPlanDraft): boolean =>
  doc.meals.some((m) => (m.options?.length ?? 0) > 0 || m.items.some((it) => (it.swaps?.length ?? 0) > 0));

/**
 * One plan item → the builder's `{ n, q, u, k, est }`, through the SAME effective
 * lens every plan surface reads (a chosen usual swap IS the food you eat, so it
 * arrives under its own name and quantity).
 *
 * kcal: the item's own total when it has one; otherwise priced from
 * `nutritionPerUnit × quantity` and MARKED an estimate — a number derived here is
 * exactly that. Nothing to price (no per-unit, or no stated quantity) stays empty
 * rather than becoming a zero, and the review screen offers to fill it in.
 */
const itemToBuild = (it: PlanItem): BuildItem => {
  const sw = effectiveSwap(it);
  const q = (sw ? sw.quantity : it.quantity) ?? 0;
  // The item's own total counts only while the item is itself: under a usual swap
  // the number is the equivalence estimate, in the SWAP's space (session-19's bug
  // class — a swapped item's per-unit space is not the original's).
  const own = !sw && it.kcal != null;
  const per = effectivePerUnit(it)?.kcal;
  const k = own ? Math.round(it.kcal!) : per != null && q > 0 ? Math.round(per * q) : null;
  return {
    n: effectiveName(it),
    q,
    u: (sw ? sw.unit : it.unit) ?? "",
    k,
    est: own ? it.kcalEstimated === true : k != null,
  };
};

/**
 * Saved plan → builder draft. The deliberate, documented losses (the builder has
 * no field for any of them, and `toDraft` would drop them at save anyway):
 *   · meal options — the USUAL composition is the one that comes back
 *   · item swap lists — the chosen usual is folded in as the item itself
 *   · per-item macros beyond kcal, micros, portion bounds, grams
 *   · plan-level note, hydration, supplements, daily macro totals besides kcal
 *   · server ids (a POST assigns fresh ones; the old version stays in history)
 */
export const fromPlanDoc = (doc: EatingPlanDraft): BuildMeal[] =>
  doc.meals.map((m) => ({ n: m.name, t: m.time ?? "", items: usualItems(m).map(itemToBuild) }));
