# APP-033 — Offline pending-interpretation + NetInfo reconnect drain (slice 8) — Progress

**Asana:** APP-033 (Vita frontend `1216519867368576`) — "Offline pending-interpretation outbox op + NetInfo reconnect drain."
**Builds on:** Fable audit 1.2 (poison-pill) and 3.2 (the written-but-unused `op` column). Now the outbox has a third real op: `interpret`.

## What was built

### A second real outbox op — `interpret`
- New table `pending_parse` (`src/db/db.ts`): `{ id, kind: 'text'|'photo', text, imageUri, capturedAt }`. Holds a raw capture that couldn't reach `/parse` offline. `outbox.entryId` now references either `entries.id` (create/update) or `pending_parse.id` (interpret).
- `src/db/entries.ts`: `enqueueInterpretation(input)` parks the raw input + enqueues an `interpret` outbox row; `getPending`/`deletePending`.
- `src/capture/CaptureContext.tsx`: `submit`/`submitPhoto` now split the failure path — a reached-but-failing server (`ApiError`) still surfaces the error UI (retry / type instead), but a **network failure (non-`ApiError`) parks the capture** via `enqueueInterpretation` and shows a calm toast (`capture.offlineQueued`), losing nothing. Text parks the phrase; photo parks the local image uri + caption.

### Reconnect drain
- `src/db/outbox.ts` rewritten to a **snapshot-loop** so an `interpret` op — which parses raw input into new entries mid-drain — gets those follow-up creates sent in the **same pass** (`for(;;)` re-queries due items until no progress or a back-off). `interpretPending` calls `api.parseText`/`parsePhoto`, turns each draft into a local entry (`addLocalEntry`, which enqueues its own create), then drops the pending row.
- **Poison-pill preserved and extended**: a non-retryable 4xx (400/409/422) drops the item and keeps draining; for an `interpret` op it also cleans up the parked `pending_parse` row. Network/5xx → back off + stop (order preserved). Factored into `isPoison()`.
- `src/db/reconnect.ts`: `startReconnectDrain()` subscribes to `@react-native-community/netinfo` (lazy-required so nothing native loads under jest) and drains the outbox on the disconnected→connected transition; `logChanged()` after a productive drain. Mounted once in `app/(main)/_layout.tsx` via `useEffect` (unconditional, before the auth redirect — hook-safe), returning the unsubscribe as cleanup.

## New dep
- `@react-native-community/netinfo@12.0.1` (via `expo install`, SDK 56 compatible, bundled in Expo Go). No config plugin needed.

## Tests (src/db/__tests__/outbox.test.ts, +4)
- offline interpretation: parked raw text is parsed into entries on drain (all synced, nothing left queued).
- offline interpretation that can't be parsed (422) is dropped **and** a following valid entry still syncs; pending row cleaned up.
- offline interpretation backs off on network failure, loses nothing, resolves on reconnect.
- interpret op drains before entries queued after it (order preserved; banana meal + water both land).

## Gates
- `tsc` exit 0 · `jest` **144/144 (31 suites)**, +4 · `api:check` exit 0, no drift · `expo export` iOS OK · `expo install --check` up to date, SDK 56, +1 dep.

## ponytail
- Queue only on true network failure (non-`ApiError`); a reached 5xx keeps the existing retry UI. `interpret` auto-logs the parsed drafts on reconnect (no deferred re-confirmation UI) — the ticket's "nothing is lost offline" reading; a later re-confirm queue can layer on if wanted.
- NetInfo glue is lazy-required and untested (3-line listener); the drain logic it calls is fully unit-tested via `drainOutbox`.
