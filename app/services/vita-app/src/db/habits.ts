/**
 * Habit definitions — device-local (standing decision D1). Habit shapes never
 * leave the phone; only check-in RESULTS persist server-side (as `checkin`
 * entries, see src/habits/checkins.ts). No streaks, no scores — a habit is just
 * a name, a schedule and an on/off switch.
 */
import { uuid } from "../lib/uuid";
import { getDb } from "./db";

export type HabitKind = "plain" | "plan";

export type Habit = {
  id: string;
  name: string;
  /** length 7; index 0 = Sunday, matching Date.getDay(). */
  days: boolean[];
  time: string; // HH:MM
  enabled: boolean;
  kind: HabitKind;
  /** Plan-meal link (by meal name) when kind === "plan". */
  planMealName?: string;
  createdAt: string;
};

export type HabitInput = Omit<Habit, "id" | "createdAt">;

type Row = {
  id: string;
  name: string;
  days: string;
  time: string;
  enabled: number;
  kind: string;
  planMealName: string | null;
  createdAt: string;
};

const rowToHabit = (r: Row): Habit => ({
  id: r.id,
  name: r.name,
  days: JSON.parse(r.days) as boolean[],
  time: r.time,
  enabled: r.enabled === 1,
  kind: r.kind as HabitKind,
  planMealName: r.planMealName ?? undefined,
  createdAt: r.createdAt,
});

export function listHabits(): Habit[] {
  return getDb()
    .getAllSync<Row>(`SELECT * FROM habits ORDER BY createdAt ASC`)
    .map(rowToHabit);
}

export function getHabit(id: string): Habit | null {
  const r = getDb().getFirstSync<Row>(`SELECT * FROM habits WHERE id = ?`, [id]);
  return r ? rowToHabit(r) : null;
}

export function createHabit(input: HabitInput): Habit {
  const habit: Habit = { ...input, id: uuid(), createdAt: new Date().toISOString() };
  getDb().runSync(
    `INSERT INTO habits (id, name, days, time, enabled, kind, planMealName, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      habit.id,
      habit.name,
      JSON.stringify(habit.days),
      habit.time,
      habit.enabled ? 1 : 0,
      habit.kind,
      habit.planMealName ?? null,
      habit.createdAt,
    ],
  );
  return habit;
}

/** Partial update — only the passed fields change. */
export function updateHabit(id: string, patch: Partial<HabitInput>): void {
  const cur = getHabit(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  getDb().runSync(
    `UPDATE habits SET name = ?, days = ?, time = ?, enabled = ?, kind = ?, planMealName = ? WHERE id = ?`,
    [
      next.name,
      JSON.stringify(next.days),
      next.time,
      next.enabled ? 1 : 0,
      next.kind,
      next.planMealName ?? null,
      id,
    ],
  );
}

export function deleteHabit(id: string): void {
  getDb().runSync(`DELETE FROM habits WHERE id = ?`, [id]);
}
