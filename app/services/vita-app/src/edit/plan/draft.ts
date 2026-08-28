/**
 * APP-139 — the edit-plan screen's draft: everything that happens to a plan
 * document between "Edit this plan" and "Save the changes" (handoff v4.3 §2.2/§2.6).
 *
 * The one rule this file exists to enforce: an edit NEVER rebuilds the document.
 * Every draft meal and item carries `src` — the ORIGINAL object out of the cached
 * doc — and the save spreads it (`{...src, ...edits}`), so ids, `options`, `swaps`,
 * `nutritionPerUnit`, `microsPerUnit`, notes and the meal's own `usualOptionIndex`
 * ride through untouched. An untouched meal or item comes back byte-identical: it
 * IS the same object. Without that, changing one portion would silently delete the
 * 300+ swaps and the A/B options a PDF import extracted — the worst bug this screen
 * could ship (§2.2 note 1).
 *
 * Scope, deliberately (documented, not accidental):
 *  · The list is the meal's USUAL composition (`usualItems`) — what the Day shows.
 *    An item inside a NON-chosen option is out of editing reach this round; it is
 *    preserved verbatim through the spread.
 *  · An item under a chosen usual swap is `locked`: the amount you eat is the swap's,
 *    and the swap sheet on the Day owns it. Editing it here would either lie (the
 *    equivalence lens re-derives per-unit from the swap quantity, so the Day's kcal
 *    would not move with the editor's) or fork a second swap surface. It can still
 *    be removed.
 */
import type { EatingPlanDraft, PlanItem, PlanMeal } from "../../api/client";
import { effectiveName, effectivePerUnit, effectiveQuantity, effectiveSwap, effectiveUnit, usualItems } from "../../plan/compute";
import { numOf } from "../../build/parts";
import { wireTime } from "../../build/food/draft";

export type EditItem = {
  /** Display name (effective lens). Not editable — swapping a food is the swap sheet. */
  n: string;
  /** Quantity as typed. Free text: every read goes through `numOf(q) || 0`. */
  q: string;
  u: string;
  /** kcal per unit, from `effectivePerUnit` — the ONE pricing lens (PLAN R3). */
  per: number;
  /** A chosen usual swap owns this item's amount (see the file header). */
  locked: boolean;
  /** The original item, or null for one added here. */
  src: PlanItem | null;
};

export type EditMeal = {
  name: string;
  /** "HH:MM" as typed/picked. */
  t: string;
  items: EditItem[];
  src: PlanMeal | null;
  /** This meal's ITEMS as the screen opened them — "" for a meal added here. */
  snap: string;
};

// ---- kcal (§2.2: round PER ITEM, then sum — the order is the number) ---------

export const itemKcal = (it: EditItem): number => Math.round(it.per * (numOf(it.q) || 0));
export const mealKcal = (m: EditMeal): number => m.items.reduce((a, it) => a + itemKcal(it), 0);
export const totalKcal = (d: EditMeal[]): number => d.reduce((a, m) => a + mealKcal(m), 0);

// ---- open: doc → draft -------------------------------------------------------

const toItem = (it: PlanItem): EditItem => ({
  n: effectiveName(it),
  q: String(effectiveQuantity(it)),
  u: effectiveUnit(it) ?? "",
  per: effectivePerUnit(it)?.kcal ?? 0,
  locked: effectiveSwap(it) != null,
  src: it,
});

/** What the meal is MADE of — the only thing its stated kcal describes (see `saveMeal`). */
const projItems = (m: EditMeal): string => JSON.stringify(m.items.map((i) => [i.n, i.q, i.u, i.per]));

/** The comparable shape of one meal — `src` is deliberately absent (PLAN R12). */
const projMeal = (m: EditMeal): string => JSON.stringify([m.name, m.t, projItems(m)]);

/** The whole draft's comparable shape: the dirty check's only input. */
export const projection = (d: EditMeal[]): string => JSON.stringify(d.map(projMeal));

export function fromDoc(doc: EatingPlanDraft): EditMeal[] {
  return doc.meals.map((m) => {
    const draft: EditMeal = { name: m.name, t: m.time ?? "", items: usualItems(m).map(toItem), src: m, snap: "" };
    draft.snap = projItems(draft);
    return draft;
  });
}

// ---- adding ------------------------------------------------------------------

/** §2.5 — the one meal whose name arrives filled in, because it is a label to replace. */
export const newMeal = (name: string, time = "20:00"): EditMeal => ({ name, t: time, items: [], src: null, snap: "" });

/**
 * §2.4 — a food added by hand. `per` is stored, not the total, so a later portion
 * change re-prices proportionally instead of asking for a second estimate.
 */
export const newItem = (name: string, q: number, u: string, kcal: number): EditItem => ({
  n: name,
  q: String(q),
  u,
  per: q > 0 ? kcal / q : kcal,
  locked: false,
  src: null,
});

// ---- save --------------------------------------------------------------------

/** `hh×60+mm`, tolerant of junk (§2.6) — an unparseable time sorts as 00:00. */
export function tmOf(t: string): number {
  const [h, m] = String(t ?? "").split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function saveItem(it: EditItem): PlanItem {
  const src = it.src;
  const q = numOf(it.q) || 0;
  if (!src) {
    // Hand-added: a TOTAL kcal at its quantity, flagged an estimate (PLAN R4).
    return {
      name: it.n,
      ...(q > 0 ? { quantity: q } : null),
      ...(it.u ? { unit: it.u } : null),
      kcal: Math.round(it.per * q),
      kcalEstimated: true,
    };
  }
  // Untouched (and locked items are always untouched) → the original object itself.
  if (it.locked || (q === effectiveQuantity(src) && it.u === (effectiveUnit(src) ?? ""))) return src;
  // `portion` and `grams` both describe the OLD amount. The server recomputes bounds
  // from quantity+unit on every PUT and discards a client-sent `portion`
  // (PortionBoundsHeuristic: "server-authoritative"), so dropping them is exactly what
  // the round-trip does anyway — and offline it makes `boundsOf` fall back to the
  // client heuristic instead of a stale ceiling.
  const { portion: _p, grams: _g, ...rest } = src;
  return {
    ...rest,
    quantity: q,
    ...(it.u ? { unit: it.u } : null),
    // A stated total only holds at the quantity it was stated for.
    ...(src.kcal != null ? { kcal: Math.round(it.per * q) } : null),
  };
}

function saveMeal(m: EditMeal): PlanMeal {
  const name = m.name.trim() || "Meal";
  const time = wireTime(m.t);
  const items = m.items.map(saveItem);
  const src = m.src;
  if (!src) return { name, ...(time ? { time } : null), items };

  // A meal whose COMPOSITION moved loses its STATED kcal (the PDF's transcription);
  // the Library then falls back to the computed sum. Items only: renaming "Lunch" to
  // "Almoço" or moving it half an hour does not change what is on the plate, and
  // stripping the number there would silently downgrade a transcribed meal to an
  // estimate (F3). Untouched → src, byte for byte.
  const { kcal: _k, ...noKcal } = src;
  const head = { ...(projItems(m) === m.snap ? src : noKcal), name, ...(time ? { time } : null) };
  const oi = src.usualOptionIndex;
  return oi != null && src.options?.[oi]
    ? { ...head, options: src.options.map((o, k) => (k === oi ? { ...o, items } : o)) }
    : { ...head, items };
}

/**
 * Draft → the document to PUT. Sorted by time HERE and nowhere else: the list must
 * not reorder under the finger while a time is being typed (§2.6).
 * Everything outside `meals` (summary, status, note, hydration, supplements, micros)
 * is the plan's, not this screen's — it rides through untouched.
 */
export const toSaveDoc = (doc: EatingPlanDraft, draft: EditMeal[]): EatingPlanDraft => ({
  ...doc,
  meals: draft
    .slice()
    .sort((a, b) => tmOf(a.t) - tmOf(b.t))
    .map(saveMeal),
});
