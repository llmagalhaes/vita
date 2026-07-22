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
(building)
