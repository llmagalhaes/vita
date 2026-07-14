/**
 * Manual energy "spent" (APP-032, standing decision D8). "Spent" is the sum of
 * logged workout kcal (a labeled estimate); this adds a manual entry via the
 * existing outbox path with NO new endpoint or shape — it's just a `workout`
 * entry carrying kcal and no exercises. Dual input: type a number, or speak
 * "burned 300" through the capture pill (mockParse handles that phrase).
 */
import type { NewEntry } from "../api/client";
import { addLocalEntry } from "../db/entries";

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
