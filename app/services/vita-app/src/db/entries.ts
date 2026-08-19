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
  /**
   * Server receive time, present once synced (the `updatedAt` column). Surfaced under
   * the wire's name because that is what `fromMealEntry` reads: a record whose
   * `loggedAt` lands on a later day than `occurredAt` was **closed later, by you**
   * (PLAN R2, APP-099). Absent while the write is still local, so an offline
   * retro-close only reads as retro once it reaches the server. (APP-099 touched
   * APP-094's file here: without it `isRetro` could never fire on a local record.)
   */
  loggedAt?: string;
  // true = auto-added on reconnect from a parked offline capture (interpretPending),
  // so it never passed the confirm/adjust/discard sheet. Home surfaces a review banner
  // to give that affordance back (CEO Round 12 #2). Normal online confirms are NOT flagged.
  needsReview?: boolean;
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
  updatedAt: string | null;
  syncState: string;
  needsReview: number;
};

/**
 * Drop the derived day-record cache row for the day an entry belongs to (APP-094).
 * Called from every write path here, so the cache can never disagree with `entries`
 * — it just rebuilds on the next read. ponytail: invalidate-on-write beats any
 * freshness check, which would cost the very query the cache exists to avoid.
 */
export function invalidateDay(occurredAt: string): void {
  const d = new Date(occurredAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  getDb().runSync(`DELETE FROM day_record WHERE date = ?`, [date]);
}

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
    loggedAt: r.updatedAt ?? undefined,
    syncState: r.syncState as LocalEntry["syncState"],
    needsReview: r.needsReview === 1,
  };
}

/**
 * Insert locally (always succeeds instantly) and enqueue for sync. `needsReview`
 * flags an entry auto-added from a parked offline capture — it skipped the online
 * confirm sheet, so Home surfaces a review banner for it (CEO Round 12 #2).
 */
export function addLocalEntry(entry: NewEntry, needsReview = false): LocalEntry {
  const db = getDb();
  const id = uuid();
  // Canonicalize to a UTC instant (…Z) so all stored timestamps are lexicographically
  // comparable — offset-bearing (+01:00) backend timestamps otherwise land in the wrong
  // local day in entriesForDay's string range query. Same instant, sent as-is to sync.
  const occurredAt = new Date(entry.occurredAt).toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO entries (id, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail, needsReview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.type,
        occurredAt,
        entry.inputMethod,
        entry.sourcePhrase ?? null,
        entry.isEstimate ? 1 : 0,
        JSON.stringify(entry.detail),
        needsReview ? 1 : 0,
      ],
    );
    db.runSync(`INSERT INTO outbox (entryId) VALUES (?)`, [id]);
  });
  invalidateDay(occurredAt);
  return { ...entry, id, occurredAt, syncState: "pending", needsReview };
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
 * Write (or rewrite) an entry under a DETERMINISTIC id, which doubles as the
 * Idempotency-Key: one check-in per habit per day (`${habitId}:${dateKey}`, BE-024),
 * one day record per plan meal per day (`meal:${date}:${planMealId}`, APP-094).
 * First write enqueues a `create`; changing an already-synced one enqueues an
 * `update` (PATCH). While a create is still pending we just rewrite the detail in
 * place — the queued POST carries it.
 */
export function upsertEntry(id: string, entry: NewEntry): LocalEntry {
  const db = getDb();
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
      // Only enqueue if nothing is queued; a still-pending create sends the fresh
      // detail on its own. A `failed` row has NO op left behind it (the poison drop
      // removed it), so re-recording it must queue one too — otherwise the row goes
      // back to `pending` with nothing to send and sits at "waiting to sync" forever,
      // the exact lie `failed` was introduced to stop (audit 1.8). It re-creates when
      // the server never got it (no serverId) and PATCHes when it did.
      const queued = db.getFirstSync<{ seq: number }>(`SELECT seq FROM outbox WHERE entryId = ? LIMIT 1`, [id]);
      if (!queued && (existing.syncState === "synced" || existing.syncState === "failed")) {
        db.runSync(`INSERT INTO outbox (entryId, op) VALUES (?, ?)`, [id, existing.serverId ? "update" : "create"]);
      }
    }
  });
  invalidateDay(occurredAt);
  return { ...entry, id, occurredAt, syncState: "pending" };
}

/** Habit check-in flavour of {@link upsertEntry} — the id is `${habitId}:${dateKey}`. */
export const upsertCheckin = (habitId: string, dateKey: string, entry: NewEntry): LocalEntry =>
  upsertEntry(`${habitId}:${dateKey}`, entry);

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

/** Any entry (any type) with occurredAt in [start, end)? — drives the Trends consistency card. */
export function hasEntriesInRange(start: Date, end: Date): boolean {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entries WHERE occurredAt >= ? AND occurredAt < ?`,
    [start.toISOString(), end.toISOString()],
  );
  return (row?.n ?? 0) > 0;
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
  invalidateDay(server.occurredAt); // the day's `dirty` flag just changed
}

/** Terminal failure: the outbox dropped this entry's op as poison (audit 1.8). */
export function markFailed(localId: string): void {
  getDb().runSync(`UPDATE entries SET syncState = 'failed' WHERE id = ?`, [localId]);
}

/** Entries auto-added offline and still awaiting review, oldest→newest. */
export function entriesNeedingReview(): LocalEntry[] {
  const rows = getDb().getAllSync<Row>(
    `SELECT * FROM entries WHERE needsReview = 1 ORDER BY occurredAt ASC`,
  );
  return rows.map(rowToEntry);
}

export function countNeedsReview(): number {
  const row = getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM entries WHERE needsReview = 1`);
  return row?.n ?? 0;
}

/** Keep the entry, drop the review flag (banner shrinks by one). */
export function clearReview(id: string): void {
  getDb().runSync(`UPDATE entries SET needsReview = 0 WHERE id = ?`, [id]);
}

/**
 * Delete an entry locally AND on the server (APP-112). Used by "Discard" on a review
 * card and by the failed-card dismiss (audit Q2). Deleting cancels whatever was queued
 * for this entry; if it had already synced, a `delete` op carries its SERVER id to
 * DELETE /entries/{id} — so a restore can never resurrect it. Created and deleted while
 * offline = the create is simply cancelled, zero server calls.
 * ponytail: the delete op stores the server id in outbox.entryId because the local row
 * is gone by drain time — there is nothing left to look it up from. Known gap: a create
 * whose response was lost (server stored it, no local serverId) leaves a server orphan;
 * closing that needs the create to complete first, which is more machinery than it earns.
 */
export function deleteEntry(id: string): void {
  const db = getDb();
  const gone = getEntry(id);
  if (gone) invalidateDay(gone.occurredAt);
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM entries WHERE id = ?`, [id]);
    db.runSync(`DELETE FROM outbox WHERE entryId = ?`, [id]);
    if (gone?.serverId) {
      db.runSync(`INSERT INTO outbox (entryId, op) VALUES (?, 'delete')`, [gone.serverId]);
    }
  });
}
