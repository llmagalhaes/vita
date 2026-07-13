# Backend — Next session

## Current state (ADR round complete, 2026-07-13)

CEO approved the three review docs (data-protection-design, db-evaluation + db-second-opinion, kickoff-addendum) with final decisions recorded in `docs/ceo-decisions.md` (Round 3). All backend architecture decisions are now recorded as ADRs in `Doc/ADRs/`:

- **ADR-0001** — Modular monolith: Kotlin + Spring Boot 4.0.x, JDK 21, single Gradle module, flat packages
- **ADR-0002** — PostgreSQL 16 + jsonb on RDS t4g.micro (switch condition to DynamoDB recorded)
- **ADR-0003** — Field encryption (per-user KMS-wrapped DEKs, AES-256-GCM), crypto-shredding, data minimization
- **ADR-0004** — Account deletion: 7-day grace, then crypto-shred + hard delete
- **ADR-0005** — Claude API: zero-retention, no identifiers in prompts, drafts-only, model tiering, $10/mo alarm
- **ADR-0006** — Contract-first REST: OpenAPI 3.1 in `docs/contracts/`, RFC 7807, cursor pagination
- **ADR-0007** — Postgres-backed job queue (FOR UPDATE SKIP LOCKED), no SQS
- **ADR-0008** — Local device notifications, no server push, no push tokens
- **ADR-0009** — Micronutrient daily reference = FDA Daily Values

Note: ADR-0004 supersedes the "default is immediate" deletion line in `Doc/data-protection-design.md` §4 (CEO chose 7-day grace).

## Next steps

**Phase 1 specification — awaiting orchestrator go:**

1. Draft first OpenAPI contracts in `docs/contracts/`: auth (W1), entries/timeline (W2), parse (W3) — route to app team via orchestrator.
2. Create W0–W3 tickets on the backend Asana board (GID `1216519867368580`).
3. Create infra tickets from `Doc/kickoff-addendum.md` §6 on the devops board (GID `1216519867368584`) — **SES production-access request first** (AWS approval takes days). Note Round 3 #1: placeholder DNS for now (SES sandbox + verified tester emails; magic link via https redirect; nothing depends on the future domain).
4. Agree the normalized health-sample schema with the app team.

## Blockers / waiting on

- Orchestrator go for Phase 1 specification.
- DevOps: revised single-env/cost proposal (affects W0 deploy target; RDS t4g.micro per ADR-0002).
