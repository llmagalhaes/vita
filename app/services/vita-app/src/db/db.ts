/**
 * Local SQLite — the app's source of truth for the log (APP-005, offline-first).
 * ponytail: sync API on purpose — queries are tiny row counts for ~5 users;
 * move hot paths to the async API only if profiling ever says so.
 */
import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,              -- local uuid; doubles as the Idempotency-Key
  serverId TEXT,                    -- set once synced
  type TEXT NOT NULL,               -- meal | water | workout
  occurredAt TEXT NOT NULL,         -- RFC 3339
  inputMethod TEXT NOT NULL,
  sourcePhrase TEXT,
  isEstimate INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,             -- JSON EntryDetail
  updatedAt TEXT,                   -- server updatedAt once synced (LWW marker)
  syncState TEXT NOT NULL DEFAULT 'pending'  -- pending | synced
);
CREATE INDEX IF NOT EXISTS idx_entries_occurredAt ON entries(occurredAt);

CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entryId TEXT NOT NULL,
  op TEXT NOT NULL DEFAULT 'create',
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL DEFAULT 0   -- epoch ms; 0 = due now
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,             -- device-local id (D1: definitions never leave the device)
  name TEXT NOT NULL,
  days TEXT NOT NULL,              -- JSON boolean[7]; index 0 = Sunday (Date.getDay())
  time TEXT NOT NULL,             -- HH:MM local
  enabled INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'plain',  -- 'plain' | 'plan'
  planMealName TEXT,              -- set when kind = 'plan' (links to a plan meal by name)
  createdAt TEXT NOT NULL
);
`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("vita.db");
    db.execSync(SCHEMA);
  }
  return db;
}

/** Tests only — forces a fresh in-memory db per test. */
export function resetDbForTests(): void {
  db?.closeSync();
  db = null;
}
