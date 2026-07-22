# Meal Plan & Workout Plan — approved design (2026-07-22)

CEO-approved architecture for rebuilding the Eating Plan and Training Program screens to the
design handoff in `design_handoff_vita_v2 4/SPEC - Eating Plan & Training Program.md` (the
visual source of truth — exact px/colors/animations live there, not here). This is one of the
product's central features; portion state persists in the backend.

## CEO decisions (2026-07-22)

1. **Portion overlay, separate from the plan doc.** Slider adjustments persist as a sparse
   `{itemId: qty}` overlay. The plan document only versions on real edits (import / item
   edits). Portion changes NEVER create plan versions.
2. **Per-item micros, live chips.** Contract + parse extended so each item carries per-unit
   micros (fiber/sodium/iron/calcium); the totals-card chips recompute live while dragging.
   Old imported plans lack the data → chips fall back to the static daily `micros` array.
3. **Workout screen uses real sources only.** History = captured workout entries + Health
   Connect sessions, credited honestly ("via capture", "via Health Connect"). No
   Garmin/Strava this round — no fake sources.

## Contract v0.6.0 (all additive)

- **`PlanItem.id`** — stable server-generated id per saved plan version (portions overlay key).
- **`PlanItem.microsPerUnit`** — optional typed object `{fiberG, sodiumMg, ironMg, calciumMg}`.
  Shared `MacroTotals` is NOT extended. Daily `EatingPlanDraft.micros` array stays (fallback
  for old plans, and for micros beyond the fixed four).
- **`PlanItem.portion`** — optional `{min, max, step}` slider bounds, derived by a
  **deterministic backend heuristic** at parse/save time (not by Claude — testable):
  countable units → `0..max(2×qty, qty+2)` step 1; `g`/`ml` → `0..2×qty` rounded to step
  (10 g / 50 ml). App keeps its `portionRange` fallback for docs without bounds.
- **Portions overlay endpoints** — the `GET /plan` response gains an OPTIONAL top-level
  `portions` map (additive — parse responses and history versions never carry it; changing
  the response to a `{doc, portions}` wrapper would be breaking);
  **`PUT /plan/portions`** replaces the whole sparse map (idempotent; it is small — no
  incremental PATCH). Overlay is encrypted with the per-user DEK like the doc, is bound to
  the CURRENT plan version, and RESETS when a new version is created (missing override →
  item default qty, same as the design's `planQty` fallback). History versions stay frozen.
- **`Exercise.muscleRoles`** — optional `[{name, role: primary|secondary}]` alongside the
  existing `muscles: string[]`. Feeds the muscle-map opacities and the PRIMARY/SECONDARY
  banner tag. Program/workout parse extraction extended accordingly.

## Backend

- Flyway migration for the overlay storage (per-user, encrypted, versioned-plan-scoped).
- Parse prompt for `/parse/eating-plan` extracts per-unit micros; eval fixtures added.
- Bounds heuristic implemented server-side with unit tests (the exact rules above).
- Tests: overlay reset-on-new-version, crypto envelope (per-user DEK + AAD), idempotent PUT,
  unknown-itemId rejection (422), history remains frozen.

## App

- **Eating Plan** (`app/(main)/plan.tsx` evolution, not a rewrite): totals card per handoff
  §1 (44px/200 kcal, macro bars relative to `max(P,C,F)×1.1` headroom — never 100%), live
  micros chips summing `microsPerUnit × qty`, portion modal on the existing `PopOverlay`
  (Card A live totals + Card B editor with `min/max/step` slider), sparse `planQty` state.
  Persistence: portion change → SQLite immediately + new outbox op `portions` draining to
  `PUT /plan/portions` (offline-first; last-write-wins full map). "Done" only closes the
  modal — edits are already committed (design semantics).
- **Workout detail**: fidelity pass per handoff §2 — per-muscle opacity derived from
  `muscleRoles` (primary ≈ .92/.78, secondary ≈ .62/.30), `vtBreath` pulse on the selected
  muscle, auto-flip to the muscle's side, info banner, accent-9% exercise-row highlight;
  history rows from real entries with honest source badges; preview sheet tuned to spec
  values.
- All accent tints via `color-mix`-equivalent token derivation from the accent (vacation
  mode swaps the accent globally — handoff §3 rule).
- Product philosophy holds: `~` on every estimate, no goals/scores/streaks, calm copy,
  sources always credited.

## DevOps

Nothing structural: the Flyway migration rides the next backend image; same ECS/RDS/pipeline.
Devops validates migration + deploy + CloudWatch after rollout. No new AWS resources.

## Gates / DoD

- Backend: `./gradlew check` green incl. new overlay + heuristic tests; micros eval fixtures.
- App: tsc 0 · Jest green (+ live-math tests: totals, bar %, micros, bounds fallback) ·
  types regenerated to v0.6.0, `api:check` clean.
- Deployed to prod + fresh APK with the prod URL baked. Emulator-verified flows;
  gesture/blur feel = CEO device.

## Process

Three Fable team leads (backend / app / devops) produce per-team implementation specs in
`docs/meal-plan-handover/{backend,app,devops}-spec.md` and file extremely detailed Asana
tickets (calculations, shapes, exact design values, `Model:` line per ticket). A cross-team
consistency check runs before the CEO reviews the tickets. No implementation before that
review.
