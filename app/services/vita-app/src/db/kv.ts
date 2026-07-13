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
