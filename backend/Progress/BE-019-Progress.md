# BE-019 — Eating plan: persisted, versioned, editable (contract v0.4.0 + ADR-0011 ext)

Asana: Vita backend board (`1216519867368580`), ticket BE-019.
Slice 3 "F4/F5 Plan + program: persisted, history, editable". Backlog D5.

## What / why

The parse endpoints (BE-015) only returned a draft; this ticket persists the
confirmed eating plan as **versioned, encrypted rows** and adds create / read /
edit / history endpoints. Same "encrypt the words" envelope as log entries.

- Table `eating_plan (id, user_id, doc_enc, created_at)` — `doc_enc` is the whole
  `EatingPlanDraft` as one AES-256-GCM blob under the **per-user DEK**, AAD-bound
  to the user (ADR-0003). Nothing denormalized — a plan is never
  server-aggregated, so every field stays inside the encrypted blob.
- `POST /v1/plan` → new version; `trim` caps history at `vita.plans.history-max`
  (default 5), dropping the oldest. 201 + stored doc.
- `GET /v1/plan` → current (newest) version; 404 if none.
- `PUT /v1/plan` → **edit current: full-doc replace + whole-blob re-encrypt in the
  service** (D5 — no plaintext server-side merge-patch on the jsonb). Updates the
  newest row in place, not a new version; 404 if none.
- `GET /v1/plan/history` → the ≤5 stored versions `{id, createdAt, doc}`, newest
  first. Frozen — no restore in v0.

## Design (ponytail)

- One `PlanRepository` (blob-only, table-parameterized by a fixed `PlanTable`
  enum → injection-safe), one `PlanService` (JsonNode-based, type-agnostic),
  one `PlanController` — BE-020 (training program) is the mechanical mirror on the
  same engine, not a duplicate class tree. Reuses `EatingPlanDraft` /
  `TrainingProgramDraft` schemas verbatim as request + response bodies.
- Controller validates the contract minimums (summary non-blank, ≥1 meal, each
  meal ≥1 item) → 400, so a bad edit can't store junk.

## Crypto-at-rest + deletion cascade (the parts NOT cut)

- `PlanFlowTest.plan doc is encrypted at rest` reads raw `doc_enc` bytes and
  asserts the plaintext summary + item name are absent from the blob.
- FK `user_id … ON DELETE CASCADE` + `CryptoService.shred` (DEK delete): the
  account-deletion `purge` path shreds the DEK (blob unreadable even in backups)
  then `DELETE FROM users` cascades the rows. Verified by
  `PlanFlowTest.account purge shreds the DEK and cascades the plan rows`.
- `SmokeTest` now enumerates `eating_plan.doc_enc` + `training_program.doc_enc`
  among the bytea C3 columns (the exhaustive "no plaintext C3 column" guard).

## Files

- `services/vita-api/src/main/resources/db/migration/V004__plans.sql` (both tables — shared with BE-020)
- `services/vita-api/src/main/kotlin/com/llmagal/vita/plans/repository/PlanRepository.kt`
- `services/vita-api/src/main/kotlin/com/llmagal/vita/plans/service/PlanService.kt`
- `services/vita-api/src/main/kotlin/com/llmagal/vita/plans/controller/PlanController.kt` (+ `PlanVersion.kt`)
- `services/vita-api/src/main/resources/application.yaml` — `vita.plans.history-max`
- `docs/contracts/vita-api-v0.yaml` — /plan, /plan/history, /program, /program/history (+ PlanVersion/ProgramVersion)
- `Doc/ADRs/ADR-0011-plan-program-parse-import.md` — extension section
- Tests: `plans/PlanFlowTest.kt` (10), `plans/ProgramFlowTest.kt` (3), `SmokeTest.kt` (updated)

## Verified

- `./gradlew check` green — **106 tests** (was 93; +10 PlanFlowTest, +3 ProgramFlowTest).
- detekt + ktlint clean; redocly lint exit 0 (34 pre-existing cosmetic operationId/tag warnings).

## Contract paths added (for the slice-3 app agent)

- `GET /v1/plan` → 200 `EatingPlanDraft` | 404 (no plan yet)
- `POST /v1/plan` (body `EatingPlanDraft`) → 201 `EatingPlanDraft` | 400
- `PUT /v1/plan` (body `EatingPlanDraft`) → 200 `EatingPlanDraft` | 400 | 404
- `GET /v1/plan/history` → 200 `PlanVersion[]` (`{id, createdAt, doc: EatingPlanDraft}`, newest first, ≤5)
- (program mirror in BE-020: `/v1/program`, `/v1/program/history` with `TrainingProgramDraft` / `ProgramVersion`)

## Follow-up

- History has no restore in v0 (versions frozen). A "previous plans" picker is a
  small app follow-up (APP-022 notes it as out of scope).
