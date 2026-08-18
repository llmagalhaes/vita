# BE-048 + BE-049 — day-record fields + `weight` entry type

Session 22 (2026-08-18) · one Opus builder for both tickets (same model/entries neighborhood).
Spec: `docs/v4/backend-plan.md` §3.1–3.4 + §4 wave-2 · contract `docs/contracts/vita-api-v0.yaml` **v0.8.0** ·
ADR-0019.

## What shipped

### BE-048 — day-record fields on the entries write path

`model/entries/EntryDetail.kt`
- `MealDetail` += `planMealId` / `planStatus` / `planOptionIndex`.
- `MealItem` += `replacesItemId`.
- `WorkoutDetail` += `planDay` / `planStatus`.
- New `enum class PlanStatus { done, adjusted, skipped }` — same lowercase-wire idiom as `EntryType`.
  An unknown wire value fails the typed read (`read<T>` → `JacksonException`) and surfaces as the existing
  **400** "detail does not match the entry type"; no hand-rolled enum validation.

`service/entries/EntryService.kt` — `normalize()` rules:
- `planStatus` / `planOptionIndex` without `planMealId` → 400.
- `planOptionIndex < 0` → 400 (contract `minimum: 0`).
- `items` may be empty **only** when `planStatus == skipped`; any other status keeps the unchanged
  message "A meal needs at least one item." → 400.
- A skipped meal runs through the same `totalsOf()` and denormalizes to `kcal 0` (zero totals).
- Workouts: `planStatus` without `planDay` → 400.
- Everything is stored **verbatim** in the encrypted detail; the server never validates `planMealId`
  against the current plan (a retro record may outlive its plan version — ADR-0019).

### BE-049 — `weight` entry type

- `V010__log_entry_weight_type.sql` — expand-only CHECK widening, mirrors V006 line for line.
- `EntryType` += `weight`; new `WeightDetail(kg)`.
- Range 20.0..500.0 kg, outside → 400.
- `denormalize` → all-null (folded into the existing `checkin` branch: trends are client-side, ADR-0019).
- `GET /entries?type=…` needed **no change** — `FILTERABLE_TYPES` already derives from `EntryType.entries`.

## Files touched

| File | Change |
|---|---|
| `backend/services/vita-api/src/main/kotlin/com/llmagal/vita/model/entries/EntryDetail.kt` | +`PlanStatus`, +6 fields, +`WeightDetail` |
| `backend/services/vita-api/src/main/kotlin/com/llmagal/vita/model/entries/EntryDtos.kt` | `EntryType` += `weight` |
| `backend/services/vita-api/src/main/kotlin/com/llmagal/vita/service/entries/EntryService.kt` | normalize rules, weight branch, denorm, constants; `normalize()` split into `normalizeMeal/Workout/Checkin` (detekt CyclomaticComplexMethod: 24 > 15 after the new branches — pure extraction, no behaviour change) |
| `backend/services/vita-api/src/main/resources/db/migration/V010__log_entry_weight_type.sql` | **new** |
| `backend/services/vita-api/src/test/kotlin/com/llmagal/vita/entries/EntryFlowTest.kt` | +13 tests; 1 pre-existing test scoped by id (see below) |

## Tests — EntryFlowTest 13 → 26 (+13)

BE-048 (8): plan meal `done` (linkage round-trips) · `adjusted` with `replacesItemId` on every item ·
skipped + empty items → 201 with zero totals · empty items with a non-skipped status → 400 ·
orphan `planStatus`/`planOptionIndex` + unknown status value → 400 · workout `done` + `adjusted` +
`planStatus` without `planDay` → 400 · POST→GET→PATCH→GET detail unchanged · idempotent replay of a
close-the-day write (same key replays, different body 409).

BE-049 (5+1): create via `Idempotency-Key: weight:<date>` (+ C2 columns null) · replay identical →
same id · 409 on a different body · PATCH correction · range 19.9/500.1 → 400 while 20/500 → 201 ·
`weight` accepted in the `GET /entries` type CSV.

## Deviations / notes

1. **Acceptance list said "skipped-with-items-400"** — implemented and tested as
   **empty-items-with-a-non-skipped-status → 400**, which is the rule both the plan §3.1 and contract
   0.8.0 actually state. Nothing in the contract forbids a *skipped* meal that still carries items
   (it would just total whatever those items total), so no such rule was invented.
2. **Pre-existing test fixed, not new behaviour:** `C3 content is encrypted at rest` asserted
   `SELECT kcal FROM log_entry WHERE type='meal' LIMIT 1` = 300. The class shares one DB and the new
   skipped-meal test inserts a legitimate `kcal 0` meal row, so the unordered `LIMIT 1` became a
   coin flip. Query is now scoped to the id that test created.
3. **`planStatus` as a Kotlin enum** rather than a validated `String`: unknown-value → 400 comes free
   from the tolerant-reader path, so no extra validation code.
4. Two ktlint style fixes on the way out (no behaviour): `PlanStatus` moved below `MealDetail` (its KDoc
   was following the file KDoc — `no-consecutive-comments`), and the three one-line GET chains in the
   tests collapsed into a `fetchEntry(id)` helper (`chain-method-continuation`).

## Gate

`./gradlew check` (full, this tree only — no sibling BE-050 work in it): detekt/ktlint clean after the
`normalize()` split; `:test` **245 tests, 1 failed** — that failure was note 2 above, fixed after the run.
Final state: `./gradlew detekt ktlintCheck` → **BUILD SUCCESSFUL**;
`./gradlew test --tests 'com.llmagal.vita.entries.*'` → **BUILD SUCCESSFUL**, EntryFlowTest **26/26**,
TimelineFlowTest 18/18, CheckinFlowTest 4/4 (48/48 green).
The full merged-tree gate is the orchestrator's (sibling BE-050 lands in the same suite).
</content>
</invoke>
