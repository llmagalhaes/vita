# OPS-011 — S3 buckets: uploads + exports

Asana: https://app.asana.com/0/1216519867368584/1216521830742239 (OPS-011)
Model: Sonnet · Status: In progress (planned, awaiting apply)

## Built (session 3, 2026-07-13)
`modules/storage/main.tf`, wired as `module.storage` in prod-eu.
- Two buckets, account-id-suffixed: `vita-prod-uploads-201261380352` (plan PDFs incl.
  BE-015 presigned PUT) and `vita-prod-exports-201261380352`.
- Each: SSE-KMS (storage CMK) + bucket_key_enabled, all public access blocked,
  TLS-only bucket policy (deny insecure transport), lifecycle expire 30 d,
  `prevent_destroy`.
- Outputs `app_bucket_names` / `app_bucket_arns` for the OPS-014 task-role RW scoping.

## Skipped
CORS config — mobile native presigned PUT doesn't need it. Add when a browser client does.

## Plan
Part of the prod-eu batch: 27 to add total (storage = 10). Not applied.

## Remaining for Done
Apply; verify public-access block + lifecycle; OPS-014 grants task-role RW to exactly
these two buckets; presigned round-trip tested.
