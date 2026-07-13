import type { EntryDetail, LogEntry, NewEntry } from "../api/client";
import { uuid } from "../lib/uuid";
import { getDb } from "./db";

/** A log entry as stored locally. `id` is the local uuid (also the Idempotency-Key). */
export type LocalEntry = NewEntry & {
  id: string;
  serverId?: string;
  syncState: "pending" | "synced";
};

type Row = {
  id: string;
  serverId: string | null;
  type: string;
  occurredAt: string;
  inputMethod: string;
  sourcePhrase: string | null;
  isEstimate: number;
  detail: string;
  syncState: string;
};

function rowToEntry(r: Row): LocalEntry {
  return {
    id: r.id,
    serverId: r.serverId ?? undefined,
    type: r.type as LocalEntry["type"],
    occurredAt: r.occurredAt,
    inputMethod: r.inputMethod as LocalEntry["inputMethod"],
    sourcePhrase: r.sourcePhrase ?? undefined,
    isEstimate: r.isEstimate === 1,
    detail: JSON.parse(r.detail) as EntryDetail,
    syncState: r.syncState as LocalEntry["syncState"],
  };
}

/** Insert locally (always succeeds instantly) and enqueue for sync. */
export function addLocalEntry(entry: NewEntry): LocalEntry {
  const db = getDb();
  const id = uuid();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO entries (id, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.type,
        entry.occurredAt,
        entry.inputMethod,
        entry.sourcePhrase ?? null,
        entry.isEstimate ? 1 : 0,
        JSON.stringify(entry.detail),
      ],
    );
    db.runSync(`INSERT INTO outbox (entryId) VALUES (?)`, [id]);
  });
  return { ...entry, id, syncState: "pending" };
}

/** Entries whose occurredAt falls on the given local calendar day, ascending. */
export function entriesForDay(day: Date): LocalEntry[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = getDb().getAllSync<Row>(
    `SELECT * FROM entries WHERE occurredAt >= ? AND occurredAt < ? ORDER BY occurredAt ASC`,
    [start.toISOString(), end.toISOString()],
  );
  return rows.map(rowToEntry);
}

export function getEntry(id: string): LocalEntry | null {
  const row = getDb().getFirstSync<Row>(`SELECT * FROM entries WHERE id = ?`, [id]);
  return row ? rowToEntry(row) : null;
}

/** Reconcile a local entry with the server's LogEntry (last-write-wins by updatedAt). */
export function markSynced(localId: string, server: LogEntry): void {
  getDb().runSync(
    `UPDATE entries SET serverId = ?, updatedAt = ?, syncState = 'synced' WHERE id = ?`,
    [server.id, server.updatedAt, localId],
  );
}
