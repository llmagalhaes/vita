import { getDb } from "./db";

/** Tiny JSON key-value store on SQLite — user settings live here in M1. */
export function kvGet<T>(key: string): T | null {
  const row = getDb().getFirstSync<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, [key]);
  return row ? (JSON.parse(row.value) as T) : null;
}

export function kvSet(key: string, value: unknown): void {
  getDb().runSync(
    `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

// Dirty flag for offline-first docs (plan/program/vacation): set on a local write,
// cleared once the server push succeeds. A dirty doc must never be overwritten by
// a hydrate — the unpushed local edit wins and is re-pushed instead (audit 1.4).
export const isDirty = (key: string): boolean => kvGet<boolean>(`${key}.dirty`) === true;
export const setDirty = (key: string): void => kvSet(`${key}.dirty`, true);
export const clearDirty = (key: string): void => kvSet(`${key}.dirty`, false);
