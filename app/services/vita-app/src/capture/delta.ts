/**
 * APP-104 — capture as a plan delta. **Pure**: no React, no db, no clock.
 *
 * PLAN R6: there is NO `ParseResult.planDelta` object on the wire. `/parse/text`
 * (and a plan-matching `/parse/photo`) returns the matched meal's **FULL resulting
 * composition** — `planMealId` / `planStatus` / `planOptionIndex` on the detail and
 * `replacesItemId` on every item. The signed kcal delta is computed HERE, against
 * `composeItems(meal, overlay)` — the composition the app already holds for today.
 *
 * Recording a delta writes ONE self-describing meal record (APP-094): the draft's
 * own items, byte for byte, so the card's "~679 kcal" and the day's number can
 * never disagree. The day overlay is deliberately NOT touched — it is the
 * *pre-record* tweak surface; once a meal is recorded, the record is what renders.
 */
import type { MacroTotals, MealDetail, MealItem, NewEntry, PlanMeal } from "../api/client";
import {
  ZERO,
  composeItems,
  emptyOverlay,
  mealEntryId,
  sumTotals,
  type DayOverlay,
  type DayRecord,
  type MealRecord,
  type RecordedState,
} from "../day/record";

/** One `~~old~~ → new` row. `from` alone = dropped; `to` alone = added. */
export type DeltaLine = { from?: MealItem; to?: MealItem };

export type PlanDelta = {
  planMealId: string;
  /** Self-describing: the meal name at parse time. */
  title: string;
  state: RecordedState;
  planOptionIndex?: number;
  items: MealItem[];
  totals: Required<MacroTotals>;
  /** Signed kcal vs. what the plan says for today (negative = fewer). */
  kcalDelta: number;
  /** Only what actually changed — an untouched meal has none. */
  lines: DeltaLine[];
};

const qtyOf = (i: MealItem) => i.quantity ?? 1;

/** Same item, as far as a reader of the card is concerned. */
const sameItem = (a: MealItem, b: MealItem): boolean =>
  a.name === b.name && qtyOf(a) === qtyOf(b) && (a.unit ?? "") === (b.unit ?? "") && Math.round(a.kcal) === Math.round(b.kcal);

/**
 * Pair the two compositions by `replacesItemId` (an unchanged planned item carries
 * its own id — contract 0.8.0), and keep only the pairs that differ.
 * ponytail: positional fallback is deliberately absent — an item with no id can
 * only be reported as an addition, which is the honest reading.
 */
function diffItems(before: MealItem[], after: MealItem[]): DeltaLine[] {
  const lines: DeltaLine[] = [];
  const matched = new Set<number>();
  for (const to of after) {
    const i =
      to.replacesItemId == null
        ? -1
        : before.findIndex((b, bi) => !matched.has(bi) && b.replacesItemId === to.replacesItemId);
    if (i < 0) {
      lines.push({ to });
      continue;
    }
    matched.add(i);
    if (!sameItem(before[i]!, to)) lines.push({ from: before[i]!, to });
  }
  before.forEach((from, i) => {
    if (!matched.has(i)) lines.push({ from });
  });
  return lines;
}

/**
 * The draft → a plan delta, or `null` when there is nothing to match against:
 * an off-plan meal (no `planMealId`) or a back-pointer the current plan no longer
 * has (re-import — risk 3). Both fall back to the v3 loose-draft card, which still
 * records the meal; nothing is ever lost because the plan moved.
 */
export function planDelta(draft: NewEntry, meals: PlanMeal[], ov: DayOverlay = emptyOverlay()): PlanDelta | null {
  if (draft.type !== "meal") return null;
  const d = draft.detail as MealDetail;
  if (!d.planMealId) return null;
  const meal = meals.find((m) => m.id === d.planMealId);
  if (!meal) return null;

  const before = composeItems(meal, ov);
  const items = d.items ?? [];
  const totals: Required<MacroTotals> = { ...ZERO, ...(d.totals ?? sumTotals(items)) };
  return {
    planMealId: d.planMealId,
    title: d.title ?? meal.name,
    // A plan-matched draft always carries a status; "adjusted" is the honest default.
    state: d.planStatus ?? "adjusted",
    ...(d.planOptionIndex != null ? { planOptionIndex: d.planOptionIndex } : {}),
    items,
    totals,
    kcalDelta: Math.round(totals.kcal - sumTotals(before).kcal),
    lines: diffItems(before, items),
  };
}

/** What `revertDelta` needs to put the day back exactly as it was. */
export type DeltaUndo = { entryId: string; previous?: MealRecord };

/**
 * Record the delta into the day. One record per plan meal per day under a
 * deterministic id, so re-recording the same meal PATCHes instead of duplicating.
 * Returns the next day record (pure), the record to write, and the undo token.
 */
export function applyDelta(
  day: DayRecord,
  delta: PlanDelta,
  at: string,
): { day: DayRecord; record: MealRecord; undo: DeltaUndo } {
  const entryId = mealEntryId(day.date, delta.planMealId);
  const previous = day.meals.find((r) => r.entryId === entryId || r.planMealId === delta.planMealId);
  const record: MealRecord = {
    entryId,
    planMealId: delta.planMealId,
    title: delta.title,
    state: delta.state,
    ...(delta.planOptionIndex != null ? { planOptionIndex: delta.planOptionIndex } : {}),
    items: delta.items,
    totals: delta.totals,
    at,
  };
  const meals = previous ? day.meals.map((r) => (r === previous ? record : r)) : [...day.meals, record];
  return { day: { ...day, meals }, record, undo: { entryId, ...(previous ? { previous } : {}) } };
}

/**
 * Undo the recording — restores the previous record AND its meal state, or removes
 * the record entirely when the meal was unrecorded before (the "planned" absence).
 * `restore` → write it back; `remove` → delete that entry id.
 */
export function revertDelta(
  day: DayRecord,
  undo: DeltaUndo,
): { day: DayRecord; restore?: MealRecord; remove?: string } {
  const without = day.meals.filter((r) => r.entryId !== undo.entryId);
  if (!undo.previous) return { day: { ...day, meals: without }, remove: undo.entryId };
  const meals = day.meals.map((r) => (r.entryId === undo.entryId ? undo.previous! : r));
  return { day: { ...day, meals }, restore: undo.previous };
}
