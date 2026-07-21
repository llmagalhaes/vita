# Backend — Next session

## Current state (Phase 2 session 16b, 2026-07-21) — BE-035: clickable magic-link email via https redirect (LIVE)

CEO couldn't click the magic link — email clients only auto-link/allow `http(s)`; a raw `vita://auth`
link is dead text (Gmail neuters custom-scheme anchors). Implements the old OPS-016 idea (magic-link
redirect). Ledger: `Progress/BE-035-clickable-link-Progress.md`. Asana `1216766487530093` — In progress
pending the CEO's click test.

- **Code (ponytail, shortest diff):** new public `GET /v1/auth/link?token=...` in
  `controller/auth/AuthController.kt` → **302 `Location: vita://auth?token=<token>`** + a minimal
  `text/html` fallback (tappable `vita://` anchor + "Open this on the phone with Vita installed") for
  clients that don't follow custom-scheme redirects. Token is **opaque pass-through** (not verified/
  consumed/logged; `URLEncoder`-re-encoded into the query). No auth (covered by the existing
  `/v1/auth/**` permitAll). `MagicLinkService` now builds the email link as
  `"${publicBaseUrl}/v1/auth/link?token=$token"` — **one line**; `SesMailer`/`Qr.kt` untouched (they
  embed `link` verbatim, so plain text, HTML button, and QR all now carry the https URL, and the
  redirect lands both the click and the scan in the same place). New `vita.auth.public-base-url` ←
  `PUBLIC_BASE_URL` (default the API-GW URL; devops can later move it to SSM — not a blocker).
  `magic-link-base-url` stays `vita://auth` (now the redirect *target*). No migration, no new dep.
- **Contract:** additive public `GET /auth/link` in `docs/contracts/vita-api-v0.yaml` (302 + text/html,
  opaque `token` query). Not called by the app — the browser follows it from the email. redocly valid.
- **Gates:** `./gradlew check` green — **157 tests, 0 failures** (+2 AuthFlowTest: 302/Location/HTML/
  token-encoding round-trip + the email carrying an https link), detekt+ktlint clean. **detekt gotcha:**
  a URL path with `/*` (`/v1/auth/**`) inside a KDoc opens a Kotlin *nested* block comment → detekt's
  parser swallows the rest of the file and mis-reports "unused property". Reword KDocs to avoid `/*`.
- **Deploy:** arm64 image → ECR `vita-api:be035`, digest
  `sha256:8142675bbc8aa7b314cccf9aa73da9ceecaf1bda60fb229a31d19e675b591f85`; task-def **`vita:7`**
  (clone of `vita:6` + new image by digest); service `vita` rolled out — **COMPLETED, 1/1**, `vita:6`
  drained. Live: `/health` 200; `GET /v1/auth/link?token=TEST123` → 302 `vita://auth?token=TEST123` +
  HTML fallback; token URL-encoding passes through untouched; fresh `POST /v1/auth/magic-link` 202 with
  **no fallback WARN** → SES path taken (email now carries the https link). **CEO to confirm the click
  opens Vita on the phone → then BE-035 Done.**
- **Docker credStore gotcha (save time):** host `~/.docker/config.json` uses `credsStore: "desktop"`,
  whose helper **hangs** non-interactively. Use a scoped `DOCKER_CONFIG` dir with the ECR token inline
  (no credStore) + `docker --config <dir> …`.

## Current state (Phase 2 session 16, 2026-07-21) — BE-034: QR of the sign-in link in the email (LIVE)

CEO ask executed: the magic-link email now embeds a scannable QR of the `vita://auth` link (CEO reads
mail on desktop, scans with the phone). Ledger: `Progress/BE-034-qr-email-Progress.md`. Asana
`1216754230436881` — In progress pending the CEO's device scan.

- **Code (ponytail, over BE-033):** new `service/auth/Qr.kt` (`qrPng` — zxing-core `BitMatrix` +
  JDK `ImageIO`, **no zxing `javase` module**); `service/auth/SesMailer.kt` switched from `SendEmail`
  to **`SendRawEmail`** with a **multipart/related** MIME (jakarta.mail / angus-mail): `text/plain`
  (quiet copy + raw link, fallback + accessibility) + `text/html` (`<img src="cid:qr">`) + inline
  360px PNG QR (`Content-ID: qr`). `MailerConfig`/`Mailer`/`LogMailer`/`AwsClientsConfig` untouched.
  **BE-033 fail-safe unchanged:** blank/sentinel `MAIL_FROM` → `LogMailer`; any build/send throw →
  WARN + `LogMailer`, `/auth` never 500s.
- **Deps added:** `com.google.zxing:core:3.5.3`, `org.eclipse.angus:angus-mail:2.0.3` (no
  `spring-boot-starter-mail`). No contract change, no migration. IAM already allows `ses:SendRawEmail`
  (OPS-023) — no devops dependency.
- **Gates:** `./gradlew check` green — **155 tests, 0 failures** (+1 net in `MailerTest`: the sent
  raw MIME parses back to text+html+inline-CID and the embedded QR decodes to the link), detekt+ktlint
  clean. (`PhotoParseFlowTest` 413 test is a pre-existing racy transport flake — passes on rerun,
  unrelated to the mailer.)
- **Deploy:** arm64 image → ECR `vita-api:be034`, digest
  `sha256:b7c52fee78e55228a66f5ddf853d0d2e1bcb30d0428fd452d2d290556df1d0aa`; task-def **`vita:6`**
  (clone of `vita:5` + new image by digest); service `vita` rolled out — **rollout COMPLETED, 1/1**,
  `vita:5` drained. `/health` 200, `POST /v1/auth/magic-link` 202, **no fallback "Magic link" log**
  → SES path taken. **CEO to confirm the QR scans on device.**
- **Build gotcha (save time):** `.dockerignore` excludes `build/`, so the host-jar fast path must
  build from a **staged minimal context** (copy the jar + `Dockerfile.runtime` into a temp dir and
  `docker build` there) — a plain `docker build .` from the service dir fails on a missing-jar
  checksum. Full in-container gradle build still times out here (BE-033 note).

## Current state (Phase 2 session 15, 2026-07-21) — BE-033: real magic-link email via SES (LIVE)

CEO decision executed: the magic-link email now actually arrives (was CloudWatch-only LogMailer).
Ledger: `Progress/BE-033-real-email-Progress.md`. In progress on Asana (`1216730310385675`) until
the live inbox verify is confirmed this session.

- **Code (ponytail, behind the existing Mailer seam):** `service/auth/SesMailer.kt` (AWS SDK v2
  `software.amazon.awssdk:ses`, reuses the 2.30.0 BOM; plain-text quiet email, no template engine),
  `config/MailerConfig.kt` (single `@Bean mailer()` selecting `SesMailer` vs `LogMailer`),
  `sesClient()` bean added to `config/AwsClientsConfig.kt`, `vita.mail.from: ${MAIL_FROM_ADDRESS:}`
  in `application.yaml`, `LogMailer` de-`@Component`'d (now local/dev default + prod fail-safe),
  `+MailerTest` (6 tests). No contract change, no migration.
- **Selection contract (agreed with devops):** `MAIL_FROM_ADDRESS` → `vita.mail.from`. Blank or the
  SSM placeholder `REPLACE_ME_IN_CONSOLE` → email disabled → `LogMailer` (BE-030 sentinel lesson).
  Real address (aws profile, SES client bean present) → `SesMailer`. **Fail-safe:** an SES send that
  throws logs the link at the LogMailer format and does NOT fail `/auth` — the CloudWatch escape
  hatch stays intact.
- **Devops OPS-023 already applied:** task-def `vita:4` maps secret `MAIL_FROM_ADDRESS` ← SSM
  `/vita/prod/mail-from` = `lucasmagalhaes2007@gmail.com`. SES identity **verified (Success)**,
  sandbox 200/day → CEO→CEO send works.
- **Gates:** `./gradlew check` green — **154 tests, 0 failures** (+6 MailerTest), detekt+ktlint clean.
- **Deploy:** arm64 image → ECR `vita-api:be033` (digest `sha256:fe41e069dcfef84286870af06c914c34223f81aaa6f828c0724b36191183d5b8`),
  task-def **`vita:5`** (clone of `vita:4` + new image), service `vita` updated. `/health` + live email
  verify status recorded in the ledger. **Image built from working-tree state (subagent doesn't run
  git); the orchestrator commits BE-033 — re-tag/rebuild at the committed SHA on the next deploy if
  SHA-tagging is desired.**
- **Retest command (CEO):**
  `curl -sS -X POST https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1/auth/magic-link -H 'content-type: application/json' -d '{"email":"lucasmagalhaes2007@gmail.com"}' -i`
  → email in inbox. Escape hatch unchanged:
  `aws logs tail /ecs/vita --region eu-west-1 --filter-pattern "Magic link" --follow`.
- **Build gotcha (save time):** the full in-container `./gradlew bootJar` Docker build TIMES OUT here;
  and `# syntax=docker/dockerfile:1` stalls resolving the frontend from Docker Hub. Fast path used:
  host `./gradlew bootJar` → tiny build context (jar only) → plain `docker build` (no syntax line).

## Current state (Phase 2 session 17, 2026-07-15) — BE-032: live-verified Claude model ids for PDF/photo import

CEO shipping PDF + photo import against PROD Claude. Re-checked the flagged risk that
`plan-pdf-model` / `photo-model = claude-sonnet-4-6` was stale. **Verdict: false alarm — the ids
are correct; no change needed.** Ledger: `Progress/BE-032-model-id-live-verify-Progress.md`; ADR-0005
updated with a "Live re-verification (BE-032)" note.

- **Verified live against the real Anthropic API** (key from gitignored `secrets.yaml`, never logged):
  `GET /v1/models` → `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5` all HTTP 200
  (active). Plus a live `POST /v1/messages` replicating the exact `parsePhoto` path on
  `claude-sonnet-4-6` (base64 image + forced `record_log_entries`, no `thinking`, `max_tokens` 2048)
  → `stop_reason: tool_use`, no `thinking` block, not truncated.
- **`claude-sonnet-4-6` is a real, current model** — NOT stale. It runs thinking-OFF by default when
  `thinking` is omitted (confirmed by the live call), which is exactly what the budget-capped forced
  tool needs. `claude-sonnet-5` would default adaptive-thinking ON and share the 2048 budget →
  truncation risk; stays deferred behind a `ClaudeClient` thinking-disable change (ADR-0005).
- **No `application.yaml` / `ClaudeClient` change.** `./gradlew check` green — **148 tests, 0 failures**
  (unchanged; no code touched).
- **Redeploy: NO.** Prod (image `909262c`) already runs these ids live since session 8. PDF/photo
  import will not 4xx/5xx on model ids. ADR/ledger doc updates ride the next commit; no image rebuild
  needed for this.

## Current state (Phase 2 session 16, 2026-07-15) — health-integrations milestone: backend no-op verdict (ADR-0016) + BE-030 OIDC sentinel fix

Milestone: **Samsung Health via Android Health Connect (+ assess Google Fit)**. App builds
the device-side read in parallel. Backend deliverables: **ADR-0016**, `Progress/BE-030-oidc-sentinel-Progress.md`,
`Progress/BE-031-health-connect-verdict-Progress.md`. Two Asana tickets created (In progress):
BE-030 `1216590099219043`, BE-031 `1216590099127127`.

- **BE-031 (health verdict) — the backend builds NOTHING for this milestone (ADR-0016).**
  Health Connect data is device-local (SQLite = display source), trends are client-side (D4),
  no multi-device/delta sync in v0, and the data is a re-syncable mirror of an external source
  — so under data-minimization it is not copied to the server. Health entries stay in SQLite,
  **not** pushed to `POST /entries` / the outbox.
  - **Write path & `source`:** `POST /entries` stamps `source='user'` (DB default; `NewEntry`
    has no `source` field, insert never sets it). **Correct as-is, not broken** — the backend
    never receives a health entry in the local-only model. No fix.
  - Device energy "spent" server persistence: **not needed** (D4 + SQLite display source).
  - **Contract UNCHANGED** (no new call) — matches what the app team was told. `EntrySource`
    already carries the health values for a *future* ingestion path; no `NewEntry.source` added
    now (YAGNI). **No LOUD flag — no contract change this milestone.**
  - Apple Health (later) = same shape = same verdict, build nothing.
  - **Flip path** (if health data must ever be server-durable, ADR-0016): additive optional
    `NewEntry.source` (bump + wire to InsertData/insert SQL; column+CHECK already exist, no
    migration) + a de-dup/idempotency scheme for re-synced ranges. Not built.
  - **Relay to app team:** do NOT enqueue `source: health_connect` entries to the outbox —
    SQLite-only. Contract unchanged confirms this by omission.
- **BE-030 (OIDC sentinel) — DONE locally, uncommitted.** `OidcVerifier.configFor` now treats
  the SSM placeholder `REPLACE_ME_IN_CONSOLE` as unconfigured (→ 503) in addition to blank, so
  an unconfigured provider returns the clean 503 not a misleading 401. One guard + const
  `SSM_PLACEHOLDER`, +1 test. Google is now genuinely configured in SSM (real client id set) so
  unaffected; the fix matters for **Apple** (still placeholder). No contract change, no new dep.
- **Verified 2026-07-15:** `./gradlew check` green — **148 tests, 0 failures** (was 147; +1
  OidcVerifierTest), detekt+ktlint clean. LocalStack suites untouched (6/6, not re-run).
- **Next backend action:** orchestrator commits (BE-030 code + ADR-0016 + ledgers) → the
  BE-030 one-liner rides the **next image** with any other pending backend SHA (BE-007 was
  already deployed per session 15 handover; confirm current prod image before rebuild). A new
  image/redeploy is **not urgent** — BE-030 only changes an error code (401→503) on the
  still-placeholder Apple provider; it can ride the next deploy rather than trigger one now.

## Current state (Phase 2 session 15, 2026-07-15) — BE-007 OIDC done locally + Jackson 2→3 converged + board swept to Done

Backend is **LIVE in prod** (API GW `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`,
`/health` 200, real Claude). This session: enable Google/Apple sign-in, finish remaining
backend debt, and reconcile the Asana board to production. Deliverables:
`Progress/BE-007-oidc-Progress.md`, **ADR-0015**.

- **BE-007 (`POST /v1/auth/oidc`, Google + Apple) — DONE locally, uncommitted.** To contract,
  **no contract change** (`/auth/oidc` was already in v0). Verification reuses Spring Security
  `NimbusJwtDecoder` (JWKS fetch+cache, RS256, iss/aud/exp, **no new dep**); nonce + verified-email
  handled in code. Find-or-create on `(provider, subject)` (new `oidc_identity` table, migration
  **V007**), link by verified email, cancel-deletion, one session model via `TokenService`. New
  shared `service/auth/UserAccounts` (find/create/cancel-deletion) — **magic-link refactored onto
  it** so the crypto envelope can't drift. **Fail closed**: unconfigured audience → 503; verify
  fail → 401; unknown provider → 400. Files: `config/OidcProps`, `service/auth/{OidcVerifier,
  OidcService,UserAccounts}`, `repository/auth/OidcIdentityRepository`, `controller/auth/AuthController`
  (OIDC endpoint), `db/migration/V007__oidc_identity.sql`, tests `OidcVerifierTest`+`OidcFlowTest`+
  `OidcTestTokens`.
- **Config the CEO must fill (blocks Google/Apple sign-in going live):** `vita.oidc.google.audience`
  ← env `GOOGLE_OIDC_AUDIENCE`, `vita.oidc.apple.audience` ← `APPLE_OIDC_AUDIENCE`, mapped by
  devops from the SSM params **`google-client-config` / `apple-client-config`**. Each holds the
  **OAuth client id (the `aud`)**. Blank → that provider 503s (fail-closed). See the orchestrator
  report / BE-007 ledger for the full CEO Google/Apple action list (which client-id types, app
  vs backend, APP-007 dependency).
- **Jackson 2→3 convergence (BE-028 residual debt) — DONE.** `ClaudeClient` + `ParseEvalCases`
  now use Jackson 3 (`tools.jackson`, `jacksonMapperBuilder()`); removed the J2
  `com.fasterxml.jackson.module:jackson-module-kotlin` dep (only shared `jackson-annotations`
  remains, transitive). Verified against the WireMock golden parse tests. Dual-mapper debt retired.
- **Asana board swept to production reality.** Moved **25 tickets → Done** (BE-001,002,004,005,006,
  008–020,022–028) with a "live in prod via image a03e194 / API GW verified" comment each. Left
  **In progress**: BE-007 (built, not yet deployed — awaits image + CEO config), BE-029 (committed
  `881834f` but NOT in image `a03e194` — ships next image), BE-003 (CI — genuinely unshipped, CEO
  chose no paid pipeline).
- **`./gradlew check` green — 147 tests, 0 failures** (was 124 at `881834f`; +16 OidcVerifierTest,
  +7 OidcFlowTest), detekt + ktlint clean. LocalStack suites untouched (still 6/6, not re-run).
- **Next backend action:** orchestrator commits BE-007 → build the next arm64 image from that SHA
  (includes BE-029 + BE-007) → push to ECR `vita-api` (`<sha>` + `latest`) → devops redeploys.
  Image build recipe: `services/vita-api/Dockerfile` (arm64), `docker buildx build --platform
  linux/arm64`, push via `aws ecr get-login-password` (acct 201261380352, eu-west-1). Did NOT
  build/push this session — the image must carry the committed BE-007 SHA, which only exists after
  the orchestrator commits (subagents don't run git). OIDC stays 503 in prod until the CEO drops the
  client ids into the two SSM params.

## Current state (Phase 2 session 14, 2026-07-15) — BE-004 image LIVE in ECR + BE-029 per-exercise muscles

Production milestone called (CEO). Two deliverables: `Progress/BE-004-prod-deploy-Progress.md`,
`Progress/BE-029-per-exercise-muscles-Progress.md`.

- **BE-004 (image build + push) — DONE (backend half).** arm64 image from committed `a03e194`
  (backend == BE-028 `1e301b8`) pushed to ECR `vita-api`, tags `a03e194` + `latest`,
  **digest `sha256:fa747eb6d537d5df3d52da32e417922f4bd2f68fadcdfe9645dc1e34e7c10c33`**, ~164 MB,
  native arm64 (Apple Silicon host, no emulation). Sanity-booted against a fresh compose Postgres:
  Flyway migrated empty→v006, `/health` `{"status":"up"}`, boot ~3s. **Devops owns the flip**
  (`desired_count`→1) + API Gateway verify — they poll ECR.
- **BE-004 boot-env contract — FLAGGED to devops (mismatches in `modules/ecs/main.tf`):**
  1. **`SPRING_PROFILES_ACTIVE=aws` is MISSING** from the ECS task `environment` → app would boot
     with LocalKeyWrapper (needs `VITA_MASTER_KEY`, absent → **boot fail**) + LocalFileStore.
  2. `container_secrets` maps `DB_CREDENTIALS` but the app reads **`DB_PASSWORD`** (+ plain
     `DB_URL`, `DB_USERNAME`). And is **missing `VITA_SERVICE_DEK`** (←wrapped-service-dek) +
     **`VITA_HMAC_KEY`** (←email-blind-index-hmac-key) → CryptoService fails to construct at boot.
  3. `VITA_UPLOADS_BUCKET` not set → defaults to `vita-uploads-local` (wrong bucket; only bites the
     PDF-upload path, not boot).
  See BE-004 ledger + the orchestrator report for the full name→meaning table. **`wrapped-service-dek`
  / `email-blind-index-hmac-key` / `jwt-secret` must be pasted as RAW base64 32-byte keys** (the app
  base64-decodes and uses them directly — it does NOT KMS-unwrap the service DEK; the name is misleading).
- **BE-004 magic-link for prod testing:** LogMailer (SES unbuilt) logs the link at INFO →
  `aws logs tail /ecs/vita --region eu-west-1 --filter-pattern "Magic link" --follow`. Link is
  `vita://auth?...`. (LogMailer logs the email = PII; acceptable only for CEO self-test pre-SES.)
- **BE-029 (per-exercise muscles) — DONE locally, in the working tree (uncommitted).** Contract
  **v0.4.0 → v0.5.0**: optional `Exercise.muscles` (same 11-silhouette vocab as `WorkoutDetail.muscles`,
  additive, workout-level field kept). `Exercise` model + `EntryService` map each exercise's muscles
  (reused `mapMuscle`, extracted `mapMuscles`); Claude tool preamble extended. `./gradlew check`
  **124 tests** green, redocly exit 0. **Ships in the NEXT image** (not the pushed `a03e194`).

- **Next backend action:** orchestrator commits BE-029 → new image → devops redeploys. App team to
  be notified of contract v0.5.0 (per ADR-0006). Nothing else pending pre-release.

## Current state (Phase 2 session 13, 2026-07-15) — BE-028 hygiene sweep done locally

Pre-release cleanup (CEO un-gated BE-028). `Progress/BE-028-hygiene-sweep-Progress.md`,
**ADR-0014** (supersedes ADR-0012). No contract/endpoint change, no new deps.

- **Layer-first packages (ADR-0014).** Flipped ADR-0012's feature→layer to **layer→feature**:
  top-level `controller/<feature>`, `service/<feature>`, `repository/<feature>`, shared
  `model/<feature>` (+ `model/` root), `config/`. Crypto (primitive + seam + service) all under
  `service/crypto`; `ClaudeClient` → `service/ai`; health → `controller/health`. 51 files moved
  (`git mv`-style; package+imports only). `model/` fixes the service→controller import direction.
  **Did NOT create `utils`/`exceptions`** (no genuine occupant — anti-empty-package). Test
  packages stay feature-grouped. Seams `KeyWrapper`/`FileStore`/`Mailer` intact.
- **Ponytail:** removed duplicate `MacroTotals`/`Micro` (now one `model/Nutrition.kt`); deleted
  `ClaudeClient.extractToolOutput` (dup of `extractTyped`). Comments already clean — no churn.
- **AAD defense-in-depth (Audit-2 1.7):** `encryptForUser/decryptForUser` now take a `context`
  and bind AAD to `"$userId:$context"` (`table.column`, via new `AadContext`; plan docs derive
  from `PlanTable.table`). Blobs can't be replayed across users **or** columns. **Breaks existing
  local dev rows** (throwaway; no prod data) — new `CryptoServiceTest` covers wrong-context fail.
- **Docs:** README rewritten for the layer-first layout + 3 Mermaid diagrams (package overview,
  write-path flow, crypto envelope).
- **Verified 2026-07-15:** `./gradlew check` green — **123 tests, 0 failures** (was 122; +1 AAD),
  detekt+ktlint clean. `./gradlew localstackTest` (LocalStack up) = **6/6 green**, torn down.
- **Deliberately NOT done:** Jackson 2→3 convergence in `ClaudeClient` (build.gradle-tracked debt)
  — a real cross-version migration with WireMock risk, not shortest-diff-green; left isolated.
- **Remaining backend:** none pending pre-release. Next backend action is F-LAST deploy (devops-led,
  CEO-gated) — the reorg/AAD ship with it.

## Current state (Phase 2 session 12, 2026-07-14) — BE-026 + BE-027 done locally (real S3/KMS adapters)

Real AWS SDK v2 adapters behind the existing seams, tested against LocalStack (OPS-020). No
contract change (impl-only). `Progress/BE-026-Progress.md`, `Progress/BE-027-Progress.md`.

- **Opt-in via the `aws` Spring profile.** Local beans (`LocalFileStore`, `LocalKeyWrapper`) are now
  `@Profile("!aws")` = default; real beans (`S3FileStore`, `KmsKeyWrapper`) are `@Profile("aws")`.
  `./gradlew check` runs the default context → **AWS-free, no docker, no LocalStack**. The AWS SDK
  jars sit unused on the classpath until the profile is on.
- **`aws/AwsClientsConfig.kt`** (new, shared) — the single place wiring `S3Client`/`S3Presigner`/
  `KmsClient`. One switch, `vita.aws.endpoint-override`: set → LocalStack (`test`/`test` creds,
  path-style S3); blank → real AWS + `DefaultCredentialsProvider` (instance role). **Prod flip =
  activate `aws` profile + set bucket/CMK env; endpoint-override stays blank.** Bean swap only.
- **BE-026 (S3 `FileStore`)** — real presigned PUT + object read for the PDF import path. fileRef
  stays an opaque UUID (S3 key `plan-documents/<uuid>`); missing object → `UnknownFileRefException`.
- **BE-027 (KMS `KeyWrapper`)** — envelope via `GenerateDataKey(AES_256)` + `Decrypt`, CMK by alias
  `alias/vita-app-data`. Composes with `CryptoService` unchanged (plaintext DEK → `AesGcm`).
- **Config keys chosen:** `vita.aws.region` (eu-west-1), `vita.aws.endpoint-override` (blank),
  `vita.uploads.bucket` (vita-uploads-local), `vita.crypto.kms-key-alias` (alias/vita-app-data).
- **Test gating:** LocalStack adapter tests are `@Tag("localstack")`, excluded from the default
  `test` task. New `./gradlew localstackTest` runs them (needs `docker compose --profile localstack
  up -d`). Fixed a latent bug: the tag-exclude was on `tasks.withType<Test>` (hit `liveEval` and the
  new task too) → scoped it to `tasks.named<Test>("test")`. `liveEval` now also filters correctly.
- **Verified 2026-07-14:** default `./gradlew check` green — **122 tests, 0 failures, AWS-free**
  (LocalStack suites absent from results). With LocalStack up, `./gradlew localstackTest` = **6/6
  green, 0 skipped** (S3 presign→upload→read round-trip; KMS wrap/unwrap round-trip + wrapped≠plain
  + AES-GCM composition). LocalStack torn down (`down -v`), no containers left running.
- **Remaining backend:** BE-028 hygiene sweep (parked, pre-release). All local-100 backend tickets
  now done locally. Release pipeline (F-LAST) unscheduled.

## Current state (Phase 2 session 11, 2026-07-14) — BE-024 + BE-025 + BE-022 done locally

Batch: checkin entry type → vacation ranges → token cleanup. ADR-0013 created
(checkin-as-entry-type + vacation ranges). Contract v0.4.0 (additive, no bump — D6).

- **BE-024 (checkin as a NEW entry type)** — `Progress/BE-024-Progress.md`.
  Rides the existing `entries/` path: `EntryType` gained `checkin`,
  `CheckinDetail={habitId,habitName,kind,answer,note?}` encrypted in the detail
  (per-user DEK) like every entry, `denormalize` all-null (no aggregatable
  numbers). Idempotency `habitId:date` via the existing header path (same answer
  replays, different answer 409); change-answer = PATCH the entry. Home/Habits
  split via the BE-017 CSV `type` filter (already forward-compat). **Migration
  `V006__log_entry_checkin_type.sql`** widens the `log_entry.type` CHECK.
  Contract: `CheckinDetail` schema + `checkin` in `EntryDetail` oneOf and
  `NewEntry.type`; `Idempotency-Key` loosened (dropped `format: uuid`).
- **BE-025 (vacation ranges)** — `Progress/BE-025-Progress.md`. `GET/PUT
  /v1/me/vacations`: encrypted opaque JSON array of `{start,end}`,
  replace-on-write, one row per user, server never interprets (only a
  structural is-array check → 400). New `users/{controller,service,repository}/
  Vacation*.kt` + **migration `V005__vacations.sql`** (`vacation`, `ranges_enc`
  C3, ON DELETE CASCADE). Contract: `/me/vacations` + `VacationRange`.
- **BE-022 (token cleanup, audit 2.3)** — `Progress/BE-022-Progress.md`.
  `jobs/service/TokenCleanupJob.kt` — a `@Scheduled` sweep deleting consumed/
  expired `magic_link_token` (encrypted email must not linger) + dead
  `refresh_token` rows. **Ponytail call flagged for the orchestrator:** a direct
  `@Scheduled` DELETE, not routed through the `job` table (a recurring cron
  doesn't fit a one-shot queue; would bloat the very table it cleans). Reuses the
  `jobs/` package + `@EnableScheduling`; no infra, no migration, no contract change.
- **Verified:** `./gradlew check` green — **122 tests** (was 111; +4 CheckinFlowTest,
  +5 VacationFlowTest, +2 TokenCleanupJobTest), detekt/ktlint
  clean, redocly exit 0. Also fixed latent `EntryFlowTest` nondeterminism
  (`SELECT kcal … LIMIT 1` scoped to `type='meal'` now that the shared test DB
  holds null-kcal check-ins) and added `vacation.ranges_enc` to SmokeTest's C3 list.
- **App consumes:** checkin via `POST /entries type=checkin` (key `habitId:date`,
  PATCH to change) + `GET /entries?type=checkin`; vacations via `GET/PUT
  /v1/me/vacations` (JSON array of `{start,end}`). Orchestrator relays the 0.4.0
  additions to the app team (ADR-0006).
- **Remaining backend:** debt/adapters BE-026 (S3 FileStore) + BE-027 (KMS
  KeyWrapper) after OPS-020 (LocalStack); BE-028 hygiene sweep parked (pre-release).

## Current state (Phase 2 session 10, 2026-07-14) — BE-018 done locally (slice 5, photo)

- **BE-018 (POST /parse/photo — Claude vision) done locally** — `Progress/BE-018-Progress.md`.
  Contract v0.4.0 **unchanged** (already specified); implemented to spec.
  - **App coordination point (APP-020):** multipart field **`image`** (required), that
    part's `Content-Type` must be `image/jpeg` / `image/png` / `image/webp` (else **415**);
    optional form fields `caption` (≤500, → draft `sourcePhrase`) and `capturedAt` (RFC
    3339, missing/bad → `now`). Response = the **same `ParseResult`** as `/parse/text`,
    `inputMethod="photo"`, `isEstimate=true`.
  - `ClaudeClient.parsePhoto(...)` = vision sibling of `parseText`: reuses the
    `record_log_entries` tool + `NUTRITION_PREAMBLE`, adds a photo system prompt, sends a
    native base64 `image` block on the Sonnet-class `photo-model` over the existing
    `planRest` (2048 tok / 25 s). `ParseService` text+photo now share one `respond()` tail.
  - **Image never persisted** (ADR-0005): no S3/disk/DB in the parse path; bytes live only
    in-request + the outbound Claude call.
  - **413** via `spring.servlet.multipart.max-file-size=5MB` backstop →
    `MaxUploadSizeExceededException` → new `MultipartUploadAdvice` (problem+json). **422**
    on empty/unusable output. Reuses BE-014 quota (429) + `ParseMetrics`.
  - **Multipart under Boot 4 / Jackson 3 verified E2E** (`PhotoParseFlowTest`,
    `@SpringBootTest` RANDOM_PORT + WireMock via `@DynamicPropertySource`): posts a real
    image part, asserts the vision block reached the model + 413/415/422/401. Two gotchas
    logged below.
- **Verified:** `./gradlew check` green — **111 tests** (was 106; +5 PhotoParseFlowTest),
  detekt+ktlint clean. Contract untouched (redocly N/A).
- **Next backend:** BE-024 (checkin entry type, v0.4.0 + ADR-0013) and BE-025 (vacations)
  remain from slices 6–7; debt/adapters BE-022/026/027 anytime after OPS-020.

### Boot 4 gotchas (NEW — save yourself time)
- `MultipartBodyBuilder` (test helper) pulls in `org.reactivestreams.Publisher`, which is
  **not on the test classpath** → `NoClassDefFoundError`. Build multipart request bodies
  with a plain `LinkedMultiValueMap<String,Any>` + `HttpEntity(resource, headers)` instead
  — no extra dependency.
- **Spring 7 renamed status enums** (same numeric codes): 413 `PAYLOAD_TOO_LARGE` →
  `CONTENT_TOO_LARGE`, 422 `UNPROCESSABLE_ENTITY` → `UNPROCESSABLE_CONTENT`. `RestTestClient`
  `.expectStatus().isEqualTo(HttpStatus.X)` compares by enum identity, so assert with the
  **canonical new names**. `.value()` and the wire/contract are unaffected.

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
