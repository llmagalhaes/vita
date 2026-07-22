# BE-036 — Contract v0.6.0 + ADR-0017 — Progress

Asana: https://app.asana.com/0/1216519867368580/1216780755098294
Status: **executed 2026-07-22** (backend lead, Fable). Done = in production — rides the
BE-041 image + OPS-024 Terraform deploy.

## What shipped (2026-07-22)

- `docs/contracts/vita-api-v0.yaml` **0.5.0 → 0.6.0, purely additive**:
  - `PlanItem` + optional `id` (it-N, save-time only — no backfill, CEO A2),
    `microsPerUnit`, `portion`.
  - New schemas: `MicrosPerUnit`, `PortionBounds` (deterministic heuristic in the
    description), `PortionsMap` (maxProperties 200; CEO A5 edit semantics in the
    description), `EatingPlanWithPortions` (allOf — same wire object, not a wrapper).
  - `GET /plan` 200 → `EatingPlanWithPortions`; POST/PUT echoes + history unchanged.
  - New `PUT /plan/portions` (200 clamped echo / 400 / 401 / 404 / 422 whole-reject).
  - `Exercise.muscleRoles` (11-muscle enum × primary|secondary; covers capture + program).
  - Verified: `npx @redocly/cli lint` → valid, 0 errors (only pre-existing
    operationId style warnings shared by every path in the file).
- `backend/Doc/ADRs/ADR-0017-contract-v0.6.0-portions-micros-muscle-roles.md`
  (next free number after ADR-0016 — verified against the ADR dir).

## Same session: CEO amendments A1–A9 (2026-07-22) baked into the round

- `docs/meal-plan-handover/backend-spec.md` rewritten to the simplified truth:
  A1 portions **plaintext jsonb** (no DEK/AAD/shred; FK cascade cleans), A2 **no
  backfill** (§2 rewritten; reads return stored bytes; id-less pre-0.6.0 docs 422 on
  portions until re-import/re-save), A4 handoff table = golden **test fixture only**
  (§5.3/§7), A5 edit semantics (§4.4: untouched keep / edited reset / removed pruned).
  §10: **no open CEO questions** (old Q1 answered by A5).
- Asana notes rewritten for BE-037 (renamed: save-only, no backfill), BE-038 (renamed:
  plaintext jsonb; A5 rules; no crypto tests), BE-039 (A4 fixture rule + §5.4
  observability), BE-036 (status + amendment header). BE-040/BE-041 checked — clean.

## Remaining for this ticket

Orchestrator commits the contract + ADR + spec; app team regens types to v0.6.0
(ADR-0006 loop); ticket goes Done with the BE-041/OPS-024 production rollout.
