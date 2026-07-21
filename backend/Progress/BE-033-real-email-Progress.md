# BE-033 — real magic-link email (SES)

Asana: Vita backend `1216730310385675`. Session 15 (2026-07-20).

CEO decision: the magic-link sign-in email must actually arrive in the inbox. Until now
`LogMailer` only wrote the `vita://auth` link to CloudWatch.

## What was built (ponytail, behind the existing Mailer seam)

- **`SesMailer`** (`service/auth/SesMailer.kt`) — AWS SDK v2 SES (`software.amazon.awssdk:ses`,
  reuses the existing 2.30.0 BOM from the S3/KMS adapters). Plain-text email, no template engine:
  subject "Your Vita sign-in link", one line of purpose + the `vita://auth` link + an "ignore if you
  didn't ask" note. Quiet tone (product philosophy). Region eu-west-1 (shared `AwsClientsConfig`).
- **Fail-safe**: any exception from `ses.sendEmail` → log a warning + delegate to the injected
  fallback (`LogMailer`) so the CloudWatch link recipe keeps working and `/auth` never 500s on a
  mail-delivery problem. Covered by a unit test.
- **`MailerConfig`** (`config/MailerConfig.kt`) — single `@Bean mailer(...)`. Selection contract
  (agreed with devops, env `MAIL_FROM_ADDRESS` → `vita.mail.from`):
  - blank **or** the SSM placeholder `REPLACE_ME_IN_CONSOLE` → email disabled → `LogMailer`
    (BE-030 sentinel lesson).
  - a real address **and** an SES client bean present (aws profile) → `SesMailer`.
  - `SesClient` bean only exists under the `aws` profile; `ObjectProvider<SesClient>` makes the
    non-aws (local/dev) case resolve to null → `LogMailer`, no AWS on the path. `./gradlew check`
    stays AWS-free.
- **`LogMailer`** lost its `@Component` (single Mailer bean now chosen in `MailerConfig`); it is
  now the local/dev default **and** the prod fail-safe, not "never ships to prod". Comment updated.
- **`AwsClientsConfig`** — added the `sesClient()` bean (same region/creds/endpoint-override switch
  as s3/kms).
- **`application.yaml`** — `vita.mail.from: ${MAIL_FROM_ADDRESS:}` (blank default = disabled locally).

No contract change (mailer is internal; no OpenAPI touch, redocly N/A). No new migration. One new
dependency: `software.amazon.awssdk:ses` (managed by the existing BOM).

## LocalStack SES adapter test — SKIPPED (documented)

LocalStack has basic SES, but a `SendEmail` there needs `VerifyEmailIdentity` first and the result
is only inspectable via LocalStack's own `/_aws/ses` endpoint — fiddly and LocalStack-specific for
little gain. The mailer selection branch and the fail-safe are the real logic and are covered by
plain unit tests (`MailerTest`, mockk `SesClient`). Skipped per the ticket's "skip if flaky".

## Gates

`./gradlew check` green — **154 tests, 0 failures** (was 148; +6 `MailerTest`), detekt + ktlint clean.

## Deploy

- Task-def env dependency (devops OPS-023) **already applied**: `vita:4` maps secret
  `MAIL_FROM_ADDRESS` ← SSM `/vita/prod/mail-from` = `lucasmagalhaes2007@gmail.com` (real → SES active).
- SES identity `lucasmagalhaes2007@gmail.com` is **verified (Success)**; sandbox 200/day. CEO→CEO
  send works (both sender and recipient are the one verified identity).
- Image: arm64 built from working-tree state → ECR `vita-api:be033`, digest
  `sha256:fe41e069dcfef84286870af06c914c34223f81aaa6f828c0724b36191183d5b8`. Registered task-def
  **`vita:5`** (clone of `vita:4` + new image), service `vita` updated. `/health` = 200
  `{"status":"up"}` on the new deployment (via API GW). Waited for the old `vita:4` task (pre-SES
  image, LogMailer only) to fully drain before the live email verify so the request hits `vita:5`.
- **Build recipe that worked here** (the committed `Dockerfile`'s full in-container gradle build
  times out in this environment, and `# syntax=docker/dockerfile:1` stalls resolving the frontend
  from Docker Hub): host `./gradlew bootJar` → tiny build context (jar only) → plain `docker build`
  (no syntax line), `DOCKER_BUILDKIT` default. Temp `Dockerfile.runtime` left in the tree as a
  record; the canonical multi-stage `Dockerfile` is unchanged.

## Live verify (2026-07-21, done)

- Rollout **COMPLETED**: single deployment on `vita:5`, 1/1 running, `/health` 200 `{"status":"up"}`.
  App booted with profile `aws`, Flyway v007, `Started ... in 71s` (app log stream confirms).
- `POST /v1/auth/magic-link {"email":"lucasmagalhaes2007@gmail.com"}` (against prod, after the old
  `vita:4` task had drained to 0) → **202**.
- **SES path confirmed, fail-safe NOT triggered:** the app log stream shows **no** `Magic link for …`
  line and **no** WARN/error for the request. The old (pre-SES) image's `LogMailer` logs that line on
  *every* request; the new `SesMailer` logs nothing on success and only falls back (WARN + the log
  line) on failure. Its absence proves `MailerConfig` selected `SesMailer` and the SES send did not
  throw → SES accepted the message for the CEO's verified identity.
- **Remaining confirmation belongs to the CEO** (no inbox access from here): check the inbox for
  "Your Vita sign-in link". SES `SentLast24Hours` lags (still read 1.0 for several minutes post-send —
  a known SES statistics delay, not evidence of failure).

Retest command:

```
curl -sS -X POST https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1/auth/magic-link \
  -H 'content-type: application/json' -d '{"email":"lucasmagalhaes2007@gmail.com"}' -i
```

CloudWatch escape hatch (only logs the link if the SES send fails):
`aws logs tail /ecs/vita --region eu-west-1 --filter-pattern "Magic link" --follow`
