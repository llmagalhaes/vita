# BE-REVIEW-FIXES — Fable audit backend fast-follow

Fast-follow on the Fable audit (`docs/reviews/2026-07-14-fable-audit.md`), findings **1.3** and **1.4**.
Both centre on `EntryService.normalize`, so they share one code path (POST /entries + PATCH /entries/{id}).
No Asana ticket of its own — dispatched by the orchestrator as a review fast-follow. No git (orchestrator commits).

## 1.3 — Muscle closed-vocabulary mapping (MED)

Contract (`docs/contracts/vita-api-v0.yaml` §915, WorkoutDetail.muscles) promises the backend maps model
output onto the 11-silhouette vocabulary and drops anything unmappable (lats/traps → back, abs/obliques → core).
It was **not implemented** — `muscles` was stored raw, so "lats"/"abs" reached storage and would violate the
app's generated `Muscle` enum (bites slice-2 body map).

Fix in `EntryService.normalize` (workout branch): each muscle string is trimmed + lowercased, kept if it is one
of the 11, else folded through the alias map, else dropped. Result is de-duped; an all-dropped list becomes null
(NON_NULL keeps the blob tidy). Because PATCH re-runs `normalize`, edits are covered too.

- `MUSCLES` = chest, back, shoulders, biceps, triceps, forearms, core, glutes, quads, hamstrings, calves.
- `MUSCLE_ALIASES` = lats→back, traps→back, abs→core, obliques→core (exactly the contract's list).

## 1.4 — Contract minimums unvalidated → 500s / silent bad data (MED)

`normalize` validated only water range / meal non-empty / workout title. Contract-invalid numbers either hit a
Postgres CHECK (500, contract implies 400) or were stored silently (negative macros). Added, rooted in the shared
path so POST and PATCH both benefit:

- meal items: `kcal`, `proteinG`, `carbsG`, `fatG` all `>= 0` (these feed the denorm columns whose CHECKs were the 500 source).
- workout: `durationMin >= 1`, `kcal >= 0`; exercises `sets >= 1`, `reps >= 1`, `loadKg >= 0`.
- `inputMethod` ∈ {voice, text, photo, tap, checkin, import} — validated in `create()` (PATCH carries no inputMethod).

All return the standard 400 via the existing `badRequest(...)` → `ResponseStatusException(BAD_REQUEST)` shape.

## Tests (EntryFlowTest, +4)

- `workout muscles are mapped … and unmappable ones dropped`: `[lats, abs, chest, banana]` → `[back, core, chest]` (valid mixed set still succeeds, banana dropped).
- `rejects a negative-kcal meal item` → 400 (was a 500 via CHECK).
- `rejects a workout with durationMin 0` → 400 (was a 500 via CHECK).
- `rejects an out-of-enum inputMethod` → 400 (was silently stored).

## Result

- `./gradlew check` green — **93/93 tests** (was 89; +4 above, all in EntryFlowTest → 12).
- detekt + ktlint clean. **Contract untouched** (no version bump) — purely additive service behaviour the contract already specified.

## Files changed (all under `backend/`)

- `services/vita-api/src/main/kotlin/com/llmagal/vita/entries/service/EntryService.kt` — inputMethod guard in `create`; muscle map + numeric bounds in `normalize`; `validateItem`/`validateExercise`/`nonNegative`/`mapMuscle` helpers; `INPUT_METHODS`/`MUSCLES`/`MUSCLE_ALIASES` constants.
- `services/vita-api/src/test/kotlin/com/llmagal/vita/entries/EntryFlowTest.kt` — 4 new cases.

## Not in scope (other audit findings, other owners)

1.1/1.2/2.1/2.2/2.5 = app batch. 2.3 = BE-022 (token purge). 1.5/1.6/3.1 = hygiene sweep debt. 2.4 = CEO/ADR-0004 note.
