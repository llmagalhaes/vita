# BE-001 — Walking skeleton

Asana: https://app.asana.com/0/1216519867368580/1216521831623308

## 2026-07-13

- Scaffolded `backend/services/vita-api/`: Kotlin 2.2.21 + **Spring Boot 4.0.7** (ADR-0001 fallback to 3.5.x not needed — Boot 4 worked), Gradle 9.6.1 wrapper, JDK 21 toolchain (foojay resolver for CI).
- Flat packages per ADR-0001: `auth/` (SecurityConfig + JwtAuthFilter stub — extracts bearer token, validates nothing yet, so everything is anonymous), `users/` (MeController — 401 vertical proof), `shared/` (HealthController — `GET /health` with a real `SELECT 1`).
- 401s are RFC 7807 problem+json (ADR-0006) via a custom AuthenticationEntryPoint.
- Tests: `SmokeTest` (@SpringBootTest RANDOM_PORT + Testcontainers Postgres 16 via `@ServiceConnection`; health 200, /v1/me 401 problem+json, DB SELECT 1) + `JwtAuthFilterTest` (MockK unit test of bearer extraction).
- Lint: ktlint 14.2.0 + detekt 1.23.8 defaults. Detekt needs Kotlin 2.0.21 forced on its own configuration (known incompatibility, workaround in build.gradle.kts).
- Boot 4 gotchas found (recorded for the team): `spring-boot-starter-webmvc` is the canonical starter name; Testcontainers versions are no longer BOM-managed (pinned 1.21.4); `TestRestTemplate`/`WebTestClient` autoconfig not on this classpath — used Spring Framework 7's new `RestTestClient.bindToServer()` instead.
- **Verified: `./gradlew check` green** (detekt, ktlint, 5/5 tests incl. Testcontainers).

Status: code complete; ticket stays In progress (Done = in production, blocked on BE-004/devops).
