/**
 * APP-111 — silent log restore on reinstall.
 *
 * The log has always been persisted server-side (encrypted), but sync was strictly
 * one-way: SQLite → outbox → server. `GET /entries` has existed since contract 0.4.0
 * and no client ever read it back, so an `adb uninstall` lost the whole log
 * (`docs/v4/backend-persistence-analysis.md` §0/§3). This is the missing read.
 *
 * CEO Round-14 rules, binding: **recovery-only** (a one-shot backfill, not a two-way
 * sync), **single device** (no conflict machinery), **silent** (no "Restoring…" UI —
 * rows simply appear), **12-month window**, **background** (never blocks first paint
 * or the outbox drain).
 *
 * Local always wins: a row the device already holds — by server id or by the
 * deterministic slot id it would occupy — is never overwritten (audit 1.4), and a
 * queued local delete is never undone (APP-112).
 *
 * ponytail: one kv flag + one kv cursor, no new table. A killed restore resumes from
 * the cursor on the next launch; a finished one costs zero API calls forever after.
 */
import type { Api, LogEntry } from "../api/client";
import { dayKey, mealEntryId, workoutEntryId } from "../day/record";
import { getDb } from "./db";
import { invalidateDay } from "./entries";
import { kvGet, kvSet } from "./kv";
import { logChanged } from "./notify";
import { drainOutbox } from "./outbox";

const DONE = "restore.done";
const CURSOR = "restore.cursor";
const WINDOW_MONTHS = 12;
const PAGE = 100;

/**
 * The local id a restored entry must take. Deterministic-id entries (check-ins
 * `habitId:date` — BE-024; day records `meal:date:planMealId` / `workout:date` —
 * APP-094; body weight `weight:date` — APP-097) rebuild their key from the detail,
 * so a later local write lands on the SAME row instead of creating a duplicate slot
 * (and a queued create for that slot is detected as "taken" below). A plain entry
 * keys on the server uuid — its original local uuid's only job was the
 * Idempotency-Key, which is spent.
 */
function localIdFor(e: LogEntry): string {
  const d = e.detail as { planMealId?: string; planDay?: string; habitId?: string };
  const date = dayKey(new Date(e.occurredAt));
  if (e.type === "meal" && d.planMealId) return mealEntryId(date, d.planMealId);
  if (e.type === "workout" && d.planDay) return workoutEntryId(date);
  if (e.type === "checkin" && d.habitId) return `${d.habitId}:${date}`;
  if (e.type === "weight") return `weight:${date}`; // src/day/weight.ts weightEntryId
  return e.id;
}

/** Insert one server row if the device lacks it. Returns false when it was skipped. */
function insertRestored(e: LogEntry): boolean {
  const db = getDb();
  const id = localIdFor(e);
  const taken = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM entries WHERE id = ? OR serverId = ?`,
    [id, e.id],
  );
  if ((taken?.n ?? 0) > 0) return false; // local row wins — it may be dirty or queued
  // A delete op carries the SERVER id (its local row is already gone). If one is still
  // queued, the server hasn't been told yet and this page is stale — do not resurrect.
  const deleting = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE op = 'delete' AND entryId = ?`,
    [e.id],
  );
  if ((deleting?.n ?? 0) > 0) return false;
  // OR IGNORE, not a bare INSERT: two server rows can map to ONE localIdFor slot
  // (a pre-0.8.0 meal and its re-recorded twin). A UNIQUE violation would escape
  // restoreLog, leaving `restore.done` unset and the cursor parked — the restore
  // would then fail identically on every launch, permanently.
  const res = db.runSync(
    `INSERT OR IGNORE INTO entries (id, serverId, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail, updatedAt, syncState)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [
      id,
      e.id,
      e.type,
      new Date(e.occurredAt).toISOString(),
      e.inputMethod,
      e.sourcePhrase ?? null,
      e.isEstimate ? 1 : 0,
      JSON.stringify(e.detail),
      e.updatedAt ?? null,
    ],
  );
  if (res.changes === 0) return false;
  invalidateDay(e.occurredAt); // every derivation (day record, statuses, trends) rebuilds from entries
  return true;
}

/**
 * Page the last 12 months of the server log into SQLite, once per install.
 * Fire-and-forget: any failure leaves `restore.done` unset and the cursor parked, so
 * the next launch continues where this one stopped. Rows already present are skipped,
 * making a re-run free.
 */
export async function restoreLog(api: Api): Promise<{ restored: number }> {
  if (kvGet<string>(DONE)) return { restored: 0 };
  // Deletes first: a `delete` op that reaches the server before we page can't come
  // back at all. The per-row guard above covers whatever is still queued (offline).
  await drainOutbox(api).catch(() => {});
  const from = new Date();
  from.setMonth(from.getMonth() - WINDOW_MONTHS);
  let cursor = kvGet<string>(CURSOR) ?? undefined;
  let restored = 0;
  for (;;) {
    const page = await api.listEntries({ from: from.toISOString(), limit: PAGE, cursor });
    for (const e of page.items) if (insertRestored(e)) restored++;
    cursor = page.nextCursor;
    if (!cursor) break;
    kvSet(CURSOR, cursor); // watermark: a killed restore resumes from this page
  }
  kvSet(DONE, new Date().toISOString());
  if (restored > 0) logChanged();
  return { restored };
}
