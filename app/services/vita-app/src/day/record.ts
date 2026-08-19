/**
 * APP-094 — the day record model (v4 pillar).
 *
 * **There is no `/days` resource** (PLAN R1). A day record IS the ordinary meal /
 * workout entries of that date, carrying the 0.8.0 plan fields (`planMealId`,
 * `planStatus`, `planOptionIndex`, per-item `replacesItemId`, `planDay`). This
 * module is the shape the UI renders and the pure mapping entry ⇄ record; the
 * SQLite `day_record` table (src/db/dayRecord.ts) is only a derived cache of it.
 *
 * Two rules run through everything here:
 *  - **Self-describing** (risk R7): a record stores the rendered name/qty/macros
 *    it had at record time, not just plan ids. Re-importing the plan invalidates
 *    `planMealId` back-pointers; past days must still render exactly as recorded.
 *  - **A skipped meal is a real record with zero items** (R10): every consumer of
 *    `items` must tolerate an empty array and all-zero totals.
 *
 * `planned` is the ABSENCE of a record — it is never written anywhere.
 */
import type {
  LogEntry,
  MacroTotals,
  MealDetail,
  MealItem,
  NewEntry,
  PlanItem,
  PlanMeal,
  SwapOption,
  WorkoutDetail,
} from "../api/client";
import { effectiveName, effectiveQuantity, effectiveUnit, itemTotals } from "../plan/compute";

/** `planned` = no record for that meal. The other three are what the wire carries. */
export type MealState = "planned" | "done" | "adjusted" | "skipped";
export type RecordedState = Exclude<MealState, "planned">;

/** The slice of a plan meal the day logic needs (id + when it's due). */
export type DayMeal = { id: string; name: string; minutes: number };

export type MealRecord = {
  /** Local entry id — deterministic, doubles as the Idempotency-Key. */
  entryId: string;
  planMealId?: string;
  /** Self-describing: the meal's name AT RECORD TIME. */
  title: string;
  state: RecordedState;
  planOptionIndex?: number;
  /** EMPTY when skipped — a real record of "I did not have this" (R10). */
  items: MealItem[];
  totals: Required<MacroTotals>;
  /** occurredAt (ISO instant). */
  at: string;
  /** Server receive time, once synced — later than `at`'s day ⇒ closed later (R2). */
  loggedAt?: string;
};

export type WorkoutRecord = {
  entryId: string;
  planDay?: string;
  title: string;
  state: RecordedState;
  exercises: NonNullable<WorkoutDetail["exercises"]>;
  at: string;
  loggedAt?: string;
};

/**
 * Day-scoped plan tweaks — the v3 portions overlay, item skips, item swaps and the
 * option pick, all in ONE place keyed by date (kills the session-19 asymmetry where
 * an option switch was session-local while portions persisted). NOT derivable from
 * entries, so it is stored, not cached. Device-local: "only counts for today".
 */
export type DayOverlay = {
  /** planMealId → index into PlanMeal.options. */
  option: Record<string, number>;
  /** planItemId → quantity. */
  qty: Record<string, number>;
  /** planItemId → didn't have it today. */
  skip: Record<string, true>;
  /** planItemId → today's stand-in. */
  swap: Record<string, SwapOption>;
};

export type DayRecord = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  meals: MealRecord[];
  workout?: WorkoutRecord;
  /** Derived from the day's water entries — water alone never closes a day. */
  waterMl: number;
  overlay: DayOverlay;
};

export const ZERO: Required<MacroTotals> = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export const emptyOverlay = (): DayOverlay => ({ option: {}, qty: {}, skip: {}, swap: {} });

export const emptyDay = (date: string): DayRecord => ({
  date,
  meals: [],
  waterMl: 0,
  overlay: emptyOverlay(),
});

/** Local calendar day key, YYYY-MM-DD. */
export const dayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "13:00" → 780. Unparseable/absent → 0 (sorts first, due immediately). */
export function minutesOf(time?: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** The plan's meals as the day logic sees them, chronological. Meals without an id are dropped
 *  (an unsaved plan has no stable pointers — nothing to record against). */
export const dayMeals = (meals: PlanMeal[]): DayMeal[] =>
  meals
    .filter((m) => m.id != null)
    .map((m) => ({ id: m.id!, name: m.name, minutes: minutesOf(m.time) }))
    .sort((a, b) => a.minutes - b.minutes);

export const mealRecord = (day: DayRecord, planMealId: string): MealRecord | undefined =>
  day.meals.find((r) => r.planMealId === planMealId);

export const sumTotals = (items: MealItem[]): Required<MacroTotals> =>
  items.reduce<Required<MacroTotals>>(
    (t, i) => ({
      kcal: t.kcal + (i.kcal ?? 0),
      proteinG: t.proteinG + (i.proteinG ?? 0),
      carbsG: t.carbsG + (i.carbsG ?? 0),
      fatG: t.fatG + (i.fatG ?? 0),
    }),
    { ...ZERO },
  );

/**
 * Which composition of a meal is in play today: the day's option pick wins over the
 * plan's persisted usual, `undefined` = the meal's own items (contract semantics —
 * `planOptionIndex` absent means base).
 */
export function optionIndexFor(meal: PlanMeal, ov: DayOverlay): number | undefined {
  const i = (meal.id != null ? ov.option[meal.id] : undefined) ?? meal.usualOptionIndex;
  return i != null && meal.options?.[i] ? i : undefined;
}

/**
 * The meal's resulting composition today, as self-describing wire items: the option
 * pick, minus skipped items, with today's swaps and portion overrides applied. Every
 * item carries `replacesItemId` = the plan item it stands in for (contract: an
 * UNCHANGED planned item carries its own id).
 *
 * ponytail: a day swap is priced by re-using the existing usual-swap lens
 * (`{...item, swaps:[sw], usualSwapIndex:0}`) — same equivalence formula, zero new math.
 */
export function composeItems(meal: PlanMeal, ov: DayOverlay = emptyOverlay()): MealItem[] {
  const oi = optionIndexFor(meal, ov);
  const src: PlanItem[] = oi != null ? meal.options![oi]!.items : meal.items;
  const out: MealItem[] = [];
  for (const item of src) {
    const id = item.id;
    if (id != null && ov.skip[id]) continue; // didn't have it today
    const sw = id != null ? ov.swap[id] : undefined;
    const lens: PlanItem = sw ? { ...item, swaps: [sw], usualSwapIndex: 0 } : item;
    const qty = (id != null ? ov.qty[id] : undefined) ?? effectiveQuantity(lens);
    const t = itemTotals(lens, qty);
    out.push({
      name: effectiveName(lens),
      quantity: qty,
      ...(effectiveUnit(lens) ? { unit: effectiveUnit(lens) } : {}),
      kcal: t.kcal,
      proteinG: t.proteinG,
      carbsG: t.carbsG,
      fatG: t.fatG,
      ...(id != null ? { replacesItemId: id } : {}),
    });
  }
  return out;
}

/**
 * Build the record for one plan meal in a given state. `skipped` records zero items
 * on purpose (R10). `entryId` is deterministic so the write is idempotent and a
 * re-record PATCHes the same entry instead of duplicating it.
 */
export function buildMealRecord(
  date: string,
  meal: PlanMeal,
  state: RecordedState,
  ov: DayOverlay = emptyOverlay(),
  at?: string,
): MealRecord {
  const items = state === "skipped" ? [] : composeItems(meal, ov);
  const oi = state === "skipped" ? undefined : optionIndexFor(meal, ov);
  return {
    entryId: mealEntryId(date, meal.id!),
    planMealId: meal.id,
    title: meal.name,
    state,
    ...(oi != null ? { planOptionIndex: oi } : {}),
    items,
    totals: sumTotals(items),
    at: at ?? atMinutes(date, minutesOf(meal.time)),
  };
}

/** Deterministic entry id for a plan meal's record — one record per meal per day. */
export const mealEntryId = (date: string, planMealId: string): string => `meal:${date}:${planMealId}`;
export const workoutEntryId = (date: string): string => `workout:${date}`;

/** ISO instant for `date` at `minutes` past local midnight. */
export function atMinutes(date: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  dt.setMinutes(minutes);
  return dt.toISOString();
}

/**
 * Record → wire payload. `planStatus` / `planOptionIndex` require `planMealId`
 * (sending either alone is a 400), so they travel together or not at all.
 */
export function toMealEntry(rec: MealRecord, sourcePhrase?: string): NewEntry {
  const detail: MealDetail = {
    title: rec.title,
    items: rec.items,
    totals: rec.totals,
    ...(rec.planMealId
      ? {
          planMealId: rec.planMealId,
          planStatus: rec.state,
          ...(rec.planOptionIndex != null ? { planOptionIndex: rec.planOptionIndex } : {}),
        }
      : {}),
  };
  return {
    type: "meal",
    occurredAt: rec.at,
    inputMethod: "tap",
    isEstimate: true,
    ...(sourcePhrase ? { sourcePhrase } : {}),
    detail,
  };
}

export function toWorkoutEntry(rec: WorkoutRecord): NewEntry {
  const detail: WorkoutDetail = {
    title: rec.title,
    exercises: rec.exercises,
    ...(rec.planDay ? { planDay: rec.planDay, planStatus: rec.state } : {}),
  };
  return { type: "workout", occurredAt: rec.at, inputMethod: "tap", isEstimate: true, detail };
}

type AnyEntry = (NewEntry | LogEntry) & { id?: string; loggedAt?: string; serverId?: string };

/** Wire/local entry → record. Returns null for an entry that isn't a meal record. */
export function fromMealEntry(e: AnyEntry): MealRecord | null {
  if (e.type !== "meal") return null;
  const d = e.detail as MealDetail;
  const items = d.items ?? [];
  return {
    entryId: e.id ?? "",
    ...(d.planMealId ? { planMealId: d.planMealId } : {}),
    title: d.title ?? "Meal",
    // A free-form (off-plan) meal has no planStatus — it is still a real record; the
    // honest reading is "eaten, not as any planned meal" → adjusted.
    state: d.planStatus ?? "adjusted",
    ...(d.planOptionIndex != null ? { planOptionIndex: d.planOptionIndex } : {}),
    items,
    totals: { ...ZERO, ...(d.totals ?? sumTotals(items)) },
    at: e.occurredAt,
    ...(e.loggedAt ? { loggedAt: e.loggedAt } : {}),
  };
}

export function fromWorkoutEntry(e: AnyEntry): WorkoutRecord | null {
  if (e.type !== "workout") return null;
  const d = e.detail as WorkoutDetail;
  return {
    entryId: e.id ?? "",
    ...(d.planDay ? { planDay: d.planDay } : {}),
    title: d.title ?? d.planDay ?? "Workout",
    state: d.planStatus ?? "done",
    exercises: d.exercises ?? [],
    at: e.occurredAt,
    ...(e.loggedAt ? { loggedAt: e.loggedAt } : {}),
  };
}
