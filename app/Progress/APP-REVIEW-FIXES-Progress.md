# APP review-fix batch — Fable audit (2026-07-14)

Source: `docs/reviews/2026-07-14-fable-audit.md`. Five app-side findings fixed. No new deps,
minimal diffs, all inside `app/services/vita-app/`. No git run (orchestrator commits).

## Fixes

### 1.1 HIGH — day-filter timestamp bug (`src/db/entries.ts`)
`entriesForDay` range-queries `occurredAt` as lexicographic strings. Offset-bearing
timestamps (`+01:00` / `-05:00`) from the real backend carried a raw local-wall-clock date
prefix and sorted into the wrong day → entries near a day boundary vanished. Root cause fixed
in one place: `addLocalEntry` now canonicalizes to a UTC instant on write —
`new Date(entry.occurredAt).toISOString()` — so every stored timestamp is a comparable `…Z`.
The returned `LocalEntry` reflects the normalized value.
- Read paths verified: `entriesForDay` (string range, now all-`Z`), `getEntry`,
  `home.tsx timeOf` (`new Date(iso)` — offset-agnostic), outbox sync payload (same instant,
  sent as `…Z`). Seed rows already use `Date.toISOString()` → already `Z`, unaffected.
- Test: `src/db/__tests__/entries.test.ts` — stores a `-05:00` timestamp for a July-14-UTC
  instant near the boundary and asserts it lands in July 14, not July 13. TZ pinned to UTC
  for determinism. **Fails before the fix** (verified).

### 1.2 HIGH — outbox poison-pill (`src/db/outbox.ts`)
A non-retryable `ApiError` (400/409/422) used to back off and `break`, so one bad payload
blocked the ordered drain forever, stalling all sync behind it. Now: on 400/409/422 the item
is dropped from the queue and the drain **continues**; network/5xx still back off and stop
(order preserved). Imports `ApiError` from `../api/client`.
- Test: `src/db/__tests__/outbox.test.ts` — a queued item whose `createEntry` throws a 400
  `ApiError` must not block a following valid item. **Fails before the fix** (verified).

### 2.1 MED — hardcoded 2500-kcal energy bars (`app/(main)/home.tsx`)
The in/out energy bars normalized against a hardcoded 2500 kcal — an unlabeled implicit daily
target (forbidden: no goals/scores). Replaced with `energyMax = Math.max(kcalToday, spentKcal, 1)`;
each bar is now a fraction of the pair's own larger value. No fixed normative constant, no
`Math.min` cap needed (ratio ≤ 1 by construction).

### 2.2 MED — fabricated "Last 7 days" chart (`app/(main)/home.tsx`)
6 of 7 columns were hardcoded 6% stubs. Replaced with a real per-day query: `last7` sums meal
kcal via `entriesForDay(d)` for each of the last 7 days (memoized on log `version`, 7 tiny
queries). Columns scale against `max7 = max(...last7, 1)`. The "spent" (out) bar is driven by
`spentKcal`, which is honestly `0` until health-source energy sync ships — shown as absence,
not invented history.

### 2.5 LOW — null macros shown as "0 g" (`src/capture/CaptureSheet.tsx`)
`MacroBox` coerced null/undefined grams to `0`, asserting a value that's actually unknown.
`grams` is now `number | null | undefined`; renders `"—"` (em dash) when null/undefined,
`"{n} g"` otherwise. Callers drop their `?? 0` and pass `meal.totals.proteinG/carbsG/fatG`
directly (all optional in the contract).

## Local DoD (all green)
- `tsc --noEmit`: clean.
- `jest`: 12 suites, 56 tests passed (incl. the 2 new regression tests). Pre-existing
  worker-teardown warning in `auth.tsx` test — unrelated to this batch.
- `jest src/db` isolated: 8 passed. Verified both new tests **fail** when the fix is reverted.
- `expo export --platform ios`: OK (bundle built, `dist` produced then cleaned).
- `npm run api:check`: **pre-existing drift, not from this batch.** The contract has advanced
  to v0.4.0 (BE-017 `from`/`to`/`type` query filters) but `types.gen.ts` isn't regenerated.
  Git shows no local mod to the contract or the generated file; my five fixes touch neither.
  The backend agent is editing the contract live, so regenerating now would be racy and out of
  scope — leave BE-017's app-side regen to its own ticket.

## Files changed (all under app/services/vita-app/)
- `src/db/entries.ts` — normalize occurredAt on write
- `src/db/outbox.ts` — drop poison-pill 4xx, continue drain
- `app/(main)/home.tsx` — energy bars vs pair max; real last-7-days query
- `src/capture/CaptureSheet.tsx` — MacroBox null → "—"
- `src/db/__tests__/entries.test.ts` — NEW, day-boundary regression
- `src/db/__tests__/outbox.test.ts` — poison-pill regression

## How to verify
```
cd app/services/vita-app
npm run typecheck
npx jest src/db          # 8 pass; the 2 named tests are the regressions
npx jest                 # full suite, 56 pass
npx expo export --platform ios
```
