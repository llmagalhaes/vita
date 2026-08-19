/**
 * APP-097 — the Day panel's water card maths + write.
 *
 * The vessel fills against 2 500 ml (README §3 "Misc"). That is a *scale*, not a
 * goal: nothing above it is praised, nothing below it is flagged, and the card never
 * says "left" — it says how much you drank.
 */
import { api } from "../api";
import { addLocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";

/** Vessel scale (README §3): `height:%` of 2 500 ml, transition .6s. */
export const WATER_SCALE_ML = 2500;
export const WATER_FILL_MS = 600;
/** One tap adds this much (prototype `addWater`). */
export const WATER_QUICK_ML = 250;
/** The exact-amount modal: slider band, and the wider band a typed value is clamped into. */
export const WATER_SLIDER = { min: 50, max: 1000, step: 50 } as const;
export const WATER_TYPED = { min: 0, max: 2000 } as const;

/** 0–100 fill percentage of the vessel. */
export const waterPct = (ml: number): number => Math.min(100, Math.round((ml / WATER_SCALE_ML) * 100));

/** Typed entry is clamped and whole-ml, never rejected (dual input everywhere). */
export const clampTypedMl = (ml: number): number =>
  Math.round(Math.min(WATER_TYPED.max, Math.max(WATER_TYPED.min, ml)));

/** Log a drink. A plain local entry — water alone never closes a day (PLAN R1). */
export function addWater(ml: number, now: Date = new Date()): void {
  addLocalEntry({
    type: "water",
    occurredAt: now.toISOString(),
    inputMethod: "tap",
    isEstimate: false,
    detail: { amountMl: ml },
  });
  logChanged();
  void drainOutbox(api)
    .then(({ synced }) => {
      if (synced > 0) logChanged();
    })
    .catch(() => {});
}
