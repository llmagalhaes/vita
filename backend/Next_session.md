# Backend — Next session

## Current state (Phase 2 first implementation session, 2026-07-13)

- **W0 code complete: BE-001, BE-002, BE-003** — all three In progress on Asana (Done requires production, blocked on BE-004/devops). Details in `Progress/BE-00{1,2,3}-Progress.md`.
- `services/vita-api/` exists and runs: Kotlin 2.2.21, **Spring Boot 4.0.7** (no 3.5.x fallback needed), Gradle 9.6.1 wrapper, JDK 21 toolchain. Flat packages per ADR-0001: `auth/` (SecurityConfig, JwtAuthFilter stub — extracts bearer, validates nothing yet), `users/` (MeController 401 proof), `shared/` (GET /health with SELECT 1). 401 = RFC 7807 problem+json.
- Flyway `V001__baseline.sql`: `users`, `user_keys` (wrapped DEK row = crypto-shred target), `log_entry` (C2 plaintext numbers + C3 `*_enc` bytea + idempotency pair). docker-compose (Postgres 16) + README with the local loop. SmokeTest asserts migrations applied and every `*_enc` column is bytea (ADR-0003 enforcement).
- CI: `.github/workflows/backend-ci.yml` (`./gradlew check`) + `contract-lint.yml` (redocly). No GitHub remote yet — they activate on first push. Contract lints valid with 21 cosmetic warnings (missing operationIds); left untouched pending app review.
- **Verified this session**: `./gradlew check` green (7/7 tests incl. Testcontainers), full local loop (compose up → bootRun → Flyway applied → /health 200 → /v1/me 401 → compose down), redocly exit 0.

### Boot 4 gotchas (save yourself an hour)

- Canonical web starter is `spring-boot-starter-webmvc`; Flyway autoconfig now needs `spring-boot-starter-flyway`.
- Testcontainers versions no longer BOM-managed — pinned 1.21.4 in build.gradle.kts.
- No TestRestTemplate/WebTestClient autoconfig on this classpath — use Spring Framework 7's `RestTestClient.bindToServer()` (see SmokeTest).
- detekt 1.23.8 needs Kotlin 2.0.21 forced on its `detekt` configuration (workaround in build.gradle.kts).

## Next steps

1. **BE-005 (crypto)** — can start: envelope encryption service (AES-256-GCM, per-user DEK, blind index). Local dev can fake KMS behind one small interface; real CMK/Secrets from devops before prod.
2. **BE-006 (auth/profile)** after BE-005; **BE-011 (entries)** after contract sign-off.
3. **BE-004 (first prod deploy)** — waiting on devops prod environment.
4. Still waiting: app-team review of `docs/contracts/vita-api-v0.yaml` (TBD-APP-REVIEW markers) gates W1/W2/W3 endpoints.

## Blockers / waiting on

- BE-004: devops prod env (ECS + RDS + Secrets Manager + pipeline). SES production access should be filed early.
- BE-005/006 prod configs: KMS CMK `vita-app-data`, Secrets Manager (service DEK, HMAC key), SES sandbox identities — devops tickets.
- BE-007: CEO Google/Apple developer accounts (deferred per Round 5).
- GitHub remote: CI workflows are dormant until the orchestrator/CEO creates the repo remote and pushes.
