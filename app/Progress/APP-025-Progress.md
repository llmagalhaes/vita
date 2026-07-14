# APP-025 — Today check-ins

Asana: Vita frontend `1216519867368576` (slice 4, F6). Local-100 backlog F6 + D1.

## What shipped
- **Check-in domain** (`src/habits/checkins.ts`): pure `pendingCheckins`/`answeredCheckins`/`habitDots`
  (14-day yes/no strip from local check-in entries) + `answerCheckin(habit, answer)` action.
- **Persistence via the existing outbox** (D1 / BE-024): a check-in is a `checkin` entry whose local id
  is `${habitId}:${dateKey}` — deterministic, so it doubles as the **Idempotency-Key `habitId:date`**
  (one per habit per day). New `upsertCheckin` in `src/db/entries.ts`: first answer enqueues a `create`;
  re-answering an already-synced day enqueues an `update` → **PATCH /entries/{id}** (new `patchEntry` on
  the Api client + mock). While a create is still queued, the fresh detail rides that POST (no dup).
  **Local SQLite stays the display source** for the dots; the server write is durability.
- **Plan check-in "Yes" auto-logs the plan's linked meal** (built from the cached plan via `itemTotals`/
  `mealTotals`) through the normal `addLocalEntry` outbox path. **"Not quite" opens capture**
  (`capture.requestTextEntry()`).
- **Check-in stack sheet** (`src/habits/CheckinSheet.tsx`) — modal overlay, stacks today's pending
  check-ins, advances on answer, drag-down-to-dismiss (reuses the tested `shouldDismiss`). Mounted once
  in `(main)/_layout.tsx` inside `CaptureProvider`. Shared `CheckinQuestion`/`AnsweredChip` also render
  inline in the Habits → Today tab.
- **Home "N waiting" banner** — pending count opens the stack sheet. **Home two-column water|macros row
  left intact** (`flex:1`, no `height:"100%"`); the banner is a separate card above the hero.

## Soft gate
Builds entirely on the mock (`createEntry`/`patchEntry` in `src/api/mock.ts`). The real `checkin` write is
additive — nothing here blocks on BE-024 being live.

## Tests
`src/habits/__tests__/checkins.test.ts` — outbox `checkin` write carries key `habitId:date`; change-answer
PATCHes once (no dup create); plan "yes" auto-logs the meal; pending→answered flip + today's dot fills;
disabled/off-day not pending.

## Fixed in passing
Fire-and-forget `drainOutbox(...)` in `answerCheckin`, `home.quickAddWater` and `capture.confirm` gained
`.catch(() => {})` — a late-resolving background drain (mock latency) was surfacing as a cross-suite
unhandled rejection. Correct hygiene: a fire-and-forget drain failure must never crash the caller.
