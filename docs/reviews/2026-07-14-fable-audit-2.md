# Fable audit #2 — full "Vita 100% local" day build (2026-07-14)

Read-only QA over `0ae4310..91a1e73` (all of session 4). App suite verified green (31 suites/144). Backend suite read (needs Docker). **First-audit fixes all held; crypto envelope on every new encrypted surface (plan/program `doc_enc`, vacation `ranges_enc`, checkin `detail_enc`) verified per-user-DEK + AAD + cascade/shred.** Findings + disposition below.

## Correctness

| # | Sev | Where | Defect | Disposition |
|---|---|---|---|---|
| 1.1 | HIGH | `home.tsx:559` (last-7 chart) | Spent bar height = today's `spentKcal` painted on **all 7 days**; `max7` from consumed only → after "burned 800" on an empty week, 7 identical bars at 80,000% height (overflow). Reintroduces audit-2.2 fabricated-history for the spent series; stale comment line 557. | **App fix batch** — per-day spent in the `entriesForDay` loop, include in `max7`. |
| 1.2 | HIGH | `entries.ts:79-90` + `outbox.ts:24-33` | Parked offline **photo** `imageUri` in cache dir; on reconnect OS-purged/updated-container URI → `fetch` throws `TypeError` (not `ApiError`) → `isPoison` misses → ordered drain backs off forever, **everything behind it never syncs**. | **App fix batch** — copy JPEG to `documentDirectory` on park, and/or pre-flight `getInfoAsync` → treat file-read failure as poison. |
| 1.3 | MED | `entries.ts:134-144` | Checkin "response lost then re-answer": retry replays same `habitId:date` key with different body → backend 409 by design → `isPoison` drops it → entry stuck `pending`, guard `syncState==="synced"` means no future PATCH ever enqueues → **silent permanent desync**. | **App fix batch** — on 409 for a deterministic-id create, fall back to PATCH (fetch/retry-as-update) instead of drop. |
| 1.4 | MED | `plan.ts:37-49`, `vacation.ts:44-71`, `home.tsx:168-172` | Offline plan/program/vacation edit writes kv + fire-and-forget push (no retry); next online mount `syncPlan/syncVacation` **unconditionally overwrites kv with server doc** → offline edit silently reverted. | **App fix batch** — `dirty` flag in kv; hydrate only when clean, else re-push. |
| 1.5 | LOW/MED | `outbox.ts:16` | `update` op vs server-deleted entry → 404 not in poison list `[400,409,422]` → infinite backoff stalls drain (same mechanics as 1.2). | **App fix batch** — add 404 (and 403) to poison for `update`. |
| 1.6 | LOW | `outbox.ts:83` | Checkin re-answer PATCH sends `{detail}` only; `upsertCheckin` updated `occurredAt` locally → server keeps first timestamp, local/server disagree. | **App fix batch** — include `occurredAt` in PATCH. |
| 1.7 | LOW | `CryptoService.aad` | AAD = userId only → same-user blob swappable across tables/columns (`eating_plan.doc_enc`↔`vacation.ranges_enc`). Defense-in-depth (needs DB write). | **BE-028 hygiene debt** — AAD `"$userId:$table"` for new tables. |
| 1.8 | LOW | `home.tsx:134` | Poison-dropped create keeps `syncState:"pending"` → Home shows "waiting to sync" forever, no exit. | **App fix batch (minimal)** — mark dropped ops a distinct `failed` state (NOT the full review-card UX — that's the product Q below). |

## Product philosophy
- **2.1 (=1.1)** — fabricated spent history is also a philosophy violation. Fixed by 1.1.
- **2.2 LOW** — contract narrative (`vita-api-v0.yaml:360-363`, `:982`) describes an app that sends `from/to/type` + only-4 input methods; app filters locally + sends `inputMethod:"checkin"`. Align the prose. **App fix batch (doc)** / backend note.
- **2.3 LOW** — plan/program `/history` is server-only; app has no history method/screen. **Known deferral** (APP-022 explicitly deferred the "previous plans picker"). Not a bug — track as a follow-up ticket.
- **2.4 INFO** — `habits.ts:2-4` comment says habit shapes never leave the phone, but `CheckinDetail` ships `habitId/habitName/kind` (encrypted). Align the comment. **App fix batch (doc)**.

## Over-engineering (ponytail) — minimal
- **3.1 INFO** — BE-017 `from/to` + both `/history` endpoints have zero app consumers yet (contract/CEO-ticketed inventory, not slop). Wire or note as parked.
- **3.2 INFO** — `export/pdf.ts:66` embeds a fallback mini-translator; pass `t` from the caller to delete it. Trivial.

## Test gaps (map to bugs)
1. Home last-7 chart untested (→1.1). 2. `drainOutbox` non-`ApiError` throw from `interpretPending` (→1.2). 3. app-side checkin 409 re-answer path (→1.3; backend side IS tested). 4. `syncPlan/syncVacation` overwrite vs dirty local edit (→1.4). 5. `windowRange` across DST — untested, cheap to pin.

## Product decision (CEO) — offline auto-log breaks confirm-before-log
Online, every AI draft passes the review sheet (confirm/adjust/discard). Offline, `interpretPending` (`outbox.ts:31`) commits identical drafts straight to the log, unreviewed, hours later — the discard affordance vanishes exactly when parse confidence is lowest. `isEstimate` + editable/deletable survive; nothing is lost. **Fable's recommended aligned fix:** keep auto-add for durability but mark those entries `needsReview` and surface an "N offline captures were added — tap to review" banner (reuse the check-in stack UX). **CEO call — goes on the decision log, not fixed unilaterally.** (Also resolves 1.8's dead-end honestly.)

## Verified clean
Crypto envelope (all new encrypted surfaces, per-user-DEK AES-256-GCM + cascade/shred); plan versioning/trim/history + injection-safe fixed-enum table names + keyset ordering; BE-017 parameterized filters + `date`/`from-to` mutual-exclusion + `type` allow-list; photo multipart handshake + 413/415/422 + quota-before-model + image discarded; S3/KMS adapters; token cleanup; trends aggregation (windowing, vacation exclusion, max-normalized intensity, honest per-day-with-data averages); BodyMap 11-muscle coverage; zero goals/scores/streaks in product code; dual input real on new surfaces; export PDF exemplary (labeled estimates, on-device footer, escaped free-text).
