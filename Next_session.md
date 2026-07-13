# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Keep it current at every session close. Team-level state lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-13)

**Phase 2 — Implementation, Milestone M1** (see `docs/roadmap.md`). Foundations are done and pushed to GitHub (`git@github.com:llmagalhaes/vita.git`). Nothing applied to AWS yet — but **applies are now unblocked**.

## Unblocked this round (CEO confirmations)

- ✅ Repo pushed to GitHub (CI workflows in `.github/workflows/` should be live — verify on first PR/push).
- ✅ AWS CLI = IAM user `vita-admin` (root key removed). Account `201261380352`, region pinned `eu-west-1` in Terraform (CLI default is eu-north-1, harmless).
- ✅ Cost posture: run on free-tier credits, no further budget action; CEO will cap later if needed ($40/mo AWS budget alarm already in the Terraform).

## Still blocked / deferred

- Apple Developer + Google Play accounts (CEO, later) → blocks APP-007 (store builds) and BE-007 (Google/Apple sign-in). Nothing reaches Asana "Done" (DoD = production) for app tickets until then — that's expected.
- Domain purchase (deferred) → placeholder DNS strategy in devops ADR-0009.
- Anthropic API key (zero-retention, $10/mo limit) not yet created → blocks BE-013 (parse). In `docs/ceo-setup-guide.md`.

## Next actions (in order)

1. **DevOps — first applies** (M2 chain start): dispatch `team-lead-devops` to run `devops/Doc/apply-runbook.md`: bootstrap (state bucket + budgets) → migrate state → `envs/prod-eu` (VPC, KMS, CloudTrail/GuardDuty). Rule: **show the CEO each `terraform plan`, get his OK, then apply** (runbook step 0 already satisfied — IAM confirmed).
2. **App — finish M1** (the CEO wants to test): dispatch `team-lead-app` for APP-005 (SQLite+outbox), APP-006 (API client + MSW mocks), APP-009/010 (onboarding), APP-011 (capture v2 pill, mocked parse), APP-013 (Home). Outcome: CEO runs `expo start` and walks the app with mock data.
3. **Backend — keep W1 moving**: dispatch `team-lead-backend` for BE-005 (crypto/DEK), BE-006 (magic link), BE-008 (sessions). Also: apply the app team's 2 contract edits from `app/Doc/contract-review-v0.md` (muscles enum 11 values, drafts maxItems 5) to `docs/contracts/vita-api-v0.yaml`.
4. BE-004 (first prod deploy) once OPS-008/009/013/014 exist.

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
