# Backend — Next session

## Current state (Post-kickoff CEO directives round, 2026-07-13)

Phase 0 kickoff proposal was reviewed; CEO directives (`docs/ceo-decisions.md`, 2026-07-13 items 3, 4, 7, 8) answered with three new docs — all awaiting CEO/orchestrator review:

- **`Doc/data-protection-design.md`** — data classification C1/C2/C3 per entity; minimization decisions (no photos persisted, no voice audio, no GPS, no push tokens, cycle = latest phase only, PDFs deleted after confirm); KMS envelope encryption with per-user DEKs (AES-256-GCM, blind-index for email lookup, crypto-shredding on account delete); plaintext kept only for the numeric/enum columns trends aggregates (the C2/C3 trade-off is documented); retention table + deletion flow.
- **`Doc/db-evaluation.md`** — position paper vs a document store (CEO provocation). Recommendation: **PostgreSQL 16 + jsonb on RDS t4g.micro single-AZ (~$12–15/mo, down-sized from Aurora)**; DynamoDB/Mongo/DocumentDB evaluated against access patterns P1–P10; trends aggregations + job queue + Testcontainers fidelity decide it. A counter-review by an independent agent is expected — the orchestrator brokers the debate; my fallback line is in §5 (revisit trigger) and the collapse condition for my own argument is stated at the end.
- **`Doc/kickoff-addendum.md`** — **Spring Boot 4.0.x adopted** (3.5 OSS support ended 2026-06; validate ecosystem in W0, fallback to 3.5 pin is one line); architecture simplified to one Gradle module + plain packages (no onion/hexagonal, per CEO); local device notifications (no push infra, no device tokens); single-prod-env discipline (expand/contract migrations only, config-property feature flags, smoke test gates Done); i18n via resource bundles for emails + export PDFs; **infra request list §6 for devops Asana tickets (SES production access first — takes days)**.

Notes for next session: tickets now live in **Asana** (repo `Backlog/` retired — the old folders were already removed from `backend/`); Notion team page must be updated at session close (this session produced docs only; orchestrator commits and relays).

## Next steps

1. **Await CEO verdict** on the three docs + the DB debate outcome (counter-review pending).
2. Once approved: write **ADR-001** (Postgres + jsonb + one-module architecture, from db-evaluation + addendum §2), **ADR-002** (auth, from kickoff §6), **ADR-003** (field encryption, from data-protection-design §3).
3. Create W0–W3 tickets on the **backend Asana board** (GID `1216519867368580`); create the infra tickets from addendum §6 on the **devops board** (GID `1216519867368584`) — SES production-access request first.
4. Draft first OpenAPI contracts in `docs/contracts/`: auth, entries/timeline, parse — route to app team via orchestrator.
5. Agree the normalized health-sample schema with the app team.

## Blockers / waiting on

- CEO review of the three new docs; DB counter-review + brokered decision.
- Open CEO questions (consolidated in `Doc/kickoff-addendum.md` §7): export PDF branding, cycle minimal-storage confirmation, micronutrient reference set, deletion grace period, AI cost envelope, Anthropic zero-data-retention.
- DevOps: revised single-env/cost proposal (affects W0 deploy target and the RDS down-size to t4g.micro).
