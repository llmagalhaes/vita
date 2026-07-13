# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Keep it current at every session close. Team-level state lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-13, session 2 closed)

**Phase 2 — Implementation, M1 shipped; M2 infra chain started.** Four commits this session (`eb05300` devops, `0373e0e` backend, `24ec43c` app, `f1cfd91` docs) — **not yet pushed** (offer to the CEO next session or on request).

### Live in AWS production (eu-west-1, CEO-approved applies)
- **Bootstrap**: state bucket `vita-tfstate-201261380352` (S3 backend, native locking) + `$40/mo` budget.
- **prod-eu (30 resources)**: VPC (no NAT, DB subnets no IGW route), 2 KMS CMKs (`vita-storage`, `vita-app-data`, rotation on), CloudTrail `vita-trail` logging, GuardDuty active. IDs in `devops/Doc/bootstrap-ids.md`.
- Asana devops: **OPS-002/005/006/007 → Done**. OPS-003 In progress (CEO to eyeball the budget subscriber).

### Backend (local, tested — Done blocked on prod deploy)
- Contract **v0.2.0** (app edits applied, ADR-0010, APP-001 ack closed). BE-005 crypto (AES-256-GCM per-user DEK, blind index, crypto-shred; KMS faked behind `KeyWrapper`), BE-006 magic link, BE-008 sessions (JWT + refresh rotation). **23/23 tests green.** Asana BE-005/006/008 In progress.

### App (local, tested — Done blocked on store accounts)
- **M1 walkable mocked app**: `cd app/services/vita-app && npm install && npx expo start`. Onboarding → Home → capture pill → parse→confirm → timeline, all offline on SQLite+outbox. APP-005/006/009/010/011/013 In progress; tsc clean, Jest 23/23.

## New CEO rule (Round 7)
- **Per-task model**: every Asana ticket carries a `Model:` line — Sonnet (simple) / Opus 4.8 (complex); Fable only for heavy orchestration. All 44 tickets tagged; team-lead agents pinned to `model: opus` in `.claude/agents/`.
- **Anthropic key delivered** → moved to `backend/services/vita-api/secrets.yaml` (gitignored, Spring `config.import`); never committed, no rotation needed. Unblocks BE-013 when it starts.

## Still blocked / deferred
- Apple Developer + Google Play accounts (CEO, later) → blocks APP-007 (store builds) and BE-007. Nothing reaches app "Done" until then.
- Domain purchase (deferred) → placeholder DNS (devops ADR-0009).

## Open questions for the CEO (carried)
1. **OPS-003**: confirm `vita-monthly-total` shows your email as subscriber (Billing → Budgets).
2. **RDS backup retention (OPS-009)**: devops says 14 d + cross-account copy; backend asked 35 d. Pick one before OPS-009.
3. Carried: audit-log retention 400 d, exports 90 d, domain-purchase trigger.

## Next actions (in order)
1. **DevOps — OPS-004** (GitHub OIDC plan-only CI + CEO-gated apply), then the OPS-008/009/010/011/013/014 chain that unblocks BE-004 (first prod deploy). Same rule: CEO approves every plan before apply.
2. **Backend — BE-009 (`/v1/me`) + BE-011 (entries)** against contract v0.2.0. Also: app flagged the contract has **no plan/program parse-import endpoint** (onboarding steps 3–4 mock it client-side) — spec it if the CEO wants those steps to round-trip.
3. **App — APP-008** (auth screens/deep link) once backend magic-link URL format is handed over; APP-012 (voice), APP-014 (meal detail) as waves allow.
4. Push the 4 local commits to GitHub when the CEO is ready.

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
