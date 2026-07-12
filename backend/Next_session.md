# Backend — Next session

## Current state (Phase 0 — Kickoff, 2026-07-12)

- Team folder structure created (`Backlog/` + `Wip/` + `Done/`, `Progress/`, `Doc/ADRs/`, `services/`).
- **`Doc/kickoff-proposal.md` written — awaiting CEO review.** Key proposals:
  - Modular monolith, Spring Boot 3 (Kotlin, JDK 21), PostgreSQL + Flyway, Spring Data JDBC.
  - REST/JSON, OpenAPI contract-first in `docs/contracts/`; RFC 7807 errors.
  - Product AI: Claude API, stateless parse endpoints returning drafts; confirmation-before-commit is structural (AI never writes to the log). Haiku-class for text, Sonnet-class for photo/PDF, prompt caching, tool-forced structured output.
  - Auth: magic link (SES) + Google/Apple id-token verification; backend JWT (15 min) + rotated refresh tokens.
  - Health: v1 device pushes normalized samples (`POST /v1/health/samples`, idempotent dedupe); v2 providers reuse the same ingestion seam via server-side OAuth sync workers.
  - QA: JUnit 5 + MockK, Testcontainers Postgres, WireMock for Claude/SES, OpenAPI validation inside integration tests, AI eval fixture set.
  - Delivery waves W0–W9 (skeleton → auth → log → AI capture → photo/PDF import → habits → health ingestion → trends → vacation/export → hardening).
- No code, no tickets, no ADRs yet (correct for Phase 0). Nothing committed by this session (orchestrator commits).

## Next steps (Phase 1 — after CEO approves the proposal)

1. Convert waves W0–W3 epics into `BE-NNN` tickets in `Backlog/`.
2. Write ADR-001 (architecture: modular monolith + Spring Boot) and ADR-002 (auth design) from the approved proposal.
3. Draft first OpenAPI contracts in `docs/contracts/`: auth, entries/timeline, parse — route to app team via orchestrator.
4. Agree the normalized health-sample schema with the app team; the notification approach (local vs push) with app + CEO answer to Q1.
5. Sync with DevOps on dev environment, RDS, SES domain, Secrets Manager (blocks W0 completion).

## Blockers / waiting on

- CEO review of `Doc/kickoff-proposal.md` (incl. its 8 questions).
- App team kickoff proposal (stack choice affects nothing backend-side, but the contract workflow and health-sample schema need their counterpart).
- DevOps kickoff proposal (environments/CI shape).
