# Backend — Next session

## Current state (Phase 2 session 5, 2026-07-13)

- **BE-010 (account deletion + first job-queue use) done locally** — In progress on Asana (Done = production, blocked on BE-004). New `account/` package (controller→service→repository) + `jobs/` (ADR-0007 queue). Details in `Progress/BE-010-account-deletion-Progress.md`.
  - `DELETE /v1/account` → 202 `{deletionEffectiveAt}` (now+7d); idempotent (repeat doesn't move the date or re-enqueue); revokes all refresh tokens.
  - Sign-in cancels deletion: magic-link verify (pre-existing) **+ new** `TokenService.rotate` hook (`deletion_requested_at = NULL`).
  - Job queue: `V003__jobs.sql` (generic `job` table, `FOR UPDATE SKIP LOCKED`), `JobWorker` (`@EnableScheduling`, one-job-per-tx, failure recorded in a fresh tx, 5-attempt cap, 1-min backoff), poll interval `vita.jobs.poll-ms` (default 60s).
  - Deletion job guarded by `deletionDue` (pending AND `<= now()-7d`) → shred DEK first, then `DELETE FROM users` (cascade). Guard, not schedule, decides → cancel/re-request safe; retry-idempotent.
  - Suite **62/62**; redocly exit 0 (contract unchanged — `DELETE /account` already in v0.3.0).

## Current state (Phase 2 session 4, 2026-07-13)

- **Code complete: BE-001/002/003 (W0) + BE-005 (crypto) + BE-006 (magic link) + BE-008 (sessions) + BE-011 (POST /entries) + BE-009 (/me) + BE-012 (timeline + entry get/update/delete)** — all In progress on Asana (Done = production, blocked on BE-004/devops). Details in `Progress/BE-00{1,2,3,5,6,8,9}` + `BE-011` + `BE-012`.
- **BE-012 (session 4)**: GET `/v1/entries` (date+tz day filter, opaque base64url keyset cursor `(occurred_at,id) < (?,?)` desc, limit 1–100 default 50, fetch limit+1 for nextCursor) + GET/PATCH/DELETE `/v1/entries/{id}`. PATCH replaces occurredAt and/or whole detail (type immutable, validated against stored type, updated_at bumped); DELETE hard idempotent 204; foreign/missing → 404 (no ownership leak). Same `entries/` package, reuses BE-011's normalize/denormalize/toLogEntry. No contract change, no migration (reuses the `log_entry_user_timeline` index). Suite **48/48**. detekt: `TooManyFunctions`/`SpreadOperator` suppressed with reasons; backtick test names can't contain `;`.
- **BE-004 prep (session 4)**: `services/vita-api/Dockerfile` (+ `.dockerignore`) — multi-stage **linux/arm64** (Graviton): JDK-21 build (arch-neutral, `$BUILDPLATFORM`, gradle-cache mount, `bootJar -x test`) → slim `21-jre` runtime, non-root `vita`, `MaxRAMPercentage=75`, HEALTHCHECK on **`/health`** (no actuator — devops target-group should use `/health`, not `/actuator/health`). Verified: `docker build --platform linux/arm64` → arm64 image (~551 MB), smoke-run boots Spring Boot + Tomcat as `vita`, fails only on DB (expected). Deploy is devops (OPS-014).
- **BE-011 (POST /v1/entries)**: single write path, first code in the new controller→service→repository layering (Round 8 #0). Package `entries/{controller,service,repository}`. Idempotency via `INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING` + a canonical `request_hash` (same key+body → 200 replay; same key+different body → 409). Server recomputes meal totals from items and fills the C2 denormalized columns; `detail_enc`/`source_phrase_enc` are C3 (per-user DEK). **No new migration** — `log_entry` was already in `V001__baseline.sql` (that is the expand-only migration).
- **BE-009 (GET/PATCH /v1/me)**: package `users/{controller,service,repository}` (replaced the old flat `MeController` stub). Name (per-user DEK) + email (service DEK) decrypted; PATCH validates name 1–100 + units enum; `deletionEffectiveAt` = requested+7d, shown only during grace. No schema change (`users` already had the columns).
- **Verified this session**: `./gradlew check` green — **35/35 tests** (was 23; +7 `EntryFlowTest`, +5 `MeFlowTest`); redocly exit 0 (contract unchanged — 0.3.0 already specced these); full local loop live (compose → bootRun → magic-link 202 → verify 200 → POST /entries 201 with totals 9999→300 → replay 200 same id → 409 → GET /me 200 decrypted → PATCH /me 200 → /me 401 without token).

### Boot 4 / Jackson 3 gotcha (NEW — save yourself an hour)

- **Spring Boot 4 / Spring 7 MVC serializes with Jackson 3 (`tools.jackson.*`), not Jackson 2 (`com.fasterxml.jackson.databind.*`).** Symptoms if you use J2 types: request bodies with a `JsonNode` field → 500 `Cannot construct instance of JsonNode`; no injectable `com.fasterxml.jackson.databind.ObjectMapper` bean.
  - Use `tools.jackson.databind.JsonNode` in DTOs and inject `tools.jackson.databind.json.JsonMapper` for any internal JSON work. Catch `tools.jackson.core.JacksonException`.
  - **Jackson annotations stay `com.fasterxml.jackson.annotation.*`** (`@JsonInclude`, `@JsonProperty`, …) — shared, work with J3.
  - Added `implementation("tools.jackson.module:jackson-module-kotlin")` (replaced the unused J2 module). Without it, Kotlin **default parameters aren't honored** (a body omitting `isEstimate`/`sourcePhrase` → 400 "Failed to read request") and boolean `isX` fields serialize as `x` (contract `isEstimate` would leak as `estimate`).
- detekt still bites: `EnumNaming`+ktlint `enum-entry-name-case` on lowercase enum entries (contract wire values are lowercase) → `@Suppress("ktlint:standard:enum-entry-name-case", "EnumNaming")`; `LongParameterList` >7 on DTO/row carriers → `@Suppress("LongParameterList")`; `ThrowsCount` >2 per fn (extract a `bad()` helper). `require`/`check` throw `IllegalArgumentException` → 500, not 400 — use `ResponseStatusException(BAD_REQUEST)` for validation.

### Earlier gotchas (still valid)

- Canonical web starter `spring-boot-starter-webmvc`; Flyway needs `spring-boot-starter-flyway`; `spring-boot-starter-oauth2-resource-server` works as-is. Testcontainers pinned 1.21.4; `RestTestClient.bindToServer()`; detekt forced onto Kotlin 2.0.21. `./gradlew ktlintFormat` fixes most style; a file with one class + top-level fn must be named after the class.

## Next steps

1. **BE-013 (Claude client + POST /parse/text)** — unblocked by BE-011 (NewEntry schema live). Needs the zero-retention Anthropic key in Secrets Manager (devops); key is already in local `secrets.yaml`.
2. **BE-016 (deferred refactor)** — migrate the flat auth/users(old)/crypto/shared packages into the controller→service→repository layout. `entries/` and `users/` already conform.
3. **BE-007 (OIDC)** waits on CEO Google/Apple accounts. **BE-010 (deletion) done locally** — job queue now exists (`jobs/` + `V003`), reuse it for future async work (magic-link cleanup, PDF import, exports).
4. **BE-004 (first prod deploy)** — Dockerfile now present (arm64). Waiting on devops prod env + CI deploy chain (OPS-004 → OPS-014 pushes the image).

## Blockers / waiting on

- Devops: prod env (BE-004), KMS CMK `vita-app-data` + Secrets Manager entries (real `KeyWrapper` + prod keys), SES sandbox identities (real `Mailer`). **arm64 Dockerfile now ready** (OPS-014 can push it); ECS/ALB health check should target `/health`.
- BE-007: CEO Google/Apple developer accounts (deferred per Round 5).
- Nothing from the app team — contract loop is closed (v0.3.0).
