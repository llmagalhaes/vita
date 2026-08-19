/**
 * APP-094 persistence. **No `/days` on the wire** (PLAN R1): a day record is the
 * ordinary meal/workout entries of that date, written through the existing outbox
 * under deterministic ids (`meal:<date>:<planMealId>`), so close-the-day is just a
 * batch of idempotent entry writes and retro-close is the same batch with
 * `occurredAt` on that day (R10).
 *
 * `day_record` (see db.ts) is a DERIVED cache of what those entries add up to, plus
 * the day-scoped plan overlay — the one part that isn't derivable and is therefore
 * the only thing a rebuild must preserve. Every write path in entries.ts deletes the
 * affected day's row, so a stale cache is impossible; a row is rebuilt on read.
 */
import { api } from "../api";
import type { WaterDetail } from "../api/client";
import {
  dayKey,
  emptyDay,
  emptyOverlay,
  fromMealEntry,
  fromWorkoutEntry,
  toMealEntry,
  toWorkoutEntry,
  type DayOverlay,
  type DayRecord,
  type MealRecord,
  type WorkoutRecord,
} from "../day/record";
import { getDb } from "./db";
import { entriesForDay, upsertEntry } from "./entries";
import { kvGet, kvSet } from "./kv";
import { logChanged } from "./notify";

const parseDate = (date: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};

/**
 * The overlay is AUTHORITATIVE state, not cache: it lives in kv keyed by date, so an
 * entry write invalidating the derived `day_record` row can never take a user's
 * portion tweak with it. Keying by date is what makes it day-scoped ("only counts
 * for today") with no timers and no lazy-reset dance — yesterday's key is simply a
 * different key.
 */
const overlayKey = (date: string) => `day.overlay.${date}`;
const readOverlay = (date: string): DayOverlay => ({ ...emptyOverlay(), ...(kvGet<DayOverlay>(overlayKey(date)) ?? {}) });

/** Rebuild the derived half from `entries`; the overlay is read from its own store. */
function rebuild(date: string, overlay: DayOverlay): { rec: DayRecord; dirty: boolean } {
  const rows = entriesForDay(parseDate(date));
  const rec: DayRecord = { ...emptyDay(date), overlay };
  let dirty = false;
  for (const e of rows) {
    if (e.syncState !== "synced") dirty = true;
    if (e.type === "meal") {
      const m = fromMealEntry(e);
      if (m) rec.meals.push(m);
    } else if (e.type === "workout") {
      const w = fromWorkoutEntry(e);
      if (w) rec.workout = w;
    } else if (e.type === "water") {
      rec.waterMl += (e.detail as WaterDetail).amountMl ?? 0;
    }
  }
  return { rec, dirty };
}

type Row = { json: string; dirty: number };

const readRow = (date: string): Row | null =>
  getDb().getFirstSync<Row>(`SELECT json, dirty FROM day_record WHERE date = ?`, [date]);

const writeRow = (rec: DayRecord, dirty: boolean): void => {
  getDb().runSync(
    `INSERT INTO day_record (date, json, dirty) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET json = excluded.json, dirty = excluded.dirty`,
    [rec.date, JSON.stringify(rec), dirty ? 1 : 0],
  );
};

/** The day's record — cache hit, or rebuilt from entries + overlay and cached. */
export function getDayRecord(date: string = dayKey()): DayRecord {
  const row = readRow(date);
  if (row) return JSON.parse(row.json) as DayRecord;
  const { rec, dirty } = rebuild(date, readOverlay(date));
  writeRow(rec, dirty);
  return rec;
}

/** True when the day still has entries that never reached the server. */
export const isDayDirty = (date: string): boolean => {
  getDayRecord(date); // materialize
  return readRow(date)?.dirty === 1;
};

/**
 * Adopt a server-derived record for a day. **Never overwrites a dirty row** — an
 * unsynced local write always wins and is re-pushed instead (audit 1.4). Returns
 * false when the hydrate was refused.
 */
export function hydrateDay(rec: DayRecord): boolean {
  if (isDayDirty(rec.date)) return false;
  const local = getDayRecord(rec.date);
  writeRow({ ...rec, overlay: local.overlay }, false); // the overlay is device-local, never server-owned
  logChanged();
  return true;
}

// ---- overlay (day-scoped plan tweaks) ---------------------------------------

export const getOverlay = (date: string = dayKey()): DayOverlay => readOverlay(date);

/**
 * Patch the day's overlay. Device-local by design — the server's `PUT /plan/portions`
 * still exists but this round stops writing to it (the day record is the truth now),
 * which also removes the v3 asymmetry where an option switch was session-local while
 * portions persisted.
 */
export function setOverlay(date: string, patch: Partial<DayOverlay>): DayOverlay {
  const overlay: DayOverlay = { ...readOverlay(date), ...patch };
  kvSet(overlayKey(date), overlay);
  getDb().runSync(`DELETE FROM day_record WHERE date = ?`, [date]); // cache rebuilds with it
  logChanged();
  return overlay;
}

// ---- writes (ordinary entries, through the existing outbox) ------------------

/**
 * Persist meal records: one idempotent entry write each, so a close-the-day batch
 * replays safely and a re-record PATCHes the same entry instead of duplicating it.
 * Fires a best-effort drain; offline, the ops just sit in the outbox.
 */
export function recordMeals(recs: MealRecord[], sourcePhrase?: string): void {
  if (recs.length === 0) return;
  for (const r of recs) upsertEntry(r.entryId, toMealEntry(r, sourcePhrase));
  drain();
}

export function recordWorkout(rec: WorkoutRecord): void {
  upsertEntry(rec.entryId, toWorkoutEntry(rec));
  drain();
}

function drain(): void {
  logChanged();
  // Lazy require mirrors plan.ts — keeps the outbox↔db cycle out of module load.
  const { drainOutbox } = require("./outbox") as typeof import("./outbox");
  void drainOutbox(api).catch(() => {});
}

/** Convenience for the close/retro flows: write the batch a CloseResult produced. */
export const applyClose = (result: { written: MealRecord[] }): void => recordMeals(result.written);

export type { DayOverlay, DayRecord, MealRecord, WorkoutRecord };

// ── "closed" is a device-local day flag ───────────────────────────────────────
// APP-094 deliberately put no `closed` field on the wire (R2: "closed later, by you"
// is DERIVED from loggedAt). But Close-the-day vs Reopen is a real UI state that no
// record can express — a day where every meal happens to be confirmed is not the same
// as a day you closed. Keyed by date like the overlay, so there is no rollover dance.
const closedKey = (date: string) => `day.closed.${date}`;
export const isDayClosed = (date: string): boolean => kvGet<boolean>(closedKey(date)) === true;
export function setDayClosed(date: string, closed: boolean): void {
  kvSet(closedKey(date), closed);
  logChanged();
}
