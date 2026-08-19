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
  syncState TEXT NOT NULL DEFAULT 'pending', -- pending | synced | failed
  needsReview INTEGER NOT NULL DEFAULT 0     -- 1 = auto-added offline, awaiting user review
);
CREATE INDEX IF NOT EXISTS idx_entries_occurredAt ON entries(occurredAt);

CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entryId TEXT NOT NULL,             -- entries.id (create/update), pending_parse.id (interpret) OR the SERVER id (delete)
  op TEXT NOT NULL DEFAULT 'create', -- create | update | interpret | delete
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL DEFAULT 0   -- epoch ms; 0 = due now
);

-- Raw capture that couldn't reach /parse offline. Drained via an 'interpret' outbox
-- op: on reconnect it's parsed and its drafts become entries, so nothing is lost.
CREATE TABLE IF NOT EXISTS pending_parse (
  id TEXT PRIMARY KEY,             -- uuid, referenced by outbox.entryId for op='interpret'
  kind TEXT NOT NULL,              -- 'text' | 'photo'
  text TEXT,                       -- raw words (text) or caption (photo)
  imageUri TEXT,                   -- local file uri (photo)
  capturedAt TEXT NOT NULL         -- when the user captured it (RFC 3339)
);

-- APP-094: DERIVED cache of a day's record — meals/workout/water rebuilt from the
-- entries table, merged with the day-scoped plan overlay (which is authoritative and
-- lives in kv, not here). Dropping a row is always safe: it rebuilds on read, and
-- every writer in entries.ts deletes the affected day so the cache can't go stale.
-- dirty = the day still has unsynced entries → a hydrate must not overwrite it.
CREATE TABLE IF NOT EXISTS day_record (
  date TEXT PRIMARY KEY,            -- local YYYY-MM-DD
  json TEXT NOT NULL,               -- DayRecord
  dirty INTEGER NOT NULL DEFAULT 0
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
  -- APP-108: the v3 kind / planMealName columns are gone from fresh databases. An
  -- older device still has them (kind is NOT NULL DEFAULT 'plain', planMealName is
  -- nullable) so the column-named INSERTs in db/habits.ts keep working either way.
  createdAt TEXT NOT NULL
);
`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("vita.db");
    db.execSync(SCHEMA);
    // needsReview landed after entries shipped; add it to pre-existing dbs.
    // ponytail: guarded ALTER over a full migration framework — one late column, ~5 dev users.
    const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(entries)`);
    if (!cols.some((c) => c.name === "needsReview")) {
      db.execSync(`ALTER TABLE entries ADD COLUMN needsReview INTEGER NOT NULL DEFAULT 0`);
    }
  }
  return db;
}

/** Tests only — forces a fresh in-memory db per test. */
export function resetDbForTests(): void {
  db?.closeSync();
  db = null;
}
