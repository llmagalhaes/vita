/**
 * APP-097 — body-weight readings for the Day panel's Weight card.
 *
 * A reading is an ordinary `weight` entry (contract 0.8.0) written through the same
 * idempotent path the day record uses (APP-094): the id `weight:<date>` gives ONE
 * reading per day, so logging twice corrects the day instead of stacking readings —
 * exactly the check-in pattern. No goal, no delta, no judgement: a value and a time.
 *
 * Health-Connect weight is NOT read here (no HC weight reader exists in the app yet),
 * so every reading is one the user typed — which is what the card's source line says.
 */
import { api } from "../api";
import type { WeightDetail } from "../api/client";
import { numOf } from "../build/parts";
import { deleteEntry, entriesInRange, getEntry, upsertEntry, type LocalEntry } from "../db/entries";
import { logChanged } from "../db/notify";
import { drainOutbox } from "../db/outbox";
import { dayKey } from "./record";

/**
 * R18-D — the modal is a typed field, full stop. It used to be a slider 60–100 kg
 * with a typed field beside it; the slider's ceiling excluded anyone above 100 kg
 * (CEO, device round 18), and a per-keystroke clamp made the field unusable anyway
 * (typing "8" jumped to the floor). One input, one honest range.
 */
export const WEIGHT_TYPED = { min: 20, max: 300 } as const;
/** Where the field starts when there is no reading yet (prototype `wtVal` seed). */
export const WEIGHT_DEFAULT = 78.4;

export const weightEntryId = (date: string): string => `weight:${date}`;

/** Round to the 0.1 kg the slider and the readout both speak. */
export const roundKg = (kg: number): number => Math.round(kg * 10) / 10;

/**
 * A reading as the user typed it — comma or dot (`numOf`), rounded to 0.1 kg.
 * `null` for anything that isn't a weight, so a half-typed "8" disables Save
 * instead of silently becoming 20 kg.
 */
export const parsedKg = (text: string): number | null => {
  const kg = roundKg(numOf(text));
  return kg >= WEIGHT_TYPED.min && kg <= WEIGHT_TYPED.max ? kg : null;
};

export type WeightReading = { kg: number; at: string };

const readingOf = (e: LocalEntry): WeightReading => ({ kg: (e.detail as WeightDetail).kg, at: e.occurredAt });

/** The most recent reading within the last `days` (default 400 — a yearly weigh-in still shows). */
export function latestWeight(now: Date = new Date(), days = 400): WeightReading | null {
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  const rows = entriesInRange("weight", start, end);
  const last = rows[rows.length - 1];
  return last ? readingOf(last) : null;
}

/** Today's reading, if the user already logged one (the modal seeds from it). */
export const todaysWeight = (now: Date = new Date()): WeightReading | null => {
  const e = getEntry(weightEntryId(dayKey(now)));
  return e ? readingOf(e) : null;
};

/**
 * Write today's reading. Returns an `undo` that restores exactly what was there
 * before — the previous reading for the day, or nothing at all.
 */
export function recordWeight(kg: number, now: Date = new Date()): { undo: () => void } {
  const id = weightEntryId(dayKey(now));
  const before = getEntry(id);
  const detail: WeightDetail = { kg: roundKg(kg) };
  upsertEntry(id, {
    type: "weight",
    occurredAt: now.toISOString(),
    inputMethod: "tap",
    isEstimate: false,
    detail,
  });
  push();
  return {
    undo: () => {
      if (before) upsertEntry(id, before);
      else deleteEntry(id);
      push();
    },
  };
}

function push(): void {
  logChanged();
  void drainOutbox(api)
    .then(({ synced }) => {
      if (synced > 0) logChanged();
    })
    .catch(() => {}); // offline: the op just waits in the outbox
}
