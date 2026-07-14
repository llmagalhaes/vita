# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Team-level detail lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-14, session 3 closed — full build-out day)

**Phase 2 — Implementation.** Almost all of contract **v0.3.0** is built and tested LOCALLY. The app↔backend core loop is **proven end-to-end against the real backend** (real Postgres). AWS infra is fully applied but **parked at $0** (ECS off). **No production deploy yet** — CEO policy: local-first, deploy only at a called milestone. Everything pushed to GitHub, HEAD `fe6f4c9`. Working tree clean.

### The autonomous backlog is EXHAUSTED. Everything remaining is gated on a CEO decision (see "Next actions").

## Snapshot by team

### Backend — local, `./gradlew check` = 84 tests green
All In progress on Asana (Done = production, gated on BE-004 deploy). Packages all follow **controller→service→repository** (BE-016 refactor done, ADR-0012 supersedes ADR-0001).
- BE-005 crypto (AES-256-GCM per-user DEK, blind index, crypto-shred; KMS behind `KeyWrapper` seam)
- BE-006 magic link · BE-008 sessions (JWT + refresh rotation, family revoke)
- BE-009 profile `/me` · BE-010 account deletion (7d grace + Postgres job queue + crypto-shred job)
- BE-011 entries (idempotent write) · BE-012 timeline (keyset pagination, tz day filter)
- BE-013 parse/text (Claude, tool-forced, nothing persisted) · BE-014 AI guardrails (per-user quota 429, token/cost Micrometer metrics, eval fixtures)
- BE-015 plan/program parse + `POST /uploads` presigned (S3 behind `FileStore` seam)
- Local seams (LocalKeyWrapper, LocalFileStore, LogMailer) swap for real AWS at deploy.
- **Done (deploy) gated on BE-004**; real Claude for text confirmed working (`claude-haiku-4-5`).

### App — local, Jest 51 green, Expo SDK 56 (store-Expo-Go compatible)
FEATURE-COMPLETE except APP-007. All tickets done: onboarding (APP-009/010), Home (APP-013), capture text+voice (APP-011/012), meal detail (APP-014), auth+magic link (APP-008), SQLite+outbox (APP-005), generated API client (APP-006), design system (APP-003), i18n (APP-004), SDK pin (APP-016).
- Native OIDC (Google/Apple) and voice STT are **stubbed behind interfaces** — need a dev build (APP-007) to become real.
- **Run walkable (mocks):** `cd app/services/vita-app && npm install && npx expo start`.
- **Run against local backend (real E2E):** start backend (below), then `VITA_API_BASE_URL=http://<Mac-LAN-IP>:8080/v1 npx expo start` (base URL MUST include `/v1`; iOS sim = localhost, Android emu = 10.0.2.2). Unset the var → mock mode (test default).

### DevOps — AWS eu-west-1, all applied, parked at ~$6/mo idle
- Applied & running: VPC/subnets/SGs, 2 KMS CMKs, CloudTrail, GuardDuty, audit bucket, ECR `vita-api`, RDS `vita` (encrypted/private/force_ssl, 45d backups via AWS Backup vault), 7 SSM SecureStrings (placeholders), S3 uploads/exports, OIDC CI roles + PR/main/apply workflows.
- **API Gateway live**: `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/` (503, no backend).
- **ECS parked at `module.ecs.desired_count = 0` = Fargate $0.** RDS free-tier $0, left running.
- Done: OPS-002/003/005/006/007/008/011. In progress (applied, deferred verify): OPS-013/014. Backlog: OPS-012 (SES), OPS-015 (observability/AMP), OPS-016 (magic-link redirect), OPS-017 (quarterly RDS restore rehearsal).

## Proven this session (integration milestone)
The real app client drove the real local backend: magic-link sign-in → parse/text (1 real Haiku call) → confirm → `POST /entries` (idempotency 201/200-replay) → `GET /entries` timeline with server-computed totals, persisted in real Postgres → `GET/PATCH /me`. **Zero contract drift** — generated types (v0.3.0) matched real responses exactly. Recipe in `app/Progress/APP-INTEGRATION-local-e2e-Progress.md`; dev harness `npm run integration:smoke`.

## ⚠️ Follow-up to verify (non-blocking)
- **Claude PDF model id**: `application.yaml` `vita.ai.plan-pdf-model = claude-sonnet-4-6` looks wrong (current Sonnet is `claude-sonnet-5`). Verify via the claude-api reference before the first live PDF parse. The text model `claude-haiku-4-5` is confirmed working.

## Next actions — WAITING ON CEO DIRECTION (nothing autonomous left)
1. **Call a deploy milestone** → resume the chain: flip `module.ecs.desired_count`→1, backend builds+pushes the arm64 image (Dockerfile ready) to ECR (BE-004), Flyway migrate, verify `/health` through the API GW. **Requires the CEO's manual secrets first** — all listed in `devops/Next_session.md`:
   - RDS master password (console) + paste into `/vita/prod/db-credentials`
   - 7 SSM SecureString values (currently `REPLACE_ME_IN_CONSOLE`)
   - 3 GitHub repo Variables: `AWS_PLAN_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-plan`, `AWS_APPLY_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-apply`, `AWS_REGION=eu-west-1`
2. **Create Apple Developer + Play Console accounts** → unblocks APP-007 (first real device build) and BE-007 (Google/Apple OIDC); turns stubbed native OIDC/voice real.
3. **BE-007** (OIDC sign-in) — blocked on #2. Only major backend ticket not yet built.
4. Verify the PDF model id (above) whenever the plan-import goes live.

## Operating rules quick-recall
- Orchestrator commits; **subagents never run git** (index races). Commit per team: `backend|app|devops|docs: <summary>`. Push uses `gh` HTTPS token (SSH key not in this env): `git push https://github.com/llmagalhaes/vita.git HEAD:main`.
- **Per-task model (Round 7)**: every Asana ticket carries `Model:` (Sonnet simple / Opus 4.8 complex / Fable heavy-orchestration). Team-lead agents pinned `model: opus` in `.claude/agents/`.
- Same-team parallel agents → use `isolation: worktree` (disjoint packages), then merge with a real `./gradlew check` before commit. Cross-team agents → disjoint folders, commit separately.
- Every architecture decision → ADR. Product doubts → CEO, never invented. Chat with CEO in PT-BR; repo in English.
- Anthropic key lives in `backend/services/vita-api/secrets.yaml` (gitignored). Never commit real secrets.

## Key artifacts
| What | Where |
|---|---|
| Decision log (newest first) | `docs/ceo-decisions.md` |
| Roadmap M0–M8 | `docs/roadmap.md` |
| API contract v0.3.0 | `docs/contracts/vita-api-v0.yaml` |
| Apply runbook / infra ids | `devops/Doc/apply-runbook.md`, `devops/Doc/bootstrap-ids.md` |
| CEO setup guide (accounts/secrets) | `docs/ceo-setup-guide.md` |
| ADRs | `backend/Doc/ADRs/` (0001–0012), `devops/Doc/ADRs/`, `app/Doc/ADRs/` (0001–0003) |
| Local-backend leftover | bootRun + docker-compose Postgres were left up during integration; stop with `docker compose down` in `backend/services/vita-api` + kill the bootRun. (Orchestrator tears these down at session close.) |
