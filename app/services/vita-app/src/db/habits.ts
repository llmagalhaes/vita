/**
 * Habit definitions — device-local (standing decision D1). The habit's SCHEDULE
 * (days/time/enabled) never leaves the phone; a check-in RESULT does persist
 * server-side as a `checkin` entry, and that entry ships the habit's id, name and
 * name inside its (encrypted) detail — see src/habits/checkins.ts + CheckinDetail.
 * No streaks, no scores — a habit is just a name, a schedule and an on/off switch.
 *
 * APP-108: v4 has ONE kind of habit. The v3 `kind` ("plain" | "plan" | "digest") and
 * its `planMealName` link are gone with the per-meal check-in notifications; the two
 * columns survive in older databases (both nullable-or-defaulted) and are simply never
 * read or written again — no migration needed.
 */
import { uuid } from "../lib/uuid";
import { getDb } from "./db";

export type Habit = {
  id: string;
  name: string;
  /** length 7; index 0 = Sunday, matching Date.getDay(). */
  days: boolean[];
  time: string; // HH:MM
  enabled: boolean;
  createdAt: string;
};

export type HabitInput = Omit<Habit, "id" | "createdAt">;

type Row = {
  id: string;
  name: string;
  days: string;
  time: string;
  enabled: number;
  createdAt: string;
};

const rowToHabit = (r: Row): Habit => ({
  id: r.id,
  name: r.name,
  days: JSON.parse(r.days) as boolean[],
  time: r.time,
  enabled: r.enabled === 1,
  createdAt: r.createdAt,
});

// Named columns, not `*`: an older database still carries the dead `kind`/`planMealName`
// columns and this way they never reach the app again.
const COLS = `id, name, days, time, enabled, createdAt`;

export function listHabits(): Habit[] {
  return getDb()
    .getAllSync<Row>(`SELECT ${COLS} FROM habits ORDER BY createdAt ASC`)
    .map(rowToHabit);
}

export function getHabit(id: string): Habit | null {
  const r = getDb().getFirstSync<Row>(`SELECT ${COLS} FROM habits WHERE id = ?`, [id]);
  return r ? rowToHabit(r) : null;
}

export function createHabit(input: HabitInput): Habit {
  const habit: Habit = { ...input, id: uuid(), createdAt: new Date().toISOString() };
  getDb().runSync(
    `INSERT INTO habits (${COLS}) VALUES (?, ?, ?, ?, ?, ?)`,
    [habit.id, habit.name, JSON.stringify(habit.days), habit.time, habit.enabled ? 1 : 0, habit.createdAt],
  );
  return habit;
}

/** Partial update — only the passed fields change. */
export function updateHabit(id: string, patch: Partial<HabitInput>): void {
  const cur = getHabit(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  getDb().runSync(
    `UPDATE habits SET name = ?, days = ?, time = ?, enabled = ? WHERE id = ?`,
    [next.name, JSON.stringify(next.days), next.time, next.enabled ? 1 : 0, id],
  );
}

export function deleteHabit(id: string): void {
  getDb().runSync(`DELETE FROM habits WHERE id = ?`, [id]);
}

/** Re-insert a removed habit verbatim (preserves id + createdAt) — powers toast Undo. */
export function restoreHabit(habit: Habit): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO habits (${COLS}) VALUES (?, ?, ?, ?, ?, ?)`,
    [habit.id, habit.name, JSON.stringify(habit.days), habit.time, habit.enabled ? 1 : 0, habit.createdAt],
  );
}
