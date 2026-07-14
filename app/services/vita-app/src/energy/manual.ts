/**
 * Manual energy "spent" (APP-032, standing decision D8). "Spent" is the sum of
 * logged workout kcal (a labeled estimate); this adds a manual entry via the
 * existing outbox path with NO new endpoint or shape — it's just a `workout`
 * entry carrying kcal and no exercises. Dual input: type a number, or speak
 * "burned 300" through the capture pill (mockParse handles that phrase).
 */
import type { MealDetail, NewEntry, WorkoutDetail } from "../api/client";
import { addLocalEntry, entriesForDay } from "../db/entries";

/** "burned 300", "burnt 450 kcal", "spent 200 calories" → kcal, else null. */
export function parseBurned(text: string): number | null {
  const m = text.toLowerCase().match(/(?:burn(?:ed|t)?|spent)\s+(\d{1,5})/);
  return m ? parseInt(m[1]!, 10) : null;
}

/** A workout entry with only kcal — the manual "spent" write (no exercises). */
export function manualEnergyEntry(kcal: number, occurredAt = new Date().toISOString()): NewEntry {
  return {
    type: "workout",
    occurredAt,
    inputMethod: "tap",
    isEstimate: true,
    detail: { title: "Energy", kcal, exercises: [] },
  };
}

/** Log a manual spent-energy entry locally (drains to the server like any entry). */
export function logManualEnergy(kcal: number): void {
  addLocalEntry(manualEnergyEntry(kcal));
}

export type DayEnergy = { consumed: number; spent: number };

/**
 * Consumed (meal kcal) and spent (workout kcal) per day for the last 7 days, today
 * last. Both are read PER DAY from the log — no fabricated history (audit 1.1/2.2):
 * spent is the real workout kcal on that day, not today's total painted across the week.
 */
export function last7EnergySeries(today = new Date()): DayEnergy[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const day = entriesForDay(d);
    return {
      consumed: Math.round(
        day
          .filter((e) => e.type === "meal")
          .reduce((s, e) => s + ((e.detail as MealDetail).totals?.kcal ?? 0), 0),
      ),
      spent: Math.round(
        day
          .filter((e) => e.type === "workout")
          .reduce((s, e) => s + ((e.detail as WorkoutDetail).kcal ?? 0), 0),
      ),
    };
  });
}

/**
 * Chart scale = the largest consumed OR spent value across the series (≥1). Including
 * spent is what keeps every bar height ≤ 100% — a spent-only week no longer overflows
 * because max was consumed-only (audit 1.1).
 */
export const energyChartMax = (series: DayEnergy[]): number =>
  Math.max(1, ...series.flatMap((d) => [d.consumed, d.spent]));
