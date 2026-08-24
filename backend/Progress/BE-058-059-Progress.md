# BE-058 + BE-059 — hand-built plans and programs on the existing save paths

**Tickets:** BE-058, BE-059 (v4.2 wave 1) · **Spec:** `docs/v4.2/backend-plan.md` §1.1–§1.4 + §3
**Contract:** v0.9.0 (server half of D1–D6) · **Model:** Opus builder
**Scope:** the plan/program **save paths** only — migrations `V013`/`V014`, `backend/tools/` and the
food/exercise lookup services belong to the concurrent BE-060/062 builder and were not touched.

## Headline

Nothing new was built. Both builders ride the endpoints that already exist: a hand-built plan is a
`POST /v1/plan` with the same `EatingPlanDraft` a PDF parse produces, a hand-built program a
`POST /v1/program` with the same `TrainingProgramDraft`. The whole round is 4 additive DTO fields, one
deleted validation line, one vocabulary value, one deleted alias — and one duplicate implementation
collapsed into a chokepoint.

## BE-058 — hand-built eating plans (D1/D2/D3)

- **`PlanItem.kcal`** (`Double?`) — the TOTAL for the item at its stated quantity, not per unit
  (`nutritionPerUnit` is untouched and independent). **Pure pass-through: the server computes no
  nutrition.** It already didn't for a parsed plan (`dailyTotals`/`PlanMeal.kcal` are client numbers
  from the report page), so this is the missing rung of an existing ladder, not a new concept.
- **`PlanItem.kcalEstimated`** (`Boolean?`) — the estimate label travels **with** the number and
  persists in the saved doc, because the constitution requires an estimate to stay labelled for as
  long as it is shown, not just on the screen that produced it.
- **D1 relaxation:** `PlanController.validatePlan()` lost `if (body.meals.any { it.items.isEmpty() })`.
  A named slot with no food yet ("Supper", added before you decide what goes in it) is a legitimate
  meal. Same trade 0.8.0 made for `MealDetail.items`.
- **`kcalEstimated` without `kcal` → 400** (a label with nothing to label), and **`kcal < 0` → 400**
  (contract `minimum: 0`). Both live in `PlanService.validateV3()`, which already walks every item in
  flat document order (base items then option items) and is reached by **both** `importPlan` (POST)
  and `editPlan` (PUT) — one place, both verbs, options included.

Everything else was already correct and is asserted rather than changed: `decorate()` stamps `m-N` /
`it-N`, `PortionBoundsHeuristic` already handles the builder's four units, the doc is encrypted whole
under the per-user DEK, and `EatingPlanDraft.status` defaults to `"ready"` so a built plan is **born
ready and never passes through `review`** — the review already happened, on the builder's own screen.

## BE-059 — hand-built programs (D4/D5/D6 + the chokepoint)

- **`PlanExercise.durationMin`** (`Int?`) — the time family's minutes, which previously had nowhere to
  go (`sets`/`reps`/`loadKg` only). The set/time *family* stays derived, not stored.
- **`PlanExercise.wholeBody`** (`Boolean?`) — "the split is a guess", the app's pale band.
- **`Muscles.VOCAB` gains `traps`** and the `traps → back` alias is **dropped** (`lats → back`,
  `abs`/`obliques → core` stay). Folding traps into back permanently deleted a distinction the app has
  a chip and a silhouette for (face pull, deadlift, barbell row). `PlanPrompts` builds its tool enums
  from `VOCAB`, so the plan-parse schema picked `traps` up for free.
- **The chokepoint:** `POST`/`PUT /program` never normalized client-sent muscles — only the *parse*
  path did — so a typo would have been stored verbatim inside an encrypted blob nobody can grep. Rather
  than add a second copy of the walk, `PlanParseService.decorateProgram()` moved up into
  **`Muscles.normalizeProgram(draft)`** and both program endpoints call it. One implementation now
  covers the hand-built, the imported **and** the later estimate-fallback paths; `PlanParseService` got
  13 lines shorter.
- `validateProgram()` also rejects `durationMin < 1` (contract `minimum: 1`).

## Files touched

| File | Change |
|---|---|
| `src/main/kotlin/com/llmagal/vita/model/ai/PlanDtos.kt` | `PlanItem.kcal` + `kcalEstimated`; `PlanExercise.durationMin` + `wholeBody`. All `NON_NULL`, so docs that don't carry them are byte-unchanged. |
| `src/main/kotlin/com/llmagal/vita/model/Muscles.kt` | `traps` into `VOCAB` (12 values); `traps → back` alias removed; new `normalizeProgram()`; KDoc. |
| `src/main/kotlin/com/llmagal/vita/controller/plans/PlanController.kt` | Dropped the empty-items rule; program POST/PUT go through `Muscles.normalizeProgram()`; `durationMin >= 1`. |
| `src/main/kotlin/com/llmagal/vita/service/plans/PlanService.kt` | `validateV3()`: `kcalEstimated`-without-`kcal` and negative `kcal` → 400. |
| `src/main/kotlin/com/llmagal/vita/service/ai/PlanParseService.kt` | Private `decorateProgram()` deleted; calls the shared `Muscles.normalizeProgram()`. |
| `src/test/kotlin/com/llmagal/vita/plans/PlanFlowTest.kt` | +6 tests (below). |
| `src/test/kotlin/com/llmagal/vita/plans/ProgramFlowTest.kt` | +5 tests (below). |

No migration, no crypto change, no new endpoint, no new dependency.

## Tests (+11: 6 + 5), both driving the spec's example bodies verbatim

`PlanFlowTest` (§1.1 body):

1. `a hand-built plan saves with ids, bounds and its empty meal preserved` — `m-1`/`m-2`, `it-1`/`it-2`,
   Oats `{0,120,10}`, Egg `{0,4,1}`, Supper `items: []`.
2. `per-item kcal and kcalEstimated come back exactly as sent` — 235/true, 155/false, and no
   `nutritionPerUnit` invented.
3. `PUT round-trips the ids and the kcal fields` — the GET body posted straight back.
4. `a hand-built plan is born ready and never passes through review` — current doc **and** history.
5. `kcalEstimated without kcal is 400`.
6. `negative kcal is 400`.

`ProgramFlowTest` (§1.2 body):

1. `a hand-built program round-trips durationMin, wholeBody and its muscle roles` — plus the family
   check: the set exercise carries no `durationMin`, the time exercise no `sets`.
2. `an exercise nobody mapped stays unmapped` — "Pole dance" has neither `muscles` nor `muscleRoles`;
   nothing is guessed.
3. `traps survives the save path instead of folding into back`.
4. `POST normalizes client muscles - unmappables dropped, aliases folded, dupes primary-wins` —
   `["lats","spleen","BACK"]` + a duplicated `lats` (secondary then primary) + a bogus role →
   `muscles ["back"]`, `muscleRoles [back/primary]`.
5. `PUT normalizes too, and durationMin below 1 is 400`.

## Gates

- **Full suite green: 277 tests, 0 failures, 0 errors** (baseline 266 → +11), 33 suites.
- **ktlint + detekt clean.**
- ⚠ **`./gradlew check` cannot pass in this tree right now, for a reason outside this ticket:** the
  concurrent BE-060 builder's in-progress `V013__food_tables.sql` fails Flyway on boot
  (`new row for relation "food" violates check constraint "food_carb_100g_check"`), which kills the
  Spring context for **every** integration test. Retried once, same result. The 277-green run above is
  the same full `test` task with `SPRING_FLYWAY_TARGET=012`, i.e. the tree exactly as it stands minus
  their two unfinished migrations — no file of theirs touched. **`check` must be re-run once BE-060's
  seed is fixed.**

## Notes / deviations

- **"Round-trips verbatim" has one documented exception:** an exercise that sends only `muscleRoles`
  comes back with `muscles` **derived** from the role names. That is pre-existing `Muscles.normalize()`
  behaviour and the contract states it explicitly; roles are never derived from a bare `muscles` list.
  The §1.2 Squat therefore returns `muscles: [quads, glutes, core]` in addition to its roles.
- **`kcal < 0` and `durationMin < 1` were not asked for** — added because `validateV3()`/`validateProgram()`
  exist precisely to mirror the schema so bad saves fail loud, and both are one clause each.
- **The capture prompt in `ClaudeClient.kt` still lists 11 muscles** (no `traps`) and is locked by the
  `parse-text-request-v0.7.0.json` golden. Out of scope here: the capture path maps through
  `Muscles.map()`, so adding `traps` there is a prompt+golden change of its own whenever the workout
  capture wants the distinction.
- **Not Done in Asana** — DoD is production; BE-064 ships the image. Both tickets moved to *In progress*
  with an execution comment.
