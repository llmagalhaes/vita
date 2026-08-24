# BE-061 + BE-063 + BE-065 — the three estimate endpoints (v4.2, Wave 2)

**Status:** built, gates green. `./gradlew check` **BUILD SUCCESSFUL — 327 tests, 0 failures**
(27 new, all in `com.llmagal.vita.estimate`). Live evals run once against the real API: **all 3 green**.

## What shipped

| File | What |
|---|---|
| `model/estimate/EstimateDtos.kt` | The three request/response pairs, exactly the contract shapes. Every request field nullable → a bad body is a worded 400, never a Jackson 500. |
| `repository/estimate/EstimateCacheRepository.kt` | `food_estimate_cache` / `exercise_estimate_cache` read + upsert. User-less by construction (no `user_id` parameter exists to pass). |
| `service/estimate/EstimatePrompts.kt` | The 3 tool schemas + system prompts + tool-output DTOs. Data, so the service reads as the ladder it is. The muscle tool's `name` enum **is** `Muscles.VOCAB` — the closed vocabulary is enforced in the schema, not just after the fact. |
| `service/estimate/EstimateService.kt` | The three passes over one ladder: table → cache → ONE batched Claude call for the misses → automatic write-back. |
| `controller/estimate/EstimateController.kt` | The 3 endpoints, list/name validation, and the **existing** `ParseQuota` (no new limiter). |
| `service/ai/ClaudeClient.kt` | +`callEstimateTool()` + its own RestClient on the estimate budget/timeout. Two constructor params added **with defaults** so the 9 existing test constructions compile untouched. |
| `service/estimate/FoodLookup.kt` | `MASS_UNITS`/`COUNT_UNITS` private → public. One unit vocabulary shared by the table leg and the cache key; a second copy would have drifted. |
| `application.yaml` | The three `vita.ai.estimate-*` knobs (model / max-output-tokens / timeout). No new env var. |

Tests: `EstimateTestBase` (real V013/V014 seed in Testcontainers + Claude behind WireMock, both
caches truncated per test) · `EstimateFoodKcalTest` **10** · `EstimateExerciseMusclesTest` **6** ·
`EstimateWorkoutKcalTest` **6** · `EstimateControllerTest` **5** · `EstimateLiveEvalTest`
**3 @Tag("live")**.

## Endpoints

- `POST /v1/estimate/food-kcal` — positional, ≤60 items, misses batched into one Haiku call,
  answers cached, `max(5, round(k/5)*5)` applied to table hits and model answers alike.
- `POST /v1/estimate/exercise-muscles` — catalog hit → `estimated:false`; cache/model →
  `estimated:true`; nothing confident → **empty** `muscleRoles` (the app keeps "not mapped").
  Every answer — catalog, cache **and** model — leaves through `Muscles.normalize()`, and what
  reaches the cache is already normalized, so the fold can never be skipped later.
- `POST /v1/estimate/workout-kcal` — one day in, one number out, `estimated: true` always.

## BE-065's estimator — the choice, documented

**Local MET-style formula for a day the catalog knows in full (zero cost, zero latency); ONE Claude
call for the WHOLE day the moment any name is unknown, and that number wins.** Not a per-exercise
fan-out: energy is a property of the session (contract), and one call is the stated ceiling.

- `set` family minutes = `sets × (reps × 4 s + 75 s rest)`; `time` family minutes = `min`.
- Rates: 6 kcal/min strength · 8 cardio · 10 whole-body. All named constants — **calibration knobs**,
  not physics; the number is labelled an estimate on every screen it reaches.
- Model leg fails → the local sum stands whenever ≥1 exercise resolved; nothing resolved → 422.
- **No cache leg here** (`ponytail:` comment in place): the only reusable key would be the whole
  day's composition, which is never asked twice.

## Cache write-back proof

Unit (WireMock, asserted): a missed name costs **one** call; the same name on the next pass costs
**zero** and returns the identical number; `cache.foodKcal("coxinha","unit") == 283`.

Live (real API, one run, cold cache):

```
estimate kind=food items=4 tableHits=2 cacheHits=0 misses=2 inputTokens=972 outputTokens=62
LIVE EVAL food-kcal -> [235, 150, 190, 5] in 1089ms
estimate kind=food items=4 tableHits=2 cacheHits=2 misses=0 inputTokens=0 outputTokens=0
LIVE EVAL food-kcal (cached) -> 16ms
LIVE EVAL exercise-muscles -> muscleRoles=[], wholeBody=true, estimated=true   ("Pole dance")
LIVE EVAL workout-kcal -> 530                                                  (4-exercise day)
```

Aveia 60 g = 235 (table) · Pão francês 1 unit = 150 (table) · **Coxinha 1 unit = 190 (model, the
deliberate miss)** · Água 500 ml = **5, the floor**. Second pass: 0 tokens, 16 ms.

## Deviations (all reported, none silent)

1. **The food cache stores a BASIS value, not a total** — kcal per 100 g/ml for a mass unit, per one
   `<unit>` for a countable one. V013 gives the cache no quantity column, so a cached *total* would
   be wrong for every other quantity ("Coxinha ×3"). The basis is what makes a quantity-less row
   correct, and it matches the seed table's own semantics (`kcal_100g` / `grams_per_unit`). V013 is
   untouched (a comment would change its Flyway checksum); the rule lives in the repository KDoc.
   Rounding still happens only on the way out, so the basis is never rounded twice.
2. **A unit outside the contract's four** (`colher`, `fatia`, …) is not rejected: it becomes a
   per-one-of-that-word basis and the model is asked "1 colher of X". Honest, cacheable, and it
   keeps one unit of bread and one unit of watermelon apart for free.
3. **Food's 422 is "every result is null"**, which folds the contract's two conditions (model leg
   failed AND table answered nothing) into one check. Exercise's 422 stays the contract's literal
   rule — an **empty** muscle list is a valid 200 answer there, so "all empty" must not 422.
4. **An empty (not-confident) muscle answer IS cached.** Stated policy, deterministic, and one
   `TRUNCATE` resets it; re-asking a name the model already declined is pure waste.
5. **The FOOD prompt had to be told that 0 is an answer.** The first live run came back
   `[235, 150, 200, null]` — the model *omitted* Água rather than pricing it at 0, so the 5-kcal
   floor never fired. Fixed at the instruction ("water, black coffee, plain tea … RETURN the 0"),
   not at the assertion. Second run: `5`. This is why the eval exists.
6. **`ClaudeClient` gained a fourth RestClient**, not a fourth boolean on `callTool`. The estimate
   budget/timeout differ from every existing profile and the caller has no content blocks to build.

## Notes for BE-064 (the deploy round)

- Grep line for the prod probe: `estimate kind=food … misses=N` (also `kind=exercise` / `kind=workout`).
  Probe (3) is a 12-food pass, probe (4) the same 12 again → the second must log `misses=0` and
  `inputTokens=0`.
- No new AWS resource, no new SSM parameter, no new env var. `VITA_AI_ESTIMATE_MODEL` exists as an
  override but defaults to `claude-haiku-4-5` in `application.yaml`.
- `./gradlew check` is 327 green. One known **pre-existing flake** sits in the suite:
  `PhotoParseFlowTest > an image over 5 MB is a 413` failed once on a contended run and passed in
  isolation and on every re-run — untouched by this ticket.
- Live evals cost ≈ $0.01 for the whole file: `./gradlew liveEval --tests '…EstimateLiveEvalTest'`.
