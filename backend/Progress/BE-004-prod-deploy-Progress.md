# BE-004 — First production deploy (image build + push)

Asana: BE-004 · First production deploy + smoke test (gid 1216519895569161), board "Vita backend".
DoD = in production. This session delivered the **backend half**: a working arm64 image in ECR.
Devops flips ECS `desired_count` → 1 and verifies through the API Gateway (parallel session).

## Session 14 (2026-07-15) — image built, sanity-booted, pushed to ECR

CEO called the production milestone ("subir o backend em produção"). Un-parked BE-004.

### Image
- Built from committed state `a03e194` (backend code == BE-028 reorg `1e301b8`; `a03e194` is a
  docs-only commit on top, tree clean). `docker build --platform linux/arm64`.
- Docker host is Apple Silicon → **native arm64, no QEMU emulation**.
- **ECR**: `201261380352.dkr.ecr.eu-west-1.amazonaws.com/vita-api`
  - tags: `a03e194` + `latest`
  - **digest: `sha256:fa747eb6d537d5df3d52da32e417922f4bd2f68fadcdfe9645dc1e34e7c10c33`**
  - size ~164 MB, arch arm64/linux. Verified via `aws ecr describe-images`.

### Local sanity boot (before push)
- Fresh compose Postgres (`docker compose down -v && up -d postgres`) → empty DB.
- Ran the image (default profile) against it. Flyway migrated **from empty schema → v006**
  (all 6 migrations, "Successfully applied 6 migrations"). `/health` returned `{"status":"up"}`
  (DB-backed). Boot ~3s. Matches the empty prod RDS (BE-028 AAD change → no old rows to migrate).

### Boot-time env / SSM contract the container reads (prod = `aws` profile)
See the report to the orchestrator for the full table and the **mismatches flagged for devops**.
Summary of what the container needs at boot:
- Plain env: `SPRING_PROFILES_ACTIVE=aws`, `DB_URL`, `DB_USERNAME`, `VITA_UPLOADS_BUCKET`
  (+ `AWS_REGION` already set by devops; `VITA_KMS_KEY_ALIAS`/`VITA_AWS_REGION` defaults are fine).
- Secrets (from `/vita/prod/*`): `DB_PASSWORD`←db-credentials, `VITA_SERVICE_DEK`←wrapped-service-dek,
  `VITA_HMAC_KEY`←email-blind-index-hmac-key, `VITA_JWT_SECRET`←jwt-secret, `ANTHROPIC_API_KEY`←anthropic-api-key.
- `VITA_MASTER_KEY` is **not** read under the `aws` profile (LocalKeyWrapper is `@Profile("!aws")`).
- google-client-config / apple-client-config SSM params: not read (BE-007 OIDC unbuilt).

### Magic-link retrieval for prod testing
`LogMailer` is the only `Mailer` bean (SES/OPS-012 unbuilt); it logs the link at INFO. In prod that
lands in CloudWatch `/ecs/vita` (stream prefix `app`). CEO retrieves the sign-in link with:
`aws logs tail /ecs/vita --region eu-west-1 --filter-pattern "Magic link" --follow`.
Link is `vita://auth?...`. NOTE: LogMailer logs the email address (PII) — acceptable only for
CEO self-test pre-SES; SES (OPS-012) closes it.

### Cleanup
Sanity container removed; compose Postgres left up for the local dev loop (torn down at session end).
