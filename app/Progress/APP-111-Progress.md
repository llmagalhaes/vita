# APP-111 — silent log restore on reinstall

**Status:** built, scoped gates green (`npx jest src/db` 11 suites / 80 tests · `npx tsc --noEmit` clean of this ticket's files).
**Session 22, v4 wave.** No git run by this builder.

## The gap

`GET /entries` has shipped since contract 0.4.0 and no client ever read it back — sync was one-way
(SQLite → outbox → server), and `src/db/entries.ts` documented the assumption ("entries are never
re-fetched"). A reinstall therefore lost the whole log even though the server held it, encrypted
(`docs/v4/backend-persistence-analysis.md` §0/§3). This ticket is the missing read.

CEO Round-14 rules honoured, all binding: **recovery-only** (one-shot backfill, not two-way sync),
**single device** (no conflict machinery), **silent** (no UI at all — rows just appear), **12-month
window**, **background** (fire-and-forget from Home's mount effect; nothing awaits it).

## Files

| File | Change |
|---|---|
| `src/db/restore.ts` | **new** — `restoreLog(api)`: the whole feature, ~110 lines incl. comments. |
| `src/db/__tests__/restore.test.ts` | **new** — 7 tests. |
| `src/db/entries.ts` | `invalidateDay` exported (was file-private). One word. |
| `src/api/client.ts` | `listEntries` params gain `from`/`to` — already in the contract + already serialized by the impl, the TS type just never listed them. |
| `src/tabs/Home.tsx` | one import + **one line** in the existing mount effect, next to `syncPlan/syncProgram/syncVacation` (APP-110's `settingsSync` hook is the neighbour). |

## Flow

```
Home mount → void restoreLog(api).catch(() => {})
  ├─ kv "restore.done" present? → return, zero API calls, forever after
  ├─ await drainOutbox(api).catch()      // deletes land first (see hazard 2)
  └─ loop: GET /entries?from=<now-12mo>&limit=100&cursor=<kv "restore.cursor">
        ├─ per row: insertRestored()  → INSERT … syncState='synced', serverId=<wire id>,
        │                                updatedAt=<wire updatedAt>, needsReview=0
        │                                + invalidateDay(occurredAt)
        ├─ nextCursor → kv "restore.cursor" (watermark), next page
        └─ no nextCursor → kv "restore.done" = ISO timestamp; logChanged() if anything landed
```

Any throw (offline, 401 before sign-in, 5xx) propagates to the caller's `.catch` with `restore.done`
still unset and the cursor parked — the next launch resumes mid-restore. Rows already inserted are
skipped on the re-run, so a re-run is free.

### Local id of a restored row

Deterministic-id entries rebuild their key from the detail, so a later local write lands on the SAME
row instead of opening a duplicate slot:

- meal + `planMealId` → `meal:<date>:<planMealId>` (`mealEntryId`, APP-094)
- workout + `planDay` → `workout:<date>` (`workoutEntryId`)
- checkin + `habitId` → `<habitId>:<date>` (BE-024)
- anything else → the server uuid (the original local uuid's only job was the Idempotency-Key, spent)

### Skip rules — local always wins

1. `entries.id = <derived id> OR entries.serverId = <wire id>` → skip. Covers the already-synced row,
   the re-run, **and** the queued create on the same deterministic slot (audit 1.4: a dirty local row
   is never overwritten). If that queued create later 409s, the existing `reconcile409` path handles
   it exactly as before — restore changes nothing there.
2. `outbox` holds a `delete` op whose `entryId` equals the wire id → skip (APP-112 stores the SERVER
   id on delete ops precisely because the local row is gone). A discarded entry is never resurrected.

## Two hazards, and what was done about them

1. **Duplicate slots.** Matching purely on `serverId` would have been structurally safe for plain
   entries but NOT for deterministic ones: a restored check-in/day-record keyed on the server uuid
   would sit beside the local `habitId:date` row the next write creates, double-counting in
   `dayStatuses`/`getDayRecord`. Deriving the deterministic id fixes it at the source. Test:
   *"a dirty local row (queued create on the same deterministic slot) is never overwritten"*.
2. **Delete/restore race.** A page fetched *before* a queued delete reaches the server could
   resurrect the row after the drain removed the op. `restoreLog` therefore awaits `drainOutbox`
   first (one line) so pending deletes land before we page; the outbox guard then covers the offline
   case where the delete can't land at all. Residual window is a delete queued by another screen
   *during* the paging loop — the guard catches it as long as the op is still queued.

## Derivations

Nothing extra needed: `dayStatuses`/`recentStatuses`/`monthStatuses`, `getDayRecord`, the trends
series and the timeline all read SQLite directly, and every insert calls `invalidateDay`, so the
derived `day_record` cache rebuilds on the next read. Verified by test
*"a restored plan-status meal surfaces in the day status"* → `asPlanned`.

## Tests (7, all green)

| Test | Asserts |
|---|---|
| fresh install restores two pages silently | 3 rows across 2 pages, `syncState='synced'`, serverIds set, cursor followed, `from` is 12 months back, `restore.done` set |
| second launch makes zero API calls | `listEntries` never called; a new server row is *not* pulled (recovery-only, not sync) |
| dirty local row never overwritten | queued create on `meal:<date>:m-1` survives, restored twin dropped, still `pending` |
| already-synced row matched by serverId | no duplicate, original local uuid survives |
| queued delete not resurrected | delete op offline → row stays absent, `restored === 0` |
| interrupted restore resumes from watermark | page 2 throws → `restore.done` unset, `restore.cursor === "1"`; re-run fetches only page 2 |
| restored plan-status meal in day status | `recentStatuses(today,1)` goes `undefined` → `"asPlanned"` |

## Deviations / notes for the lead

- **Trigger is `restore.done` absent, not "entries table empty".** Simpler and strictly better: an
  existing device with a full local log also runs it once, skips everything it already has, and
  backfills anything missing (e.g. rows written before a wipe). One condition instead of two.
- **`needsReview` reads false on restored rows** — per the analysis §3.3, correct: those entries were
  already reviewed, or the review moment is gone.
- **`sourcePhrase`/`isEstimate`/`inputMethod`/`updatedAt` are carried verbatim** from the wire, so
  `isRetro` (APP-099, `loggedAt` vs `occurredAt`) keeps working on restored rows.
- **Cross-ownership, untouched:** `npx tsc --noEmit` reports one error not from this ticket —
  `src/notify/dayClose.ts(21,10): Module '../db/notify' has no exported member 'subscribeLog'` —
  another builder's in-flight `src/notify/` + `src/db/notify.ts` work in this same wave. Left alone.
- **Habits are not restored by this ticket** (they ride APP-110's settings blob). Until that lands, a
  restored check-in still renders — name/kind live inside `CheckinDetail` — but the habit dot strips
  can't group it. Called out in the analysis §3.2; no code needed here.
- **Not built (YAGNI, say the word if wanted):** a "restore finished" toast (CEO said silent), a
  manual "restore now" button, any re-restore after `restore.done` (recovery-only by decision), and
  `type=` filtering on the page request (the whole log is a few hundred rows).
