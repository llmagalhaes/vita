# OPS-020 — LocalStack for AWS-shaped local testing

Asana: Vita devops board (`1216519867368584`). Backlog: `docs/backlog-local-100.md` D9 + debt table.
Status: **Done (local)** — 2026-07-14. No AWS applied, no Terraform, no git (orchestrator commits).

## What it does

LocalStack (S3 + KMS) added to the backend compose behind a `localstack` **profile**, so the
backend can build/test the REAL S3 `FileStore` presigner (BE-026) and REAL KMS `KeyWrapper`
(BE-027) against `http://localhost:4566`. Plain `docker compose up` stays Postgres-only;
`./gradlew check` stays AWS-free (nothing in the build depends on LocalStack).

## Files changed

- `backend/services/vita-api/docker-compose.yml` — added `localstack` service under
  `profiles: ["localstack"]`: `localstack/localstack:3`, `SERVICES=s3,kms`, port `4566`,
  `AWS_DEFAULT_REGION=eu-west-1` (matches prod, ADR-0002), mounts the init hook.
- `backend/services/vita-api/localstack-init.sh` (new) — LocalStack ready.d hook (`awslocal`,
  preinstalled in the image). Creates the bucket + KMS key/alias. Idempotent (guards on re-run).

## Start command

```
cd backend/services/vita-api
docker compose --profile localstack up          # Postgres + LocalStack
# or: COMPOSE_PROFILES=localstack docker compose up
```

Plain `docker compose up` (no profile) → Postgres only.

## BE-026 / BE-027 handshake — point the AWS SDK at LocalStack

| Thing | Value |
|---|---|
| Endpoint override | `http://localhost:4566` (all services share the one port) |
| Region | `eu-west-1` (same as prod) |
| Access key id | `test` (LocalStack dummy) |
| Secret access key | `test` (LocalStack dummy) |
| S3 bucket (BE-026) | `vita-uploads-local` |
| KMS key (BE-027) | alias `alias/vita-app-data` (resolve via alias, not id — id changes per boot) |

AWS SDK v2 (Kotlin) per-client: `.endpointOverride(URI.create("http://localhost:4566"))`,
`.region(Region.EU_WEST_1)`, `StaticCredentialsProvider.create(AwsBasicCredentials.create("test","test"))`.
S3: enable `forcePathStyle(true)` (LocalStack serves path-style).
Suggested config keys (backend owns the exact names): `vita.aws.endpoint-override` (empty in prod
→ default AWS endpoints), `vita.aws.region`, `vita.uploads.bucket`, `vita.crypto.kms-key-alias`.
The endpoint-override property is the only local-vs-prod difference: unset in prod, the SDK uses
real AWS; set to `:4566` locally. The real beans replace `LocalFileStore` / `LocalKeyWrapper`
via config (both seams already documented as "swap the bean, nothing else changes").

## Verification (run 2026-07-14)

```
docker compose config --services                        # → postgres            (default, no LocalStack)
docker compose --profile localstack config --services   # → localstack, postgres
docker compose --profile localstack up -d localstack    # image pulled, container up, "Ready."
docker logs …localstack-1 | grep -iE 'make_bucket|created KMS'
  make_bucket: vita-uploads-local
  created KMS key 7dbf3344-… as alias/vita-app-data
docker exec …localstack-1 awslocal s3 ls                # → vita-uploads-local
docker exec …localstack-1 awslocal kms list-aliases     # → alias/vita-app-data, ARN arn:aws:kms:eu-west-1:000000000000:…
curl -s -o /dev/null -w '%{http_code}' localhost:4566/_localstack/health   # → 200
```

Torn down with `docker compose --profile localstack down -v` (ephemeral; no persistence — fresh
bucket+key each boot, which keeps tests clean).

## Notes / skipped (ponytail)

- No Terraform for this (D9 says init via `awslocal`, not Terraform). Prod S3/KMS stay in the
  existing `terraform` modules, unchanged.
- No LocalStack persistence volume — fresh state per boot is what BE-026/027 tests want.
- SES stayed deferred (D9): `LogMailer` covers local; SES joins at F-LAST.
- Init hook via ready.d mount, not a separate init container — one fewer service, `awslocal`
  is already in the image.
