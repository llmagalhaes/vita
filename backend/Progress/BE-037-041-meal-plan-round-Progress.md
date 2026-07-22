# BE-037…040 — Meal Plan & Workout Plan round (backend build)

Spec: `docs/meal-plan-handover/backend-spec.md` (CEO amendments A1–A9 baked in).
Baseline: 157 tests green, next migration V008, contract v0.6.0 + ADR-0017 already in repo (BE-036 done — YAML untouched).

## Plan
- BE-037: PlanItem ids (save-time only, no backfill) + PortionBounds heuristic + DTOs.
- BE-038: plan_portions V008 (plaintext jsonb) + PUT /plan/portions + GET /plan overlay + A5 reset/prune.
- BE-039: eating-plan parse microsPerUnit + portion decoration + eval fixtures + parse INFO line + output-token check.
- BE-040: muscleRoles program+capture parse + shared Muscles vocabulary object.
- BE-041: NOT this round (image/deploy).

## Progress

> Attempt-1 partial code was reverted (tree was clean at start). This is attempt-2, built from the spec.

### BE-037 — PlanItem ids + portion-bounds heuristic — DONE (green)
- `model/ai/PlanDtos.kt`: `PlanItem` gains `id`, `microsPerUnit`, `portion`; new `MicrosPerUnit` + `PortionBounds` data classes (micros field lands with BE-039; class defined here).
- `service/plans/PortionBounds.kt`: pure `object PortionBoundsHeuristic` (file named PortionBounds.kt, object renamed to avoid clashing with the DTO `PortionBounds`). Half-up, g step 10 / ml step 50 / countable step 1, g|ml qty≤0 → null.
- `service/plans/PlanService.kt`: `importPlan`/`editPlan` decorate the `EatingPlanDraft` (assign ids + recompute portion) before encrypt. POST = fresh it-1..N flat doc order; PUT = preserve valid round-tripped ids (non-blank ≤40, unique else 400), fresh = it-{max+1}. Client-sent id/portion discarded.
- `controller/plans/PlanController.kt`: plan POST/PUT rewired to importPlan/editPlan; program stays on generic importVersion/edit.
- **Decision (ponytail):** program docs get NO ids this round (spec §2 calls it "harmless, uniform"; overlay is eating-only D-8, muscle-map keys by vocab not ids, zero test/consumer). Add exercise ids when the muscle-map screen actually needs positional keys.
- Tests: `PortionBoundsTest` (23 table rows), PlanFlowTest +6 (it-N doc order, POST ignores client id/portion, PUT preserve+it-max+1, dup→400, pre-0.6.0 id-less reads id-less then PUT assigns fresh). `./gradlew test --tests plans.*` green.

### BE-038 — plan_portions V008 + PUT /plan/portions + GET overlay + A5 prune — DONE (green)
- `db/migration/V008__plan_portions.sql`: CREATE TABLE only (expand-only, rollback gate §6), plaintext jsonb, FK cascade to users + eating_plan.
- `repository/plans/PlanPortionsRepository.kt`: get/upsert(ON CONFLICT user_id)/delete — `?::jsonb` + `::text` pattern (mirrors JobRepository), no crypto.
- `service/plans/PlanService.kt`: `putPortions` (400 bad value/>200 keys, 404 no plan, 422 unknown id whole-reject, clamp+snap via stored bounds, empty→delete), `currentPlanWithPortions` (attach only when row.plan_id==current.id; stale→lazy delete), overlay reset in importPlan, A5 prune in editPlan. All @Transactional.
- `controller/plans/PlanController.kt`: GET /plan → currentPlanWithPortions; new PUT /v1/plan/portions.
- Note: Spring maps 422 to `HttpStatus.UNPROCESSABLE_CONTENT` (not _ENTITY) at the RestTestClient status assertion.
- Tests: `PlanPortionsFlowTest` (10: store/attach, idempotent+full-replace, clamp+snap, unknown 422, negative/>200 400, no-plan 404, empty-clear, reset-on-new-version, A5 edit prune, account-purge FK cascade). Green.

### BE-039 — eating-plan parse microsPerUnit + portion decoration + eval fixtures — DONE (green)
- `service/ai/PlanPrompts.kt`: `record_eating_plan` item schema gains `microsPerUnit` (fiberG/sodiumMg/ironMg/calciumMg); EATING_PLAN_SYSTEM appended with the per-single-unit + micros instruction.
- `service/ai/PlanParseService.kt`: `decoratePlan` sets each item's `portion` (heuristic, parse carries NO ids) + drops negative micros (`sanitizeMicros`, null-if-empty). One INFO line per parse: `parse plan={eating|training} outcome={ok|error} inputTokens=.. outputTokens=..` (also on RestClientException) — makes parse cost CloudWatch-visible (devops §5).
- `application.yaml`: plan-max-output-tokens 2048→3072 (per-item micros widen output; only produced tokens billed).
- Fixtures: `src/test/resources/eval/plan-parse-cases.json` (3 cases: reference-11-item, plan-without-micros, per-100g-trap — generated so Σ(per·qty)=1756.2 == §7). `PlanParseEvalCases` loader + `PlanParseEvalTest` (3, WireMock golden) + `PlanParseLiveEvalTest` (@Tag live, per-100g kcal∈[1.2,2.2]).
- A4 honored: totals asserted are computed from the fixture's own per-item data; no table number is a product constant.

### BE-040 — muscleRoles: program parse + capture parse + shared vocabulary — DONE (green)
- `model/Muscles.kt`: new shared pure `object Muscles` (VOCAB/map/mapAll/normalize) + `data class MuscleRole`. Moved MUSCLES/MUSCLE_ALIASES/mapMuscle out of EntryService. Normalize: map+drop unmappable, dedupe primary-wins, derive muscles from roles only when muscles absent, drop invalid role values.
- DTOs: `EntryDetail.Exercise` + `PlanDtos.PlanExercise` gain `muscleRoles`; PlanExercise also gains `muscles` (D-11, was never extracted).
- `service/ai/PlanPrompts.kt`: `record_training_program` exercise schema gains `muscles`+`muscleRoles` (shared MUSCLES_ARRAY/MUSCLE_ROLES_ARRAY off Muscles.VOCAB); TRAINING_PROGRAM_SYSTEM prompt delta.
- `service/ai/ClaudeClient.kt`: NUTRITION_PREAMBLE (capture `record_log_entries`) exercise prose gains muscleRoles — captured workouts feed roles too; normalization happens in EntryService at entry-create.
- `service/ai/PlanParseService.kt`: `decorateProgram` normalizes every exercise. `service/entries/EntryService.kt`: per-exercise Muscles.normalize + derive; workout-level uses Muscles.mapAll (no roles, DESIGN scope).
- Tests: PlanParseEvalTest +2 (program-with-roles: derive+drop tertiary+drop lowback; program-alias-fold: lats→back, dup collapses primary). EntryFlowTest +1 (capture workout muscleRoles alias+dup→normalized+derived). ParseEvalTest case6 (capture parse carries muscleRoles, assert helper extended). All green; ProgramFlowTest still green.

### GATE — `./gradlew check` GREEN (202 tests, 0 fail; was 157 → +45)
- detekt + ktlint clean (PortionBounds.kt renamed→PortionBoundsHeuristic.kt for MatchingDeclarationName; PlanService @Suppress TooManyFunctions; long lines wrapped; ktlintFormat run). PhotoParseFlowTest flaked once (chunked-transfer I/O, a known WireMock contention flake — passed isolated + on the clean full re-run).
- BE-041 (image build/push + live probes) is the deploy round — NOT this build round, gated on OPS-024 Terraform (§6). Tree otherwise clean.
