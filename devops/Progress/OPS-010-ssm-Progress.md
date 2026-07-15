# OPS-010 — SSM Parameter Store secrets

Asana: https://app.asana.com/0/1216519867368584/1216514543477979 (OPS-010)
Model: Sonnet · Status: In progress (applied; awaiting CEO values + task-role test)

## APPLIED + verified 2026-07-13
CLI-verified all 7 params exist under `/vita/prod/`, `Type=SecureString`, encrypted
with the storage CMK (`075c7c59-…`): db-credentials, anthropic-api-key,
google-client-config, apple-client-config, email-blind-index-hmac-key,
wrapped-service-dek, jwt-secret. Values are placeholders (`REPLACE_ME_IN_CONSOLE`).

## Remaining for Done
- CEO pastes the 7 real values in the console (db-credentials must match the RDS password).
- OPS-014 grants the task role read on `/vita/prod/*` only — negative-tested there.

## Built (session 3, 2026-07-13)
`modules/ssm/main.tf`, wired as `module.ssm` in prod-eu.
- 7 `aws_ssm_parameter` SecureString (Standard tier = free), KMS storage CMK, under
  `/vita/prod/`: `db-credentials`, `anthropic-api-key`, `google-client-config`,
  `apple-client-config`, `email-blind-index-hmac-key`, `wrapped-service-dek`,
  **`jwt-secret`** (backend ask, env `VITA_JWT_SECRET`).
- Placeholder value `REPLACE_ME_IN_CONSOLE` + `ignore_changes=[value]` (real values
  never touch git/state).
- Output `ssm_parameter_path_arn` = `arn:aws:ssm:*:*:parameter/vita/prod/*` for the
  OPS-014 task role to scope read to exactly this path.

## Plan
Part of the prod-eu batch: 27 to add total (SSM = 7). Not applied.

## Remaining for Done
Apply; CEO pastes real values in the console (incl. db-credentials matching the RDS
password — see OPS-009 flag #3). OPS-014 grants the task role read on this path only,
negative-tested.

## FILLED 2026-07-15 (first-deploy milestone) — via CLI, not console
DevOps set the real values from this machine (`aws ssm put-parameter --overwrite`, SecureString,
storage CMK unchanged). Values are NOT in git/state (module keeps `ignore_changes=[value]`):
- jwt-secret, wrapped-service-dek, email-blind-index-hmac-key: freshly generated raw base64
  32-byte keys (VITA_JWT_SECRET / VITA_SERVICE_DEK / VITA_HMAC_KEY — app base64-decodes and uses
  directly; "wrapped-" in the name is legacy, it is NOT KMS-wrapped).
- anthropic-api-key: real key read from `backend/.../secrets.yaml` (gitignored) → prod hits real Claude.
- db-credentials: strong generated password, identical to the RDS master password (OPS-009).
- google-client-config, apple-client-config: still `REPLACE_ME_IN_CONSOLE` — the app does not read
  them (no OAuth wired). Leave until OAuth lands.
Task role + execution role read verified end-to-end: the ECS task booted and decrypted all 5 → **OPS-010 DONE.**
