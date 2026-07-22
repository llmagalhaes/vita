# ADR-0017 — Contract v0.6.0: portion overlay, per-item micros, per-exercise muscle roles (meal-plan round)

**Status:** Accepted — 2026-07-22 (meal-plan/workout-plan round; BE-036)

## Context

The CEO approved rebuilding the Eating Plan and Training Program screens
(`docs/meal-plan-handover/DESIGN-SPEC.md`). Portion-slider state must persist in
the backend; the totals-card micros chips need per-item data to recompute live;
the workout body-map needs per-muscle primary/secondary roles. The build-ready
backend spec is `docs/meal-plan-handover/backend-spec.md`, with CEO amendments
A1–A9 (2026-07-22) baked in.

## Decision

Contract bumps **0.5.0 → 0.6.0, all additive** (no 0.5.0 consumer breaks):

1. **`PlanItem.id`** (optional string ≤ 40): server-generated stable id
   `it-1…it-N` in flat document order, assigned **at save/parse-save time
   only** — the portions-overlay key. Clients round-trip it on PUT /plan.
   **No backfill (CEO A2):** we are pre-real-users; docs stored before 0.6.0
   simply have no ids (and no usable overlay) until their next save;
   destructive migrations / DB recreation are acceptable. No on-read
   derivation code exists.
2. **`PlanItem.microsPerUnit`** (optional `{fiberG, sodiumMg, ironMg,
   calciumMg}`): per-single-unit micronutrient estimates from parse. The
   shared `MacroTotals` is NOT extended. The daily `micros` array stays as the
   app's fallback. All nutrition values are Claude parse estimates; the design
   handoff's nutrition table is example data used only as golden test input
   (CEO A4) — no product constant comes from it.
3. **`PlanItem.portion`** (optional `{min, max, step}`): slider bounds from a
   deterministic backend heuristic (countable → 0..max(2·qty, qty+2) step 1;
   g → 0..2·qty step 10; ml → 0..2·qty step 50; half-up rounding). Server
   authoritative — recomputed at every save, never by the model.
4. **`GET /plan` may carry a sparse `portions` map** (`PortionsMap`:
   `PlanItem.id → qty`), via `EatingPlanWithPortions` (`allOf` over
   `EatingPlanDraft` + optional `portions` — same wire object, not a wrapper).
   Parse responses, POST/PUT echoes, and history never carry it.
5. **`PUT /plan/portions`** replaces the whole map (idempotent, no PATCH):
   values clamped/snapped to the item's bounds; unknown id → 422 whole-request
   reject; empty map clears; no current plan → 404. Portion changes never
   create plan versions; the overlay resets on new import. Doc edits follow
   CEO A5: untouched items keep overrides, an edited item's override resets,
   removed items are pruned.
6. **`Exercise.muscleRoles`** (optional `[{name, role: primary|secondary}]`),
   same closed 11-silhouette vocabulary as `muscles`; when roles are present
   and `muscles` absent the backend derives `muscles` from role names — never
   the reverse. Shared by capture workouts and program days.

**Storage note (CEO A1):** the overlay persists as **plaintext jsonb**
(`plan_portions`, migration V008) — portions are not sensitive; no per-user
DEK/AAD/crypto-shred wiring; account deletion cleans it via plain FK cascade.
This narrows ADR-0003's default for this table deliberately. The plan doc blob
itself keeps its existing encryption (CEO A3: no repo-wide changes).

## Consequences

- App regenerates types against 0.6.0; old clients ignore every new field.
- redocly lint: valid (pre-existing operationId warnings only).
- Implementation lands in BE-037 (ids + heuristic), BE-038 (overlay + V008 +
  endpoint), BE-039 (parse micros + eval fixtures), BE-040 (muscleRoles),
  shipped by BE-041 via the OPS-024 Terraform deploy.
- Ceiling: positional `it-N` identity is weak under heavy reordering by old
  clients — acceptable pre-launch; content-hash ids are the upgrade path.
