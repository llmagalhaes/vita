import { ApiError, type Api, type LogEntry, type NewEntry } from "../api/client";
import { getDb } from "./db";
import { addLocalEntry, deletePending, getEntry, getPending, markFailed, markSynced, type LocalEntry } from "./entries";

type OutboxRow = { seq: number; entryId: string; op: string; attempts: number; nextAttemptAt: number };

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** 1s, 2s, 4s… capped at 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * A locally-detected non-retryable condition (e.g. a parked photo whose file was
 * purged from cache). Not an ApiError — the server was never reached — but just as
 * hopeless, so it's dropped like a poison pill instead of stalling the drain (audit 1.2).
 */
export class PoisonError extends Error {}

/**
 * Server was reached but rejected the payload for good — retrying can never succeed.
 * `update` (PATCH) ops also treat 403/404 as poison: a server-deleted or forbidden
 * entry never comes back, so backing off forever would stall the ordered drain (audit 1.5).
 */
function isPoison(err: unknown, op?: string): boolean {
  if (err instanceof PoisonError) return true;
  if (!(err instanceof ApiError)) return false;
  if ([400, 409, 422].includes(err.status)) return true;
  // `update` (PATCH) and `delete` treat 403/404 as poison too: a forbidden/absent
  // target never recovers, so backing off would stall the drain. (A delete's 404 is
  // handled as success before it ever gets here.)
  return [403, 404].includes(err.status) && (op === "update" || op === "delete");
}

/**
 * Parse a parked offline capture and turn its drafts into local entries (which
 * enqueue their own create ops). Throws on network/5xx (→ back off) or a
 * non-retryable parse error (→ poison, dropped by the caller). A parked photo whose
 * cache file is gone throws PoisonError (→ dropped) rather than a fetch TypeError that
 * would look like a network blip and stall the drain forever (audit 1.2).
 */
async function interpretPending(api: Api, pendingId: string): Promise<void> {
  const p = getPending(pendingId);
  if (!p) return; // already gone
  if (p.kind === "photo") {
    const uri = p.imageUri ?? "";
    const FS = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
    const info = await FS.getInfoAsync(uri);
    if (!info.exists) throw new PoisonError("parked photo file is gone");
  }
  const result =
    p.kind === "photo"
      ? await api.parsePhoto({ image: { uri: p.imageUri ?? "" }, caption: p.text || undefined, capturedAt: p.capturedAt })
      : await api.parseText({ text: p.text ?? "", capturedAt: p.capturedAt });
  // Auto-added without passing the online confirm sheet → flag for review (CEO R12 #2).
  for (const draft of result.drafts) addLocalEntry(draft, true);
  deletePending(pendingId);
}

/**
 * Entries written under a DETERMINISTIC id (upsertEntry): habit check-ins
 * (`${habitId}:${date}`, BE-024) and day records (`meal|workout:${date}:…`,
 * APP-094). Detected by TYPE, not by punctuation in the id — a `meal:` day-record
 * key contains ":" too, and matching on that would send it down the check-in
 * reconcile path and drop it as poison.
 */
const isDeterministic = (e: LocalEntry): boolean =>
  e.type === "checkin" || (e.type === "meal" && (e.detail as { planMealId?: string }).planMealId != null) ||
  (e.type === "workout" && (e.detail as { planDay?: string }).planDay != null);

/** Does this server entry hold the same slot as the local deterministic-id one? */
function sameSlot(server: LogEntry, local: LocalEntry): boolean {
  if (server.type !== local.type) return false;
  const s = server.detail as Record<string, unknown>;
  const l = local.detail as Record<string, unknown>;
  if (local.type === "checkin") return s.habitId === l.habitId;
  if (local.type === "meal") return s.planMealId === l.planMealId;
  return s.planDay === l.planDay;
}

/**
 * A deterministic-id create that 409s means the server already stored something
 * under this Idempotency-Key (its first, response-lost write). Instead of dropping
 * the newer version (silent desync — audit 1.3), find that server entry and PATCH it
 * to the new detail so the re-answer / re-record actually lands.
 */
async function reconcile409(api: Api, entry: LocalEntry): Promise<void> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const d = new Date(entry.occurredAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const page = await api.listEntries({ date, tz });
  const server = page.items.find((e) => sameSlot(e, entry));
  if (!server) throw new PoisonError(`409 with no server entry to reconcile (${entry.type})`);
  const updated = await api.patchEntry(server.id, { detail: entry.detail, occurredAt: entry.occurredAt });
  markSynced(entry.id, updated);
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
        if (item.op === "delete") {
          // entryId is the SERVER id here — the local row is already gone (APP-112).
          try {
            await api.deleteEntry(item.entryId);
          } catch (e) {
            // Already gone server-side is exactly the outcome we wanted.
            if (!(e instanceof ApiError && e.status === 404)) throw e;
          }
          db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
          synced++;
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
            ? await api.patchEntry(entry.serverId, { detail: entry.detail, occurredAt: entry.occurredAt })
            : await api.createEntry(entry.id, payload);
        markSynced(entry.id, server);
        db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
        synced++;
        progressed = true;
      } catch (err) {
        // A deterministic-id create that 409s → reconcile via PATCH instead of dropping
        // the newer write (audit 1.3). Reconcile failures: poison → drop below; network → back off.
        if (err instanceof ApiError && err.status === 409 && item.op === "create") {
          const entry = getEntry(item.entryId);
          if (entry && isDeterministic(entry)) {
            try {
              await reconcile409(api, entry);
              db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
              synced++;
              progressed = true;
              continue;
            } catch (e2) {
              if (!isPoison(e2)) {
                db.runSync(`UPDATE outbox SET attempts = attempts + 1, nextAttemptAt = ? WHERE seq = ?`, [
                  now() + backoffMs(item.attempts),
                  item.seq,
                ]);
                backedOff = true;
                break;
              }
              // reconcile is itself hopeless → fall through to the poison drop
            }
          }
        }
        // Non-retryable: drop the poison pill (and its parked input) and keep draining.
        if (isPoison(err, item.op)) {
          if (item.op === "interpret") deletePending(item.entryId);
          // A dropped `delete` has no local entry left to mark — the row is already gone.
          else if (item.op !== "delete") markFailed(item.entryId); // terminal state so Home stops the "waiting to sync" lie (audit 1.8)
          db.runSync(`DELETE FROM outbox WHERE seq = ?`, [item.seq]);
          progressed = true;
          continue;
        }
        // Network/5xx: back off and stop, preserving order. Surface WHY — a
        // silent backoff is what makes an entry sit at "waiting to sync" forever
        // with no clue (APP-061). In a release APK this lands in `adb logcat`
        // (tag ReactNativeJS), so the next device test names the real cause.
        const reason = err instanceof ApiError ? `HTTP ${err.status}` : `network ${(err as Error)?.message ?? err}`;
        console.warn(`[outbox] sync backoff op=${item.op} entry=${item.entryId} attempts=${item.attempts} reason=${reason}`);
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
