# APP-005 · SQLite + outbox foundation — Progress

- Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216523338100888
- Status: **built, tests green** (2026-07-13). Done = in production (waits on APP-007 tester build).

## What exists

- `services/vita-app/src/db/db.ts` — expo-sqlite (`vita.db`), schema: `entries`, `outbox`, `kv`. Sync API on purpose (`ponytail:` tiny row counts for ~5 users; async API only if profiling says so).
- `entries.ts` — `addLocalEntry` (instant local write + outbox enqueue in one transaction), `entriesForDay`, `getEntry`, `markSynced`. Local uuid is the PK **and** the Idempotency-Key; `serverId` stored after sync (server assigns its own id).
- `outbox.ts` — `drainOutbox(api)`: due items oldest-first, POST /entries with Idempotency-Key, exponential backoff 1s→5min cap, stops at first failure (order preserved), reconciliation via server `updatedAt` (LWW).
- `kv.ts` / `settings.ts` — JSON kv store; user settings + onboarded flag.
- `seed.ts` — mock-mode-only demo morning (workout, meal, water) so the walkable app has life.
- Jest: `__mocks__/expo-sqlite.ts` adapts to **node:sqlite** (Node 22) — real SQL runs in tests. 6 outbox tests: instant pending write, offline→drain, idempotent replay (no dup after lost response), LWW marker, backoff curve, not-due skip.

## Deliberate cuts (documented, not forgotten)

- Drain triggers: app start + after each confirm/quick-add only. No NetInfo reconnect listener yet — add `@react-native-community/netinfo` when real network flakiness exists (mock never fails).
- Ops supported: `create` only. `update`/`delete` outbox ops when edit/delete UI lands (APP-014+).
- Delta refresh (fetch-by-day) not wired — mock server returns empty; SQLite is source of truth. Wire when a real backend URL exists.
