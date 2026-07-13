# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Keep it current at every session close. Team-level state lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-13, session 3 closed — big build-out day)

**Phase 2 — most of contract v0.3.0 implemented locally; infra applied then parked; deploy deferred to a CEO milestone.** All pushed to GitHub (HEAD `e80d2c0`).

### Snapshot
- **Backend (local, 84 tests green)**: BE-005 crypto, BE-006 magic link, BE-008 sessions, BE-009 profile, BE-010 account deletion + Postgres job queue (crypto-shred), BE-011 entries, BE-012 timeline, BE-013 parse/text, BE-014 AI guardrails (quota+metrics+eval), BE-015 plan/program parse + presigned uploads (S3 seam). Controller→service→repository for all new packages. Only local KMS/S3 seams (real impls at deploy). **All In progress on Asana — Done gated on BE-004 (prod deploy).**
- **App (local, 51 tests green, SDK 56 store-Expo-Go)**: FEATURE-COMPLETE except APP-007. Onboarding, Home, capture (text+voice), meal detail, auth+magic link, SQLite+outbox, API client, design system, i18n. Native OIDC + voice STT stubbed behind interfaces (need dev build).
- **DevOps (AWS)**: bootstrap + prod-eu applied (VPC/KMS/CloudTrail/GuardDuty/ECR/RDS/SSM/S3/OIDC-CI). API Gateway live (503, no backend). **ECS parked at desired_count=0 = $0.** Idle ~$6/mo. OPS-013/014 applied-but-deferred; BE-004 first deploy held for a milestone.

### ⚠️ Follow-up to verify
- **Claude model ids**: backend config uses `claude-haiku-4-5` (text) and `claude-sonnet-4-6` (PDF). The Sonnet id looks wrong (current is `claude-sonnet-5`). Verify both against the claude-api reference before the first LIVE parse call (no live call happens in tests/local-first, so non-blocking). In `application.yaml` `vita.ai.*`.

### Original session-2 note (kept for history)
Four commits (`eb05300` devops, `0373e0e` backend, `24ec43c` app, `f1cfd91` docs).

### Live in AWS production (eu-west-1, CEO-approved applies)
- **Bootstrap**: state bucket `vita-tfstate-201261380352` (S3 backend, native locking) + `$40/mo` budget.
- **prod-eu (30 resources)**: VPC (no NAT, DB subnets no IGW route), 2 KMS CMKs (`vita-storage`, `vita-app-data`, rotation on), CloudTrail `vita-trail` logging, GuardDuty active. IDs in `devops/Doc/bootstrap-ids.md`.
- Asana devops: **OPS-002/005/006/007 → Done**. OPS-003 In progress (CEO to eyeball the budget subscriber).

### Backend (local, tested — Done blocked on prod deploy)
- Contract **v0.2.0** (app edits applied, ADR-0010, APP-001 ack closed). BE-005 crypto (AES-256-GCM per-user DEK, blind index, crypto-shred; KMS faked behind `KeyWrapper`), BE-006 magic link, BE-008 sessions (JWT + refresh rotation). **23/23 tests green.** Asana BE-005/006/008 In progress.

### App (local, tested — Done blocked on store accounts)
- **M1 walkable mocked app**: `cd app/services/vita-app && npm install && npx expo start`. Onboarding → Home → capture pill → parse→confirm → timeline, all offline on SQLite+outbox. APP-005/006/009/010/011/013 In progress; tsc clean, Jest 23/23.
- **Expo Go fix (APP-016, done)**: store Expo Go is frozen at SDK 54; project was on SDK 57. Pinned to SDK 54 (RN 0.81.5, Reanimated 4.1 so pill+SQLite survive). CEO can now walk it on a physical phone via store Expo Go. ADR app/Doc/ADRs/ADR-0002. **Constraint: do not bump past SDK 54** until Expo publishes a newer store build or we move to dev-client/TestFlight (needs Apple/Play accounts).

## New CEO rule (Round 7)
- **Per-task model**: every Asana ticket carries a `Model:` line — Sonnet (simple) / Opus 4.8 (complex); Fable only for heavy orchestration. All 44 tickets tagged; team-lead agents pinned to `model: opus` in `.claude/agents/`.
- **Anthropic key delivered** → moved to `backend/services/vita-api/secrets.yaml` (gitignored, Spring `config.import`); never committed, no rotation needed. Unblocks BE-013 when it starts.

## Still blocked / deferred
- Apple Developer + Google Play accounts (CEO, later) → blocks APP-007 (store builds) and BE-007. Nothing reaches app "Done" until then.
- Domain purchase (deferred) → placeholder DNS (devops ADR-0009).

## Resolved in session 2 (Round 8)
- OPS-003 confirmed → **Done**. RDS backup retention → **45 days** (recorded on OPS-009). Plan/program import → contract **v0.3.0** shipped (BE-015, ADR-0011; app to review 0.3.0). Expo Go → SDK 54 (APP-016). All pushed through `897ec28`.

## Open questions for the CEO (carried)
1. Backend's plan-import design: **two endpoints** (`/parse/eating-plan` + `/parse/training-program`) vs one `/parse/plan` with a `kind` discriminator. Orchestrator recommends keeping the two as-is; CEO can override.
2. Carried: audit-log retention 400 d, exports 90 d, domain-purchase trigger.
3. Apple Developer + Play Console accounts remain the gate for any app "Done" AND for any Expo SDK past 54.

## Next actions — WAITING ON CEO DIRECTION (unblocked backlog exhausted at session 3 close)
1. **Call a deploy milestone** → resume deploy: flip `module.ecs.desired_count` to 1, backend builds+pushes the arm64 image to ECR (BE-004), Flyway migrate, verify `/health` through the API GW. Needs the CEO's manual secrets first (RDS password + 7 SSM values + 3 GitHub Variables — all in `devops/Next_session.md`).
2. **Create Apple Developer + Play Console accounts** → unblocks APP-007 (first real device build) and BE-007 (Google/Apple OIDC); turns stubbed native OIDC/voice real.
3. **Start BE-016** (deferred controller→service→repository refactor of old flat packages auth/, crypto/, shared/).
4. **Integration pass** (needs a running local backend): wire app onboarding/capture to the real endpoints instead of mocks.
5. Verify the Claude model ids (`vita.ai.*`): `claude-sonnet-4-6` looks wrong → likely `claude-sonnet-5`.

Note (superseded): SDK is now **56** not 54 (APP-016 re-pinned); the earlier "Open questions" line about the two-endpoint plan design was resolved (kept the two endpoints, BE-015 shipped).

## Operating rules quick-recall

- Orchestrator commits; **subagents never run git** (index races). Commit per team: `backend|app|devops|docs: <summary>`.
- Leads move their Asana tickets (board GIDs in `CLAUDE.md`); "To do" column = M1/M2 next-up only. Leads + orchestrator update Notion at session close (page IDs in each agent's `.claude/agents/*.md`).
- Every architecture decision → ADR. Product doubts → CEO, never invented. Chat with CEO in PT-BR; repo in English.
- Before dispatching parallel agents: they work in disjoint folders; I consolidate, commit, push.

## Key artifacts

| What | Where |
|---|---|
| Decision log (newest first) | `docs/ceo-decisions.md` |
| Roadmap M0–M8 | `docs/roadmap.md` (mirror: Notion "Milestones & Roadmap") |
| API contract v0 | `docs/contracts/vita-api-v0.yaml` (+ app review verdicts in `app/Doc/contract-review-v0.md`) |
| Apply runbook | `devops/Doc/apply-runbook.md` |
| CEO setup guide (accounts) | `docs/ceo-setup-guide.md` |
| ADRs (9 + 10) | `backend/Doc/ADRs/`, `devops/Doc/ADRs/` |
