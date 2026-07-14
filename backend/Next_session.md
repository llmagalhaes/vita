# Backend — Next session

## Current state (Phase 2 session 9, 2026-07-14) — BE-019 + BE-020 done locally (slice 3)

- **BE-019 (eating plan) + BE-020 (training program) done locally** — persisted,
  versioned, editable, encrypted. `Progress/BE-019-Progress.md`,
  `Progress/BE-020-Progress.md`; ADR-0011 extended with the history/edit/re-encrypt
  decision.
  - New package `plans/` (controller/service/repository, ADR-0012). ONE engine
    serves both resources: `PlanRepository` (blob-only, `PlanTable` enum →
    injection-safe table name), `PlanService` (JsonNode, type-agnostic, per-user
    DEK envelope — identical to entries), `PlanController` (4 endpoints × 2).
    Reuses `EatingPlanDraft` / `TrainingProgramDraft` schemas as request+response.
  - Migration **`V004__plans.sql`** — `eating_plan` + `training_program`, each
    `(id, user_id, doc_enc, created_at)`, `user_id … ON DELETE CASCADE`. `doc_enc`
    = whole confirmed draft as one AES-256-GCM blob under the per-user DEK; **no
    denormalized numbers** (plans are never server-aggregated).
  - **Semantics (D5):** `POST` = new version (cap `vita.plans.history-max`
    default 5, oldest dropped); `GET` = current; `PUT` = edit current
    (**full-doc replace + whole-blob re-encrypt in the service — no plaintext
    server-side merge-patch**, updates newest row in place, not a new version);
    `GET …/history` = ≤5 frozen versions `{id, createdAt, doc}`. 404 when no
    current version exists (GET/PUT).
  - **Crypto-at-rest + cascade verified:** `PlanFlowTest` proves stored `doc_enc`
    bytes ≠ plaintext, and that account `purge` shreds the DEK + cascades the
    rows; `SmokeTest` now lists `eating_plan.doc_enc` / `training_program.doc_enc`
    among the bytea C3 columns.
  - **Contract v0.4.0** (additive, D6 — no further bump): added `/plan`,
    `/plan/history`, `/program`, `/program/history` under tag `plans`, plus
    `PlanVersion` / `ProgramVersion` schemas. redocly exit 0.
- **Verified:** `./gradlew check` green — **106 tests** (was 93; +10 PlanFlowTest,
  +3 ProgramFlowTest), detekt+ktlint clean, redocly exit 0.
- **App slice-3 consumes:** GET/POST/PUT `/v1/plan` (`EatingPlanDraft`) + GET
  `/v1/plan/history` (`PlanVersion[]`); same shapes under `/v1/program`
  (`TrainingProgramDraft` / `ProgramVersion[]`). Orchestrator to relay the
  contract change to the app team (ADR-0006).
- **Next backend:** BE-024 (checkin entry type, v0.4.0 + new ADR-0013), then
  BE-018 (photo, uses `photo-model`), BE-025 (vacations). Debt/adapters
  (BE-022/026/027) anytime after OPS-020.

## Current state (Phase 2 session 8, 2026-07-14) — Fable audit fast-follow done locally

- **BE-REVIEW-FIXES (audit 1.3 + 1.4) done locally** — `Progress/BE-REVIEW-FIXES-Progress.md`. Both fixes root-caused in `EntryService.normalize` (shared by POST + PATCH):
  - **1.3 muscle mapping**: workout `muscles` now mapped onto the 11-silhouette contract vocabulary, aliases folded (lats/traps→back, abs/obliques→core), unmappable dropped. Raw model muscles no longer reach storage.
  - **1.4 contract minimums**: meal item kcal/macros `>= 0`, workout `durationMin >= 1` / `kcal >= 0`, exercise sets/reps `>= 1` / loadKg `>= 0`, `inputMethod` enum (in `create`). Contract-invalid input now returns **400**, not a Postgres CHECK 500 or silent bad data.
  - **Contract untouched** (no bump — already specified this behaviour). `./gradlew check` green, **93/93 tests** (+4 in EntryFlowTest), detekt+ktlint clean.

## Current state (Phase 2 session 8, 2026-07-14) — BE-023 + BE-017 done locally

- **BE-023 (verify & pin AI model ids) done locally** — `Progress/BE-023-Progress.md`, ADR-0005 "Pinned model ids" table.
  - Verified all ids against the claude-api reference. **`plan-pdf-model = claude-sonnet-4-6` is correct, not wrong** (valid Sonnet-class, native PDF+vision, thinking-OFF by default — which the 2048-token forced-tool call needs; `claude-sonnet-5` would turn adaptive thinking on and share that budget → truncation risk, so it's deferred behind a `ClaudeClient` thinking-disable change).
  - Kept `claude-haiku-4-5` (text, plan-model). **Added `vita.ai.photo-model = claude-sonnet-4-6`** for BE-018/F3 (vision per ADR-0005). `callTool` already takes model per-call, so no client field added.
- **BE-017 (GET /entries: from/to + CSV type) done locally — first piece of contract v0.4.0** — `Progress/BE-017-Progress.md`.
  - Additive: `from`/`to` half-open `[from,to)` window (either bound optional, mutually exclusive with `date` → 400); `type` CSV allow-list (`meal,water,workout,checkin`; unknown → 400; `checkin` accepted forward-compat for Habits, empty until BE-024). `date` single-day + keyset cursor UNCHANGED. `type` composes with `date` (Home Today).
  - **Contract bumped 0.3.0 → 0.4.0** (`docs/contracts/vita-api-v0.yaml`); redocly exit 0. App team notified via orchestrator.
  - Repository `list` param changed `DayRange? → from/toExclusive/types`; runs on the existing timeline index, no migration.
- **Verified:** `./gradlew check` green — **89/89 tests** (was 84; +5 BE-017 in TimelineFlowTest), detekt+ktlint clean, redocly exit 0.
- **Next backend:** slice 3 — BE-019 + BE-020 (plan/program persisted, history ≤5, editable, v0.4.0 + ADR-0011 ext), then BE-024 (checkin entry type), BE-018 (photo, uses the new `photo-model`), BE-025 (vacations).

## Current state (Phase 2 session 7, 2026-07-14)

- **BE-016 (layered-packages refactor) done locally** — In progress on Asana. `Progress/BE-016-layered-packages-refactor-Progress.md`, `Doc/ADRs/ADR-0012` (supersedes ADR-0001's package section).
  - Flat `auth/`, `crypto/`, `shared/` brought into the controller/service/repository layout: `auth/controller/AuthController`, `auth/service/{MagicLinkService,TokenService,Mailer,RateLimiter}`, `crypto/service/CryptoService`, `shared/controller/HealthController`.
  - **Kept at package root (judgment, per `ai/AiConfig.kt` precedent):** `auth/SecurityConfig` + `auth/AuthProps` (config), `crypto/AesGcm` (util object), `crypto/KeyWrapper` (KMS SPI seam). Nothing left flat for risk — every move succeeded.
  - Mechanical only: package decls + imports, zero behaviour/endpoint/contract change. Suite **84/84**, detekt+ktlint clean, redocly exit 0. All feature packages now share one layout.

## Current state (Phase 2 session 6, 2026-07-13)

- **BE-015 (plan/program parse-import) done locally** — In progress on Asana (Done = production, blocked on BE-004 + devops OPS-011). Details in `Progress/BE-015-impl-plan-program-parse-Progress.md`.
  - `POST /v1/parse/eating-plan` + `/v1/parse/training-program`: synchronous tool-forced Claude call, nothing persisted (ADR-0005). Body `PlanImportRequest` = exactly one of `text`/`fileRef` (controller validates; oneOf → 400, text > 8000 → 400). Returns `EatingPlanDraft`/`TrainingProgramDraft` (structured + human `summary`). Empty/unusable output → 422; unknown fileRef → 422.
  - **Model tiering (config, `vita.ai.*`): text → `claude-haiku-4-5` (`plan-model`); PDF → `claude-sonnet-4-6` (`plan-pdf-model`, native document input, ADR-0005 Sonnet-class for PDF).** PDF posted as a native base64 `document` block, not our own OCR. `plan-timeout-seconds:25` (a second RestClient in ClaudeClient; plan calls are bigger than capture parse, still inside API Gateway's 29 s).
  - **BE-014 guardrails reused, not duplicated**: same `ParseQuota` (429 + Retry-After) + `ParseMetrics`. New shared `tooManyRequests(...)` (`ai/controller/RateLimitResponses.kt`) used by both parse controllers.
  - **`POST /v1/uploads`** vends a presigned PUT URL + opaque fileRef (OPS-011). purpose `plan_document`/type `application/pdf` enforced.
  - **S3 seam** (`uploads/service/FileStore.kt`, mirrors the BE-005 KMS seam): `presignPut` + `read`, one `LocalFileStore` impl — stub URL locally, reads fixtures from `vita.uploads.local-dir`, no AWS in `./gradlew check`. Real S3 presigner drops in as a replacement bean for prod (devops OPS-011).
  - `ClaudeClient` gained a generic `callTool(model, system, tool, toolName, userContent, type)` that deserializes tool input into a draft type — `parseText` behaviour unchanged.
  - Suite **84/84**; redocly exit 0 (contract v0.3.0 unchanged — already specced these).

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

1. **Plan-create / program-create endpoints (later W4 ticket)** — the confirmed `EatingPlanDraft`/`TrainingProgramDraft` is shaped to be POSTed as-is; the persist endpoints are out of scope for BE-015 (ADR-0011). File a ticket when W4 lands.
2. **BE-016 (layered-packages refactor) — DONE locally** (session 7). All feature packages now controller/service/repository; ADR-0012 is the standing convention.
3. **BE-007 (OIDC)** waits on CEO Google/Apple accounts. **BE-010 (deletion) done locally** — job queue now exists (`jobs/` + `V003`), reuse it for future async work (magic-link cleanup, PDF import, exports).
4. **BE-004 (first prod deploy)** — Dockerfile now present (arm64). Waiting on devops prod env + CI deploy chain (OPS-004 → OPS-014 pushes the image).

## Blockers / waiting on

- Devops: prod env (BE-004), KMS CMK `vita-app-data` + Secrets Manager entries (real `KeyWrapper` + prod keys), SES sandbox identities (real `Mailer`). **arm64 Dockerfile now ready** (OPS-014 can push it); ECS/ALB health check should target `/health`.
- **Devops OPS-011 (NEW dependency for BE-015)**: S3 bucket for plan-document uploads with presigned PUT + short lifecycle expiry, and the prod `FileStore` presigner bean (replaces `LocalFileStore`). Until then `fileRef` upload works only via the local stub. PDF import also spends on a Sonnet-class model — keep the $10/mo Claude budget alarm (OPS-015) in view.
- BE-007: CEO Google/Apple developer accounts (deferred per Round 5).
- Nothing from the app team — contract loop is closed (v0.3.0).
