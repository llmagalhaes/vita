# APP-112 — Wire the existing `DELETE /entries/{id}`

Session 22 (v4 round). Builder: Opus. Spec: `docs/v4/backend-persistence-analysis.md`
(finding at §2 / roster line APP-112), contract `docs/contracts/vita-api-v0.yaml`
`/entries/{entryId}` `delete` (204, idempotent — deleting a missing entry also 204s).

## The bug

`DELETE /v1/entries/{id}` has been in the contract and live in prod since v0.7.0, but the
app never called it: `src/db/entries.ts` `deleteEntry()` deleted the local row only, under a
comment asserting *"there is no delete endpoint in the contract"* — false. Discarding a
synced entry left it on the server forever (data-responsibility gap on its own) and would
have let APP-111's restore resurrect it.

## What shipped

**`src/api/client.ts`** — `deleteEntry(id): Promise<void>` on the `Api` interface +
`request("DELETE", "/entries/${id}")` in `createHttpApi`. The existing 204 branch in
`request` already returns `undefined`, so no plumbing was needed.

**`src/api/mock.ts`** — `deleteEntry` drops the entry from `byIdempotencyKey`; a missing id
is a no-op, mirroring the contract's idempotent 204. (Touched only the api-method region,
between `patchEntry` and `listEntries` — the parse-fixture region was left alone.)

**`src/db/entries.ts`** — `deleteEntry()` now, in the same transaction: deletes the local
row, deletes any queued op for it, and — **only if the entry has a `serverId`** — enqueues a
`delete` op. Stale comment replaced.
- Never synced (no `serverId`) → the queued `create` is simply cancelled. Create-and-delete
  while offline costs the server zero calls, which is the correct net effect.
- The `delete` op stores the **server id** in `outbox.entryId`, because the local row is gone
  by drain time and there is nothing left to look it up from. Documented at both ends.

**`src/db/outbox.ts`** — `delete` handled at the top of the drain loop, before the
`getEntry` lookup (that lookup would find nothing and drop the op). A `404` from the server
is swallowed as success — already gone is the outcome we wanted. `isPoison` now also treats
`403/404` as poison for `delete` (same rule as `update`); the poison branch skips
`markFailed` for `delete` ops since there is no local row left to mark.

**`src/db/db.ts`** — schema comments updated: `op` gains `delete`, `entryId` documents the
server-id case.

## Known gap (deliberate)

A create whose response was lost (server stored it, device has no `serverId`) followed by a
delete leaves a server orphan: the create op is cancelled and we never learn the id. Closing
it would mean letting the create finish first and chaining a delete behind it — more
machinery than a lost-response-then-immediate-discard race earns. `ponytail:` noted in
`entries.ts`.

No drain kick was added at the delete call sites (`src/tabs/Home.tsx:409`,
`src/review/ReviewSheet.tsx:78/84`). Home already drains on mount/focus and `db/reconnect.ts`
drains on connectivity, so a queued delete rides the next pass — and those two files are
UI-owned this round.

## Gates

- `npx tsc --noEmit` → **0 errors**
- `npx jest src/db src/api` → **12 suites, 92/92 pass** (was 88 — +4 new)

New tests, all in `src/db/__tests__/outbox.test.ts`:
1. deleting a synced entry calls `api.deleteEntry` with the **server** id
2. offline delete backs off, loses nothing, drains on reconnect **exactly once**
3. create + delete both offline → 0 creates, 0 deletes on the wire
4. a `404` on delete counts as success and does not block the item queued behind it
