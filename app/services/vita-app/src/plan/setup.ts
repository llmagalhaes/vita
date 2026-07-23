/**
 * Pure helpers for Plan Setup + Today + the evening recap (APP-085). No React, no
 * network — just the counting / string-building that the setup screen, Today's tab
 * and the recap notification share. Localized fragments come from the shared i18n
 * instance (translation-file rule intact); everything is deterministic for tests
 * once i18n is initialized.
 */
import i18n from "../i18n";
import type { EatingPlanDraft, PlanItem, ProgramDay } from "../api/client";
import { effectiveQuantity } from "./compute";

// ── §5 findings ───────────────────────────────────────────────────────────────

/** Every item across a meal's own items AND every option's items. */
const allItems = (doc: EatingPlanDraft): PlanItem[] =>
  doc.meals.flatMap((m) => [...m.items, ...(m.options ?? []).flatMap((o) => o.items)]);

/**
 * The 3 "Reading your plan…" findings, computed from the parsed doc (never
 * hardcoded). Page count omitted when unknown (async parse ships no pageCount).
 * Line 3 only when the plan carries hydration or supplements.
 */
export function setupFindings(doc: EatingPlanDraft, pageCount?: number | null): string[] {
  const lines: string[] = [];
  if (pageCount != null) lines.push(i18n.t("planSetup.findPages", { n: pageCount }));
  const nSwaps = allItems(doc).reduce((n, it) => n + (it.swaps?.length ?? 0), 0);
  lines.push(i18n.t("planSetup.findMeals", { meals: doc.meals.length, swaps: nSwaps }));
  if (doc.hydration || (doc.supplements?.length ?? 0) > 0) lines.push(i18n.t("planSetup.findNotes"));
  return lines;
}

// ── §6 changes-today count + workout kcal ─────────────────────────────────────

/**
 * How many "for today" tweaks are active: portion overrides that differ from the
 * item's effective default quantity, plus every skipped exercise across all days.
 */
export function changesToday(
  plan: EatingPlanDraft,
  portions: Record<string, number>,
  skips: Record<string, Record<string, true>>,
): number {
  const byId = new Map<string, PlanItem>();
  for (const it of allItems(plan)) if (it.id != null) byId.set(it.id, it);
  let n = 0;
  for (const [id, qty] of Object.entries(portions)) {
    const it = byId.get(id);
    if (it && qty !== effectiveQuantity(it)) n++;
  }
  for (const day of Object.values(skips)) n += Object.keys(day).length;
  return n;
}

/** ~kcal for a program day scaled by the exercises still on (null when no estimate). */
export function dayWorkoutKcal(day: ProgramDay, skips: Record<string, Record<string, true>>): number | null {
  if (day.kcalEstimate == null) return null;
  const total = day.exercises.length;
  if (total === 0) return 0;
  const skipped = Object.keys(skips[day.name] ?? {}).length;
  const active = total - skipped;
  return Math.round((day.kcalEstimate * active) / total);
}

// ── §9 recap line (Home card + notification body) ─────────────────────────────

/** "A, B and C" / "A and B" / "A" from present segments. */
function joinSegments(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * "2 meals, a workout and 1,250 ml of water — logged, not judged." Segments omit
 * at zero; all-zero → "" (callers hide). Pluralization lives in the locale file.
 */
export function recapLine(nMeals: number, nWorkouts: number, waterMl: number): string {
  const parts: string[] = [];
  if (nMeals > 0) parts.push(nMeals === 1 ? i18n.t("home.recapMealOne") : i18n.t("home.recapMealMany", { n: nMeals }));
  if (nWorkouts > 0) parts.push(nWorkouts === 1 ? i18n.t("home.recapWorkout") : i18n.t("home.recapWorkoutMany", { n: nWorkouts }));
  if (waterMl > 0) parts.push(i18n.t("home.recapWater", { ml: waterMl.toLocaleString("en-US") }));
  if (parts.length === 0) return "";
  return `${joinSegments(parts)} — ${i18n.t("home.recapTail")}`;
}

// ── §5.6 supplement timing heuristic ──────────────────────────────────────────

/** Map a supplement's free-text timing to a habit time (reference PDF → 10:00/13:00/13:00). */
export function supplementTime(timing?: string): string {
  const t = (timing ?? "").toLowerCase();
  if (t.includes("lunch") || t.includes("dinner")) return "13:00";
  if (t.includes("morning") || t.includes("wake")) return "08:00";
  return "10:00";
}

// ── §5.6 apply usuals (INDICES — reconciliation §1) ───────────────────────────
// No doc rewrite, no reorder: set usualOptionIndex on meals and usualSwapIndex on
// the chosen composition's items. Chip index space: 0 = the meal's own items
// (usualOptionIndex absent), k≥1 = options[k-1].

/**
 * @param chosenOption mealIndex → chip index (0 = base composition).
 * @param chosenSwap   `${mealIndex}_${chipIndex}_${itemIndex}` → swapIndex.
 */
export function applyUsuals(
  doc: EatingPlanDraft,
  chosenOption: Record<number, number>,
  chosenSwap: Record<string, number>,
): EatingPlanDraft {
  const withSwaps = (items: PlanItem[], mi: number, chip: number): PlanItem[] =>
    items.map((it, ii) => {
      const s = chosenSwap[`${mi}_${chip}_${ii}`];
      return s != null && it.swaps?.[s] ? { ...it, usualSwapIndex: s } : it;
    });

  return {
    ...doc,
    status: "ready",
    meals: doc.meals.map((meal, mi) => {
      const hasOptions = (meal.options?.length ?? 0) > 0;
      const chip = hasOptions ? (chosenOption[mi] ?? 0) : 0;
      const next = { ...meal };
      if (hasOptions) {
        if (chip === 0) delete (next as { usualOptionIndex?: number }).usualOptionIndex;
        else next.usualOptionIndex = chip - 1;
      }
      // Set usual swaps on the chosen composition only.
      if (chip === 0) next.items = withSwaps(meal.items, mi, 0);
      else if (meal.options) next.options = meal.options.map((o, oi) => (oi === chip - 1 ? { ...o, items: withSwaps(o.items, mi, chip) } : o));
      return next;
    }),
  };
}
