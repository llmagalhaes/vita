# APP-AUDIT2-FIXES — Fable audit #2 app-side correctness fixes

Source: `docs/reviews/2026-07-14-fable-audit-2.md`. Scope: app only
(`app/services/vita-app/`). No backend/contract change. No git (orchestrator commits).

Root theme: the **outbox poison taxonomy** + **offline/sync data-loss edges**. Fixed at
the shared path where they route (the drain's catch, the kv hydrate) rather than per-caller.

## Fixes

### 1.1 HIGH — last-7 chart fabricated + overflowed the spent series
- Root: `app/(main)/home.tsx` painted **today's** `spentKcal` on all 7 days and computed
  `max7` from consumed only → after "burned 800" on an empty week, 7 identical bars at ~80,000% height.
- Fix: extracted `last7EnergySeries()` + `energyChartMax()` in `src/energy/manual.ts` — spent is
  read **per day** from the log (no invented history), and the chart max includes spent so every
  bar height ≤ 100%. Home now maps `{consumed, spent}` per day. Removed the false
  "spent stays 0 until health sync" comment.
- Tests (`src/energy/__tests__/manual.test.ts`): per-day spent lands only on its day (today not
  fabricated to 800); `energyChartMax` includes spent and no bar exceeds 100%.
  Fail-before-fix: reverted to today's-total + consumed-only max → both tests fail.

### 1.2 HIGH — offline photo park → dead cache URI stalled the drain forever
- Root: `interpretPending` (`src/db/outbox.ts`) called `api.parsePhoto` with a parked cache uri;
  an OS-purged path throws a fetch **TypeError** (not `ApiError`) → `isPoison` missed it → the
  ordered drain backed off forever and everything behind it never synced.
- Fix (two halves):
  - Drain-side root fix: `interpretPending` pre-flights `FileSystem.getInfoAsync(uri)` for photos;
    a missing file throws a new `PoisonError`, which `isPoison` treats as a drop (+ cleans the
    `pending_parse` row, continues the drain). Distinguishes a dead file (drop) from a live file +
    network blip (still backs off).
  - Durability: `persistForQueue()` in `src/capture/photo.ts` copies the JPEG into
    `FileSystem.documentDirectory` before parking (`CaptureContext.submitPhoto` offline branch), so
    the capture survives a cache purge in the first place.
- New dep `expo-file-system ~56.0.8` (already resolved in node_modules; SDK-56, Expo Go OK,
  no config plugin). Lazy-required so it stays off the jest path except the photo branch.
- Test: parked photo with a vanished file (mocked `getInfoAsync → {exists:false}`, parsePhoto →
  TypeError) is dropped; a following water entry still syncs. Plus a no-over-drop guard (present
  file + network failure → still queued). Fail-before-fix: disabled the pre-flight → test fails.

### 1.3 MED — check-in 409 → silent permanent desync
- Root: a re-answered check-in replays the deterministic `habitId:date` Idempotency-Key with a new
  body → backend 409 by design → dropped as poison → entry stuck `pending`, and the
  `syncState==="synced"` guard means no future PATCH ever enqueues.
- Fix (`src/db/outbox.ts`): on a **409 for a `create` op with a deterministic (colon) id**,
  `reconcileCheckin409` lists that day's entries, finds the check-in by `detail.habitId`, and
  PATCHes the server copy with the new detail + occurredAt (then `markSynced`). Reconcile failures:
  poison → drop; network → back off. No blind drop.
- Test: create 409 → fake `listEntries`/`patchEntry` → the new answer ("no") lands on server entry
  `srv-1` with `occurredAt`, local becomes `synced`. Fail-before-fix: disabled the reconcile branch → test fails.

### 1.4 MED — offline plan/program/vacation edits clobbered by hydrate
- Root: `src/db/plan.ts` / `src/db/vacation.ts` wrote kv + fire-and-forget push; Home mount's
  `syncPlan`/`syncProgram`/`syncVacation` then **unconditionally overwrote kv with the server doc**.
- Fix: a **`dirty` flag** per kv key (`isDirty`/`setDirty`/`clearDirty` in `src/db/kv.ts`, stored as
  `<key>.dirty`). Local writes set dirty; a successful push clears it. `sync*` hydrates only when
  clean; when dirty it **re-pushes the local doc and keeps it** (never hydrates over it).
  `pushPlan/pushProgram` PUT-then-POST-on-404 so an offline-created doc still lands.
- Tests: `src/db/__tests__/plan.test.ts` (offline edit survives hydrate; re-push then clean hydrate
  works) + a vacation case in `src/db/__tests__/vacation.test.ts`. Fail-before-fix: bypassed the
  dirty check → both fail (cache clobbered by stale server doc).

### 1.5 LOW/MED — 404/403 poison for `update` ops
- Root: a PATCH against a server-deleted entry 404s → not in the poison list → infinite backoff stalled the drain.
- Fix: `isPoison(err, op)` now treats 403/404 as poison **for `update` ops only** (a create getting
  404/403 is left as network to avoid masking auth/routing issues).
- Test: covered by the 1.8 test below (update op → 404 → dropped, following entry syncs).
  Fail-before-fix: reverted the op-scoped 404 branch → test fails (drain stalls).

### 1.6 LOW — check-in re-answer PATCH includes `occurredAt`
- Root: the update-op PATCH sent `{detail}` only; local had bumped `occurredAt` → drift.
- Fix: both the update-op path and the 1.3 reconcile PATCH send `{detail, occurredAt}`.
- Asserted inside the 1.3 test (`patch.occurredAt` defined).

### 1.8 LOW — poison-dropped ops no longer show "waiting to sync" forever
- Root: a dropped create kept `syncState:"pending"` → Home's "waiting to sync" was a permanent lie.
- Fix (minimal, NOT the full review-card UX): new terminal `failed` state (`markFailed` in
  `src/db/entries.ts`, `LocalEntry.syncState` union +`failed`); the drain marks non-interpret poison
  drops `failed`; Home's `TimelineCard` renders `home.notSaved` ("couldn't be saved") for `failed`
  instead of "waiting to sync". No offline-review banner (that's the pending CEO product decision).
- Test: the 1.8 update-op test asserts the entry becomes `failed`.

### 2.2 / 2.4 docs — stale comments aligned
- `src/db/habits.ts:1-6` — clarified that a check-in RESULT does ship the habit's id/name/kind
  (encrypted server-side), while only the schedule stays device-local.
- No app-code comment claims the client sends `from/to/type` (the app never calls `listEntries` with
  them); nothing else to change. The `type=` prose lives only in generated `types.gen.ts` (contract).

## Explicitly NOT changed
- Offline auto-log-vs-confirm product behavior (`interpretPending` still auto-adds parsed drafts on
  reconnect) — that's a pending CEO product decision; untouched.
- 1.7 backend AAD — BE-028 hygiene, not app.
- Home two-column `flex:1` water/macros layout — verified intact.

## Gates
- `tsc --noEmit`: exit 0
- `jest`: **154/154 (32 suites), +10** (energy 2, outbox 4, plan 3, vacation 1)
- `api:check`: exit 0, no drift
- `expo install --check`: up to date (expo-file-system ~56.0.8 resolved, SDK 56 preserved)
- `expo export --platform ios`: OK (dist bundle produced)

Each new HIGH/MED test verified to FAIL before its fix (temporary revert of the specific root
change, then restored) — see per-fix notes above.
