# APP-094 — Day record model (state + persistence + pure logic)

Session 22, v4 wave 0. Builder: Opus. Ticket amended by `docs/v4/PLAN.md` **R1/R2/R6/R10**
(read together with `docs/v4/app-plan.md` §3 APP-094 — where they disagree, PLAN.md wins).

## The one decision that shapes everything

**There is no `/days` resource.** A day record *is* the ordinary `meal` / `workout` entries of
that date, carrying the contract-0.8.0 plan fields. So:

- close-the-day = a batch of idempotent entry writes through the **existing** outbox
  (deterministic ids `meal:<date>:<planMealId>`), retro-close = the same batch with
  `occurredAt` on that day — **one representation** (R10a);
- no `dayRecord` outbox op was added (the ticket's original plan), and no `closed{at,mode}`
  on the wire — "closed later, by you" is derived from `loggedAt` landing on a later day (R2);
- the SQLite `day_record` table is a **derived cache**, safe to drop at any moment.

## Files

**New**
- `src/day/record.ts` — types, self-describing record builders, entry ⇄ record mapping.
- `src/day/state.ts` — `mealState`, `isDue`, `dayCounters`, `dayStatus`, `recapLine`, `isRetro`,
  `pendingMeals`, `closeLine`.
- `src/day/close.ts` — `closeDay(day, meals, nowMin)` / `retroClose(day, meals)`.
- `src/db/dayRecord.ts` — cache + overlay + the entry writes.
- `src/day/__tests__/day.test.ts` (17 tests) · `src/db/__tests__/dayRecord.test.ts` (9 tests).

**Changed**
- `src/api/types.gen.ts` — regenerated from contract **v0.8.0** (`npm run api:gen`; `api:check` clean).
- `src/api/client.ts` — `WeightDetail` / `CheckinDetail` / `PlanStatus` exports; `fillDraftTotals`
  now gives a **skipped** meal explicit zero totals instead of leaving them absent (R10).
- `src/api/mock.ts` — plan-aware parse fixture path; `stampPlanIds` also assigns `m-N` **meal ids**
  (mirrors BE-050's `decorate()`); `listEntries` stores/echoes real entries with local-day filtering.
- `src/db/db.ts` — `day_record(date PK, json, dirty)` in the schema.
- `src/db/entries.ts` — `upsertCheckin` generalized to `upsertEntry(id, entry)` (check-in is now the
  thin wrapper); every write path invalidates the affected day's cache row.
- `src/db/outbox.ts` — `portions` op deleted; the 409 reconcile generalized (see Bugs found).
- `src/db/plan.ts` — the portions overlay folded into the day record.
- `src/db/__tests__/portions.test.ts` rewritten · `plan-v3.test.ts` portions tests replaced ·
  `src/api/__tests__/mock.test.ts` +5 tests.

## The model

```ts
type MealState = "planned" | "done" | "adjusted" | "skipped";   // planned = ABSENCE of a record

type MealRecord = {
  entryId: string;              // `meal:<date>:<planMealId>` — deterministic = Idempotency-Key
  planMealId?: string;          // may go stale; never trusted for rendering
  title: string;                // ┐
  items: MealItem[];            // ├ SELF-DESCRIBING (R7): what it looked like at record time.
  totals: Required<MacroTotals>;// ┘ EMPTY items + ZERO totals when skipped (R10)
  state: "done" | "adjusted" | "skipped";
  planOptionIndex?: number;
  at: string;                   // occurredAt
  loggedAt?: string;            // > at's day  ⇒  closed later, by you (R2)
};

type DayRecord = {
  date: string;                 // local YYYY-MM-DD
  meals: MealRecord[];          // array, not a map — off-plan meals have no planMealId
  workout?: WorkoutRecord;      // { planDay?, title, state, exercises, at, loggedAt? }
  waterMl: number;              // derived; water alone NEVER closes a day
  overlay: DayOverlay;          // { option, qty, skip, swap } — day-scoped plan tweaks
};
```

**Storage split (the bug this ticket nearly shipped):** the derived half is cached in
`day_record` and is deleted by every entry write, so the **overlay cannot live there** — it is
authoritative state and lives in kv under `day.overlay.<date>`. Keying it by date is what makes
"only counts for today" structural: no timers, no rollover reset, no stale-day gate.

## Killing the session-19 asymmetry (deliverable 5)

v3 had portions persisted to the server (kv + coalescing `portions` outbox op + a lazy day-rollover
reset that also pushed an empty map) while an option switch was merely session-local. Now qty
overrides, item skips, item swaps and the option pick are **one date-keyed overlay**. Removed: the
`portions` outbox op and its drain-race/poison handling, `enqueuePortionsPush`, `PORTIONS_KEY`,
`PORTIONS_DATE_KEY`, the rollover reset, and `syncPlan`'s adoption of the server overlay.
`PUT /plan/portions` still exists in the contract and in the client (CEO kept it, Q2) — the app
simply stops calling it. `getPortions/setPortion/clearPortions/clearPortionsAndPush` keep their
exact signatures so the v3 screens (`Today.tsx`, `Home.tsx`, `plan.tsx`) still build until their
waves delete them; `clearPortionsAndPush` is now a deprecated alias.

## Bugs found and fixed at the root

1. **The 409 reconcile matched on id punctuation.** `isCheckinId = id.includes(":")` — a day-record
   key `meal:<date>:m-1` contains ":" too, so a 409 on a day-record create would have run the
   check-in reconcile, failed to find a habit, and dropped the record as poison. Fixed where all
   callers route through: detect deterministic-id entries by **type**, and reconcile by matching the
   server entry on `habitId` / `planMealId` / `planDay` (`reconcileCheckin409` → `reconcile409`).
   The date for the lookup now comes from `occurredAt` instead of being parsed out of the id.
2. **`fillDraftTotals` left a skipped meal with absent totals**, so every `totals.kcal ?? 0` consumer
   would render "didn't have it" identically to "not recorded".
3. **The mock's plan had no `m-N` meal ids**, so nothing could point at a plan meal (BE-050 added
   them server-side); `stampPlanIds` now mirrors that.

## Gates

- `npm run api:gen` + `npm run api:check` — clean (contract v0.8.0).
- `npx tsc --noEmit` — **clean for every file in this ticket's scope.** Remaining errors are
  APP-095's `Settings.keepTrack` → `domains` rename, in files this ticket does not own:
  `app/onboarding.tsx`, `src/__tests__/account.test.tsx`, `src/__tests__/onboarding.test.tsx`,
  `src/health/__tests__/healthConnect.test.ts`.
- `npx jest src/day src/db src/api` — **13 suites, 105/105 green**.
- Full suite: **59/60 suites, 353/354**. The single failure is
  `src/plan/__tests__/compute.test.ts › tint: endpoints and a midpoint (sRGB lerp)` — APP-093
  repointed `tint()` at `mixOklab`, so the old sRGB-lerp expectation is stale. **Not this ticket's
  file, not this ticket's fix.**

## Deviations from the ticket text (all forced by R1, all deliberate)

| Ticket said | Built | Why |
|---|---|---|
| `outbox` gains a `dayRecord` op | no new op — ordinary entry `create`/`update` | R1: no `/days` on the wire |
| `DayRecord.meals: Record<mealId, …>` | `MealRecord[]` + `mealRecord(day, id)` | a map cannot hold off-plan meals, which are real records |
| `DayRecord.habits` | dropped | R5: habit answers stay `checkin` entries (already shipped) |
| `closed { at, mode }` | derived via `isRetro` | R2 |
| `dayCounters(day)` | `dayCounters(day, meals = [])` | `planned` is an absence — it can only be counted against the plan; the 1-arg call still type-checks and returns record counts |
| `closeDay(day, nowMin)` / `retroClose(day)` | `+ meals: PlanMeal[]` | same reason |
| `recapLine(day, domains)` | unchanged | `waterMl` rides the DayRecord so the signature holds |

`Domains` is declared structurally in `state.ts` rather than imported from APP-095's
`src/db/domains.ts` — keeps the pure layer free of a db import (and of a wave-0 file race).

## Ponytail notes / known ceilings

- The `day_record` cache is a memo, not a source of truth: invalidate-on-write beats any freshness
  check, which would cost the exact query the cache exists to avoid. Ranged reads (calendar dots,
  Trends record counter) should `GROUP BY` over `entries` directly — see app-plan risk R6.
- `recapLine`'s sentence fragments are English in `state.ts`; APP-108 owns moving them into `en.json`.
- Workout exercise skips (`getDaySkips`) were left in their own kv key: already day-scoped, already
  device-local, and not part of the plan-composition overlay the ticket named.

## Handoff to the waves that consume this

- Timeline (APP-098): `dayMeals(plan)`, `mealState`, `isDue`, `closeLine`, `closeDay` → `applyClose`.
- Dock / past days (APP-099): `dayStatus` for the calendar dot, `retroClose` → `applyClose`,
  `isRetro` for "closed later, by you".
- Capture delta (APP-104): the parse draft already arrives as the meal's full composition with
  `replacesItemId` on every item — compute the signed kcal delta against `composeItems(meal, overlay)`
  and record with `recordMeals`. `setOverlay(date, {swap|qty|skip|option})` is the undo-able write.
