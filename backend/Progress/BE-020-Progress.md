# BE-020 — Training program: persisted, versioned, editable (mechanical mirror of BE-019)

Asana: Vita backend board (`1216519867368580`), ticket BE-020.
Slice 3 "F4/F5 Plan + program". Backlog D5. Mirror of BE-019 — same migration,
same ADR, same shapes.

## What / why

The training program is the structural twin of the eating plan: versioned
encrypted docs differing only in table, path and draft type. Rather than a
duplicate class tree, it rides the **same** `PlanRepository` / `PlanService` /
`PlanController` built in BE-019, parameterized by `PlanTable.TRAINING_PROGRAM`
and bodied with `TrainingProgramDraft`.

- Table `training_program (id, user_id, doc_enc, created_at)` — **same migration
  file** `V004__plans.sql` as the eating plan. `doc_enc` = whole
  `TrainingProgramDraft` blob under the per-user DEK (ADR-0003).
- `POST /v1/program` → new version (cap `vita.plans.history-max`, oldest dropped).
- `GET /v1/program` → current; 404 if none.
- `PUT /v1/program` → edit current (full-doc replace + re-encrypt); 404 if none.
- `GET /v1/program/history` → ≤5 `ProgramVersion[]`, newest first (frozen).
- Controller validation: summary non-blank, ≥1 day → 400.

## Verified

- Covered by `plans/ProgramFlowTest.kt` (3): import/version/edit-in-place +
  read-back, empty-program 400 + auth 401, doc encrypted at rest. The exhaustive
  engine cases (cap, cascade, 404s) live in `PlanFlowTest` — the program shares
  the same code path, so the mirror test confirms parity without re-deriving.
- Deletion cascade: `training_program.doc_enc` in `SmokeTest`'s bytea C3 column
  set; FK `ON DELETE CASCADE` + crypto-shred same as the eating plan.
- `./gradlew check` green (106 tests total); detekt/ktlint clean; redocly exit 0.

## Contract paths added (for the slice-3 app agent)

- `GET /v1/program` → 200 `TrainingProgramDraft` | 404
- `POST /v1/program` (body `TrainingProgramDraft`) → 201 `TrainingProgramDraft` | 400
- `PUT /v1/program` (body `TrainingProgramDraft`) → 200 `TrainingProgramDraft` | 400 | 404
- `GET /v1/program/history` → 200 `ProgramVersion[]` (`{id, createdAt, doc: TrainingProgramDraft}`)

## Files

Shares all of BE-019's files (no new source file — the mirror is data, not code).
Test-only addition: `services/vita-api/src/test/kotlin/com/llmagal/vita/plans/ProgramFlowTest.kt`.
