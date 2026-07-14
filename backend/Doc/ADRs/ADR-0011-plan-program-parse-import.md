# ADR-0011 — Plan/program parse-import endpoints (contract 0.2.0 → 0.3.0)

**Status:** Accepted — 2026-07-13 (CEO decisions Round 8 #3)

## Context

Onboarding steps 3–4 (eating plan, training program) let the user describe a
plan in words or import a nutritionist/coach PDF; the app then shows an AI
read-back summary the user confirms. v0.2.0 had no endpoint for this — the app
mocked the summary client-side (flagged by the app team). CEO approved
speccing it now, contract-only, no implementation this session.

ADR-0006 requires an ADR + app notification for any contract change. This is a
cross-team change → the orchestrator must relay it to the app team.

## Decision

Applied in version 0.3.0. Three endpoints added:

- **`POST /v1/parse/eating-plan`** and **`POST /v1/parse/training-program`** —
  two endpoints, not one. Same "AI proposes, user confirms" pattern as
  `/parse/text` (ADR-0005): stateless, tool-forced structured output, **nothing
  persisted server-side on the parse call**, all numbers labeled estimate. Each
  takes a shared `PlanImportRequest` = exactly one of `text` (described/pasted,
  ≤8000 chars) or `fileRef` (a reference to a PDF uploaded via `/uploads`).
  Response is a domain draft (`EatingPlanDraft` / `TrainingProgramDraft`) with a
  human-readable `summary` for the confirmation read-back plus the structured
  shape the Eating Plan / program screens render. Reuses existing schemas
  (`MacroTotals`, `Micro`, `Exercise`).
- **`POST /v1/uploads`** — vends a short-lived presigned S3 PUT URL + opaque
  `fileRef`. PDF bytes go **direct to S3, never through the JSON body**
  (API Gateway 10 MB cap, OPS-011 / devops ADR-0005). The backend reads the
  object server-side for the one parse call and does not persist it beyond that
  (ADR-0005 zero-retention); the bucket lifecycle-expires uploads.

### Why two parse endpoints, not one discriminated endpoint

The onboarding UI already knows which it is asking for (step 3 vs step 4) and
the two outputs are genuinely different domain objects. A single endpoint would
force a redundant `kind` discriminator plus a `oneOf` response the caller
doesn't need — redundant complexity. Two endpoints sharing one request schema
is the smaller, clearer shape on both sides. (Contrast capture `/parse/text`,
which *is* one endpoint with a `oneOf` because a single utterance can yield
mixed meal/water/workout types the caller can't predict.)

### Synchronous, superseding the async import-job sketch

The kickoff proposal sketched `POST /v1/imports` → 202 + job id → poll for
plan/PDF import. This ADR chooses a **synchronous** parse (single Claude call,
native PDF input, no OCR stack of ours) to match the capture-parse pattern the
CEO asked for and to avoid the `import_job` table + polling for ~5 users. A
nutritionist PDF is a few pages → one tool-forced call, well inside API
Gateway's 29 s ceiling. If a plan ever exceeds that, the app falls back to
manual entry exactly like the other parse endpoints. No `import_job` rows in v0.

## Consequences

- **App team must be notified** (orchestrator relays): three new endpoints, new
  two-phase upload flow for PDFs, new draft schemas the onboarding read-back
  binds to. Contract-review note in `app/Doc/` requested.
- **Devops dependency**: an S3 bucket for plan-document uploads with presigned
  PUT + short lifecycle expiry (OPS-011). Ticket in the devops backlog if not
  already covered.
- The confirmed draft is shaped to be the create payload, but the
  **plan-create / program-create endpoints are out of scope here** (later W4
  ticket) — this session specs parse + upload only.
- Implementation (a BE-013-sibling ticket) owns the tool schemas, the PDF-read
  path, the per-user daily parse ceiling, and the eval fixtures.
- redocly lint stays green (exit 0); the new endpoints carry the same cosmetic
  operationId/tag-description warnings as the rest of the contract.

## Open question for the CEO

Two endpoints vs one is a defensible design pick, not a CEO decision — flagged
for awareness only. No blocker.

---

## Extension — persist, version, edit (BE-019 / BE-020, contract 0.4.0)

**Status:** Accepted — 2026-07-14 (CEO decisions Round 10 §2/§3, backlog D5).

The parse endpoints above return a draft the user confirms; this extension adds
the **create/read/edit** endpoints deferred as "a later W4 ticket". Applied in
contract 0.4.0 (additive — no 0.3.0 consumer breaks).

### Storage

Two tables (`V004__plans.sql`), one shape each: `(id, user_id, doc_enc,
created_at)`. `doc_enc` is the **whole confirmed draft** (`EatingPlanDraft` /
`TrainingProgramDraft`) as a single AES-256-GCM blob under the **per-user DEK**,
AAD-bound to the user — the identical envelope as `log_entry.detail_enc`
(ADR-0003). **Nothing is denormalized**: unlike log entries (whose C2 numbers are
plaintext so trends can `GROUP BY`), a plan is never server-aggregated, so every
field stays inside the encrypted blob and is unreadable server-side.

### Versioning, history, edit

- **`POST /plan` | `/program`** — appends a **new version** row. History is
  capped at `vita.plans.history-max` (default **5**); the insert is followed by a
  `trim` that deletes everything older than the newest N. Returns **201** with
  the stored doc.
- **`GET /plan` | `/program`** — the **current** (newest by `created_at, id`)
  version. **404** if the user has none yet.
- **`PUT /plan` | `/program`** — **edit current: full-doc replace + whole-blob
  re-encrypt in the service** (D5). The client sends the entire edited document;
  the service serializes it, encrypts it fresh, and `UPDATE`s the newest row's
  `doc_enc` in place. It does **not** create a new version, and there is
  **deliberately no plaintext server-side merge-patch on the jsonb** — the
  encryption boundary means the server can't (and won't) reach inside the blob to
  patch a field. **404** if there is no current version to edit.
- **`GET /plan/history` | `/program/history`** — the ≤N stored versions, newest
  first, each `{id, createdAt, doc}`. **Past versions are frozen — no restore in
  v0** (the app renders history read-only; a "previous plans" picker is a later
  app follow-up).

### Deletion cascade

Both tables carry `user_id … REFERENCES users(id) ON DELETE CASCADE`, so account
deletion (ADR-0004) removes their rows with the `DELETE FROM users`; and because
the docs are encrypted under the per-user DEK, `CryptoService.shred` renders any
surviving blob (e.g. in a backup) permanently unreadable **before** the rows are
dropped. Verified end-to-end by `PlanFlowTest.account purge shreds the DEK and
cascades the plan rows`, and `SmokeTest` now enumerates `eating_plan.doc_enc` /
`training_program.doc_enc` among the bytea C3 columns.

### Why one controller/service/repository for both

The eating plan and training program are structurally identical (versioned
encrypted docs differing only in table, path and draft type). BE-020 is a
**mechanical mirror**, so rather than a duplicate class tree they share one
`PlanRepository` (table-parameterized by a fixed `PlanTable` enum — injection-safe),
one `PlanService` (JsonNode-based, type-agnostic), and one `PlanController` (four
endpoints per resource). The draft schemas (`EatingPlanDraft` /
`TrainingProgramDraft`) are reused verbatim as request and response bodies.

### Consequences (extension)

- **App team notified** (orchestrator relays): eight new paths under tags
  `plans`. The slice-3 app tickets (APP-021/022/023) consume them; the confirmed
  parse draft is POSTed as-is, and the edit screen PUTs the whole edited doc.
- No new infra: reuses the existing per-user DEK and Postgres. No devops
  dependency (contrast the upload path).
- `history-max` is config, not a magic number — LocalStack/prod can tune it.
