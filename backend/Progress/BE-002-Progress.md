# BE-002 — Flyway baseline + local compose environment

Asana: https://app.asana.com/0/1216519867368580/1216519895416480

## 2026-07-13

- Flyway wired via Boot 4's `spring-boot-starter-flyway` + `flyway-database-postgresql` (Boot 4 gotcha: flyway autoconfig moved out of spring-boot-autoconfigure into its own starter — without it migrations silently don't run).
- `V001__baseline.sql`: `users` (email HMAC blind index + encrypted email/name, units, 7-day-grace column), `user_keys` (per-user KMS-wrapped DEK in its own row → deleting it = crypto-shred, ADR-0003), `log_entry` (timeline spine: C1 enums/checks matching the contract vocabularies, C2 plaintext numeric columns for SQL aggregation, C3 `detail_enc`/`source_phrase_enc` bytea blobs, idempotency key pair with `UNIQUE (user_id, idempotency_key)`, timeline index). Every column commented with its ADR-0003 class. Deliberately minimal — only what BE-005/006/011 need.
- `docker-compose.yml`: Postgres 16-alpine, vita/vita/vita. WireMock (Claude/SES stubs) deferred to BE-005/BE-008 per session scope.
- `README.md`: exact local loop, test/lint commands, **expand/contract migration rule documented** + C1/C2/C3 comment requirement.
- Tests added to SmokeTest: migration-applied assertion + **ADR-0003 enforcement test** (every `*_enc` column must be bytea; exact expected list).
- **Verified**: `./gradlew check` green (7/7 tests); full local loop exercised for real — `docker compose up -d` → `bootRun` (Flyway applied V001 against compose Postgres, checked via psql) → `/health` 200 → `/v1/me` 401 problem+json → compose down.

Status: code complete; In progress (Done = in production, blocked on BE-004/devops).
