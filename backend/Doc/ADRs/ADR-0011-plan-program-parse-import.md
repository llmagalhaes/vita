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
