import type { EntryDetail, LogEntry, NewEntry } from "../api/client";
import { uuid } from "../lib/uuid";
import { getDb } from "./db";

/** A log entry as stored locally. `id` is the local uuid (also the Idempotency-Key). */
export type LocalEntry = NewEntry & {
  id: string;
  serverId?: string;
  // `failed` = the sync was dropped as poison (a non-retryable server rejection or a
  // dead parked capture). Terminal — Home stops promising "waiting to sync" (audit 1.8).
  syncState: "pending" | "synced" | "failed";
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
  // Canonicalize to a UTC instant (…Z) so all stored timestamps are lexicographically
  // comparable — offset-bearing (+01:00) backend timestamps otherwise land in the wrong
  // local day in entriesForDay's string range query. Same instant, sent as-is to sync.
  const occurredAt = new Date(entry.occurredAt).toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO entries (id, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.type,
        occurredAt,
        entry.inputMethod,
        entry.sourcePhrase ?? null,
        entry.isEstimate ? 1 : 0,
        JSON.stringify(entry.detail),
      ],
    );
    db.runSync(`INSERT INTO outbox (entryId) VALUES (?)`, [id]);
  });
  return { ...entry, id, occurredAt, syncState: "pending" };
}

/** Raw capture parked offline, awaiting interpretation on reconnect. */
export type PendingParse = {
  id: string;
  kind: "text" | "photo";
  text?: string;
  imageUri?: string;
  capturedAt: string;
};

/**
 * Park a capture that couldn't reach /parse offline and enqueue an `interpret`
 * outbox op. On reconnect the drain parses it and its drafts become entries —
 * nothing is lost offline. Returns the pending id.
 */
export function enqueueInterpretation(input: Omit<PendingParse, "id">): string {
  const db = getDb();
  const id = uuid();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO pending_parse (id, kind, text, imageUri, capturedAt) VALUES (?, ?, ?, ?, ?)`,
      [id, input.kind, input.text ?? null, input.imageUri ?? null, input.capturedAt],
    );
    db.runSync(`INSERT INTO outbox (entryId, op) VALUES (?, 'interpret')`, [id]);
  });
  return id;
}

export function getPending(id: string): PendingParse | null {
  const r = getDb().getFirstSync<{
    id: string;
    kind: string;
    text: string | null;
    imageUri: string | null;
    capturedAt: string;
  }>(`SELECT * FROM pending_parse WHERE id = ?`, [id]);
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind as PendingParse["kind"],
    text: r.text ?? undefined,
    imageUri: r.imageUri ?? undefined,
    capturedAt: r.capturedAt,
  };
}

export function deletePending(id: string): void {
  getDb().runSync(`DELETE FROM pending_parse WHERE id = ?`, [id]);
}

/**
 * Write (or re-answer) a habit check-in. The entry id is deterministic —
 * `${habitId}:${dateKey}` — so it doubles as the Idempotency-Key (BE-024: one
 * check-in per habit per day). First answer enqueues a `create`; changing an
 * already-synced answer enqueues an `update` (PATCH). While a create is still
 * pending, we just rewrite the detail in place — the queued POST carries it.
 */
export function upsertCheckin(habitId: string, dateKey: string, entry: NewEntry): LocalEntry {
  const db = getDb();
  const id = `${habitId}:${dateKey}`;
  const occurredAt = new Date(entry.occurredAt).toISOString();
  const existing = getEntry(id);
  db.withTransactionSync(() => {
    if (!existing) {
      db.runSync(
        `INSERT INTO entries (id, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, entry.type, occurredAt, entry.inputMethod, entry.sourcePhrase ?? null, entry.isEstimate ? 1 : 0, JSON.stringify(entry.detail)],
      );
      db.runSync(`INSERT INTO outbox (entryId, op) VALUES (?, 'create')`, [id]);
    } else {
      db.runSync(
        `UPDATE entries SET occurredAt = ?, inputMethod = ?, sourcePhrase = ?, isEstimate = ?, detail = ?, syncState = 'pending' WHERE id = ?`,
        [occurredAt, entry.inputMethod, entry.sourcePhrase ?? null, entry.isEstimate ? 1 : 0, JSON.stringify(entry.detail), id],
      );
      // Only enqueue a PATCH if the create already synced AND nothing is queued;
      // a still-pending create will send the fresh detail on its own.
      const queued = db.getFirstSync<{ seq: number }>(`SELECT seq FROM outbox WHERE entryId = ? LIMIT 1`, [id]);
      if (existing.syncState === "synced" && !queued) {
        db.runSync(`INSERT INTO outbox (entryId, op) VALUES (?, 'update')`, [id]);
      }
    }
  });
  return { ...entry, id, occurredAt, syncState: "pending" };
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

/** Entries of one kind within [start, end), ascending — used by detail history strips. */
export function entriesInRange(type: LocalEntry["type"], start: Date, end: Date): LocalEntry[] {
  const rows = getDb().getAllSync<Row>(
    `SELECT * FROM entries WHERE type = ? AND occurredAt >= ? AND occurredAt < ? ORDER BY occurredAt ASC`,
    [type, start.toISOString(), end.toISOString()],
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

/** Terminal failure: the outbox dropped this entry's op as poison (audit 1.8). */
export function markFailed(localId: string): void {
  getDb().runSync(`UPDATE entries SET syncState = 'failed' WHERE id = ?`, [localId]);
}
