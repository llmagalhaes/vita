import { ApiError, type Api, type NewEntry } from "../api/client";
import { getDb } from "./db";
import { getEntry, markSynced } from "./entries";

type OutboxRow = { seq: number; entryId: string; op: string; attempts: number; nextAttemptAt: number };

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** 1s, 2s, 4s… capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * Drain due outbox items in order. Each entry's local id is its Idempotency-Key,
 * so a retry after a lost response replays (200) instead of duplicating.
 * Stops at the first failure (offline etc.) — the failed item backs off and
 * everything behind it waits, preserving order.
 */
export async function drainOutbox(api: Api, now: () => number = Date.now): Promise<{ synced: number }> {
  const db = getDb();
  let synced = 0;
  // Snapshot: items due now, oldest first.
  const due = db.getAllSync<OutboxRow>(
    `SELECT * FROM outbox WHERE nextAttemptAt <= ? ORDER BY seq ASC`,
    [now()],
  );
  for (const item of due) {
    const entry = getEntry(item.entryId);
    if (!entry) {
      db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]); // entry gone — drop
      continue;
    }
    const payload: NewEntry = {
      type: entry.type,
      occurredAt: entry.occurredAt,
      inputMethod: entry.inputMethod,
      sourcePhrase: entry.sourcePhrase,
      isEstimate: entry.isEstimate,
      detail: entry.detail,
    };
    try {
      // Check-in re-answers ride an `update` op → PATCH the already-synced entry
      // (its deterministic id was the create's Idempotency-Key). Everything else
      // is an idempotent create replay.
      const server =
        item.op === "update" && entry.serverId
          ? await api.patchEntry(entry.serverId, { detail: entry.detail })
          : await api.createEntry(entry.id, payload);
      markSynced(entry.id, server);
      db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
      synced++;
    } catch (err) {
      // Non-retryable client error (bad/duplicate/unprocessable payload): retrying can
      // never succeed and would stall every item behind it. Drop the poison pill and
      // keep draining. Network/5xx: back off and stop (order preserved).
      if (err instanceof ApiError && [400, 409, 422].includes(err.status)) {
        db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
        continue;
      }
      db.runSync(`UPDATE outbox SET attempts = attempts + 1, nextAttemptAt = ? WHERE seq = ?`, [
        now() + backoffMs(item.attempts),
        item.seq,
      ]);
      break;
    }
  }
  return { synced };
}

export function pendingCount(): number {
  const row = getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`);
  return row?.n ?? 0;
}
