import { ApiError, type Api, type NewEntry } from "../api/client";
import { getDb } from "./db";
import { addLocalEntry, deletePending, getEntry, getPending, markSynced } from "./entries";

type OutboxRow = { seq: number; entryId: string; op: string; attempts: number; nextAttemptAt: number };

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** 1s, 2s, 4s… capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}

/** Server was reached but rejected the payload for good — retrying can never succeed. */
function isPoison(err: unknown): boolean {
  return err instanceof ApiError && [400, 409, 422].includes(err.status);
}

/**
 * Parse a parked offline capture and turn its drafts into local entries (which
 * enqueue their own create ops). Throws on network/5xx (→ back off) or a
 * non-retryable parse error (→ poison, dropped by the caller).
 */
async function interpretPending(api: Api, pendingId: string): Promise<void> {
  const p = getPending(pendingId);
  if (!p) return; // already gone
  const result =
    p.kind === "photo"
      ? await api.parsePhoto({ image: { uri: p.imageUri ?? "" }, caption: p.text || undefined, capturedAt: p.capturedAt })
      : await api.parseText({ text: p.text ?? "", capturedAt: p.capturedAt });
  for (const draft of result.drafts) addLocalEntry(draft);
  deletePending(pendingId);
}

/**
 * Drain due outbox items in order. Each entry's local id is its Idempotency-Key,
 * so a retry after a lost response replays (200) instead of duplicating.
 * Stops at the first network/5xx failure — the failed item backs off and
 * everything behind it waits, preserving order.
 *
 * Loops over fresh snapshots so an `interpret` op — which parses raw offline
 * input into new entries mid-drain — gets those follow-up creates sent in the
 * same pass.
 */
export async function drainOutbox(api: Api, now: () => number = Date.now): Promise<{ synced: number }> {
  const db = getDb();
  let synced = 0;
  for (;;) {
    const due = db.getAllSync<OutboxRow>(
      `SELECT * FROM outbox WHERE nextAttemptAt <= ? ORDER BY seq ASC`,
      [now()],
    );
    if (due.length === 0) break;
    let progressed = false;
    let backedOff = false;
    for (const item of due) {
      try {
        if (item.op === "interpret") {
          await interpretPending(api, item.entryId);
          db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
          progressed = true;
          continue;
        }
        const entry = getEntry(item.entryId);
        if (!entry) {
          db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]); // entry gone — drop
          progressed = true;
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
        progressed = true;
      } catch (err) {
        // Non-retryable: drop the poison pill (and its parked input) and keep draining.
        if (isPoison(err)) {
          if (item.op === "interpret") deletePending(item.entryId);
          db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
          progressed = true;
          continue;
        }
        // Network/5xx: back off and stop, preserving order.
        db.runSync(`UPDATE outbox SET attempts = attempts + 1, nextAttemptAt = ? WHERE seq = ?`, [
          now() + backoffMs(item.attempts),
          item.seq,
        ]);
        backedOff = true;
        break;
      }
    }
    if (backedOff || !progressed) break;
  }
  return { synced };
}

export function pendingCount(): number {
  const row = getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`);
  return row?.n ?? 0;
}
