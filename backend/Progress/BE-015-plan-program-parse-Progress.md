# BE-015 — Plan/program parse-import (contract only)

Asana: [BE-015](https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216527239662250) — Backlog. Contract-only slice done this session; Kotlin impl is a later slice of the same ticket.

## Scope this session

Contract-only, no Kotlin (CEO Round 8 #3). Spec the endpoint(s) covering
onboarding steps 3–4 so the app can drop its client-side mock read-back.

## Done

- `docs/contracts/vita-api-v0.yaml` bumped **0.2.0 → 0.3.0**. Added:
  - `POST /parse/eating-plan`, `POST /parse/training-program` — synchronous,
    drafts-not-saved (ADR-0005 pattern), shared `PlanImportRequest` (one of
    `text` / `fileRef`), returning `EatingPlanDraft` / `TrainingProgramDraft`.
  - `POST /uploads` — presigned S3 PUT + opaque `fileRef`; PDF bytes bypass the
    JSON body (API Gateway 10 MB cap, OPS-011).
  - New schemas: `PlanImportRequest`, `EatingPlanDraft`, `PlanMeal`, `PlanItem`,
    `TrainingProgramDraft`, `ProgramDay`. Reuses `MacroTotals`, `Micro`,
    `Exercise`. New `uploads` tag.
- **ADR-0011** written (two-endpoints rationale; synchronous supersedes the
  async import-job sketch; app-notification + devops S3 dependency noted).
- Contract-review heads-up appended to `app/Doc/contract-review-v0.md` for the
  app team.
- redocly lint **exit 0** (25 warnings — all the same cosmetic
  operationId/tag-description/license ones the team already accepted; +4 vs
  0.2.0 are just the new operations/tag).

## Not done (deliberately)

- Kotlin impl (parse pipeline, PDF read, tool schemas, daily ceiling, evals) —
  later ticket, sibling of BE-013.
- Plan-create / program-create endpoints (the Confirm target) — W4.

## Dependencies raised

- **Devops (OPS-011)**: S3 bucket for plan-document uploads with presigned PUT
  + short lifecycle expiry. Confirm it's in the devops backlog.
- **App team**: review the 0.3.0 heads-up (orchestrator relays).
