# BE-043 + BE-044 + BE-045 — V3 plan model, async parse, parse extensions

Spec: `docs/v3/backend-spec.md` (§0 V3-D1..D15) + `docs/v3/reconciliation.md`. Contract
v0.7.0 already committed (BE-042). Built 2026-07-23. Tree left dirty for the orchestrator.

## What was built

### BE-043 — v3 doc model + save semantics
- `model/ai/PlanDtos.kt`: `EatingPlanDraft` + `status` (default "ready"), `note`, `hydration`,
  `supplements`; `PlanMeal` + `kcal`, `note`, `options`, `usualOptionIndex`; `PlanItem` + `grams`,
  `swaps`, `usualSwapIndex`; new `MealOption`/`SwapOption`/`Hydration`/`Supplement`; `ProgramDay`
  + `kcalEstimate`. All `@JsonInclude(NON_NULL)`.
- `service/plans/PlanService.kt`: `decorate()` now stamps ids + portion bounds over the FLAT order
  (base items, then each option's items, per meal — V3-D8) → this PDF = it-1…it-42. Bounds derive
  from the EFFECTIVE quantity/unit (the usual swap's when `usualSwapIndex` set — V3-D9). `validateV3()`
  → 400 for out-of-range usual indices, >40 swaps, >8 options, bad status. A5 overlay prune now
  compares EFFECTIVE (quantity, unit, grams) so a usual-swap change resets that item's override.
- `service/plans/PortionBoundsHeuristic.kt`: **grams fallback** — for a g/ml unit the amount is
  `quantity ?: grams` (the v3 model routes a plain weight like "Frango 200 g" into `grams`, leaving
  `quantity` null; without this those items got no slider). Countable units still ignore grams.
- `controller/plans/PlanController.kt`: `putPortions` binds `Map<String, Double?>` and rejects a null
  value with 400 (V3-D15 — was NPE→500).

### BE-044 — async import
- `db/migration/V009__plan_parse_job.sql` (expand-only, state-only tracker, FK cascade, no PII).
- `repository/plans/PlanParseJobRepository.kt` (+ `JobState`, `PlanParseJob`).
- `config/AsyncConfig.kt` — `@EnableAsync` + `planParseExecutor` fixed pool of 2 (caps Claude spend).
- `service/ai/PlanImportService.kt` — `PlanImportService.accept` (insert running row → hand to worker
  → 202 {jobId}; 409 if a non-stale running job exists) + `poll` (owner-only 404, running-past-stale
  → failed) + `@Async PlanImportWorker.run` (parse on async knobs → save as `status:"review"` via
  `importPlan`; failures → fixed human-safe phrase, real cause WARN-logged). `// ponytail:` on the worker.
- `controller/ai/PlanParseController.kt` — POST /parse/eating-plan → 202/409; GET …/jobs/{jobId}.
- `service/jobs/TokenCleanupJob.kt` — +DELETE `plan_parse_job` older than 7 days.

### BE-045 — parse extensions
- `service/ai/PlanPrompts.kt`: tool schema additive (`note`, `hydration`, `supplements`, meal `kcal`/
  `note`/`options`, item `grams`/`swaps`; one shared `PLAN_ITEM` for meals[].items and options[].items);
  `kcalEstimate` on training days. Prompt block appended to `EATING_PLAN_SYSTEM` (verbatim transcription,
  document language, options, per-item swaps, hydration/supplements) + one line to the training prompt.
- `service/ai/ClaudeClient.kt`: async knobs (`plan-async-max-output-tokens 16384`, `-timeout-seconds 300`)
  + a third RestClient + `callTool(..., longRun)` — the eating-plan path is long-run, sync program parse unchanged.
- `service/ai/PlanParseService.kt`: eating spec `longRun=true`; `decoratePlan` now covers option items.
- `application.yaml`: the two async knobs + `plan-job-stale-minutes: 10`.

## Gates
- `./gradlew check` — GREEN, **225 tests, 0 failures** (was 202; +23 v3 tests). detekt + ktlint clean.
  (One override added: `config/detekt/detekt.yml` raises MaxLineLength 120→140 to match ktlint's
  default, ending a ktlint-expression-body vs detekt-line-length standoff.)
  - NOTE: `PhotoParseFlowTest > an image over 5 MB is a 413` is a PRE-EXISTING intermittent transport
    flake ("chunked transfer encoding, state: READING_LENGTH"; documented sessions 16/16b) — photo path
    untouched by V3; passes on rerun (verified 5/5 this session).
- **LIVE EVAL** (`PlanParseV3LiveEvalTest`, @Tag("live"), real meal-plan.pdf + real API) — **GREEN.**
  meals=5 · items=42 · swaps=**308** · options=4 · hydration=2500 · supplements=3 ·
  dailyTotals 1716/188.6/153.4/47.9 — every §6.1 structural + stated-number assert passed.
  Cost: 32.8k in / 16.0k out tokens ≈ $0.34, ~3.3 min wall.

## Tests added
- `ai/PlanV3FixtureTest` (8, deterministic from golden), `ai/PlanImportFlowTest` (7, async flow
  Testcontainers+WireMock), `plans/PlanUsualsFlowTest` (8, usuals/status/V3-D15), `ai/PlanParseV3LiveEvalTest`
  (1 @live). Golden fixture committed: `src/test/resources/eval/v3-meal-plan-golden.json`.

## Deferred
- Golden fixture = the orchestrator's provided `docs/v3/golden-parse-capture.json` (already the validated
  real capture); did NOT re-generate via a VITA_EVAL_DUMP run (§6.2 dump flag) — the capture is ground truth.
- BE-046 (image build/push + prod probes + devops Terraform apply vita:9) — next round.
