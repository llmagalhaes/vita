# BE-026 — Real S3 `FileStore` presigner (LocalStack-tested)

Asana: Vita backend board (`1216519867368580`). Backlog: `docs/backlog-local-100.md` slice 8 + D9.
Status: **Done (local)** — 2026-07-14. No AWS applied, no git (orchestrator commits).

## What it does

Real S3-backed `FileStore` (the PDF plan-import upload/read path) behind the **existing seam** —
same `FileStore` interface, `PresignedUpload` / `UnknownFileRefException` types, no contract change.
`presignPut` vends a genuine presigned S3 PUT URL; `read` pulls the object back for the one parse
call (nothing persisted beyond it, ADR-0005). AWS SDK v2.

Opt-in via the `aws` Spring profile. Default context keeps `LocalFileStore`; `./gradlew check`
never constructs an AWS client (D9).

## Files

- `src/main/kotlin/com/llmagal/vita/uploads/service/S3FileStore.kt` (new) — `@Profile("aws")` bean.
  fileRef stays an opaque UUID (validated → blocks key injection/traversal); S3 key
  `plan-documents/<uuid>`. Missing object (typed `NoSuchKeyException` or a 404 `SdkException`) → `UnknownFileRefException` (422 upstream).
- `src/main/kotlin/com/llmagal/vita/aws/AwsClientsConfig.kt` (new, shared with BE-027) —
  `@Profile("aws")` `@Configuration` exposing `S3Client`, `S3Presigner`, `KmsClient`. One switch,
  `vita.aws.endpoint-override`: set → LocalStack (dummy `test`/`test` creds, path-style S3);
  blank → real AWS endpoints + `DefaultCredentialsProvider` (instance role in prod).
- `src/main/kotlin/com/llmagal/vita/uploads/service/FileStore.kt` — `LocalFileStore` now `@Profile("!aws")` (default).
- `src/main/resources/application.yaml` — `vita.uploads.bucket` (default `vita-uploads-local`),
  `vita.aws.region` (default `eu-west-1`), `vita.aws.endpoint-override` (default blank).
- `build.gradle.kts` — AWS SDK v2 BOM `2.30.0` + `s3` + `kms` + `url-connection-client`; new
  `localstackTest` task (tag `localstack`), tag excluded from the default `test` task.
- `src/test/kotlin/com/llmagal/vita/uploads/S3FileStoreLocalStackTest.kt` (new) — `@Tag("localstack")`.

## Config keys

| Key | Default | Purpose |
|---|---|---|
| `vita.aws.region` | `eu-west-1` | SDK region (matches prod, ADR-0002) |
| `vita.aws.endpoint-override` | (blank) | LocalStack `http://localhost:4566` locally; blank = real AWS |
| `vita.uploads.bucket` | `vita-uploads-local` | S3 bucket for plan-document uploads |

## Verification (2026-07-14)

- **Default `./gradlew check` (no docker/LocalStack): green, 122 tests, 0 failures.** LocalStack
  suites excluded by tag (not present in results). AWS SDK jars sit unused on the classpath — the
  `aws` profile is off, so no AWS client is constructed.
- **`./gradlew localstackTest` with LocalStack up: 3/3 green.** `presign PUT, upload bytes, read
  them back` proves the full round-trip against `:4566`; plus unknown-ref → 422 and non-uuid ref
  rejected without touching S3.

## Notes / skipped (ponytail)

- Reused `AwsClientsConfig` as the client factory in the tests (news it up directly) — no Spring
  boot / Postgres needed for the adapter tests; exercises the exact production client wiring.
- `url-connection-client` = one sync HTTP impl so the SDK auto-discovers it (no CRT/apache bloat).
- Prod flip = activate the `aws` profile + set the bucket env; endpoint-override stays blank. The
  seam swap is a profile toggle, nothing else (OPS-011 provisions the real bucket + IAM).
