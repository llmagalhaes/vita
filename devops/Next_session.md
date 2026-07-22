# DevOps — Next session

## 2026-07-22 — Meal-plan SPEC round done (OPS-024 filed, To do — do NOT start before CEO ticket review)
Specification phase for the meal-plan/workout-plan feature (DESIGN-SPEC binding). Deliverable:
`docs/meal-plan-handover/devops-spec.md` + Asana **OPS-024** (gid 1216780753421668, To do).
Confirmed: **no new AWS resources / no structural Terraform** — V008 (portions overlay) rides the
next backend image; probes + CloudWatch checks + rollback specced in full in the spec/ticket.
**Recon finding (the real content): Terraform is 3 releases behind live.** Prod runs task-def
`vita:7` image `be035` (CLI clones, sessions 15–16b) but TF holds `app_image_tag = "909262c"`
(`envs/prod-eu/variables.tf:25`) and no `PUBLIC_BASE_URL` in `modules/ecs/main.tf` env — a naive
`terraform apply` would ROLL PROD BACK. OPS-024 deploys via Terraform and re-converges (adds
`PUBLIC_BASE_URL` from `trimsuffix(module.apigw.api_endpoint, "/")`, bumps the tag). Pre-deploy
gate in the ticket: local rollback rehearsal (boot `be035` against a V008-applied DB — Flyway
future-migration validation) + cross-team check that V008 is CREATE-only. Cross-team asks to
backend (in spec §5/§6): one INFO token-usage log line for eating-plan parses (ParseMetrics is
in-memory only — no exported cost metric until OPS-015); watch `plan-max-output-tokens 2048` /
timeout 25s ceilings with the bigger prompt. No new CEO questions from devops.

## 2026-07-20 — OPS-023 IN PROGRESS (SES magic-link email; applied + verified, awaiting CEO click)
Real email sending (CEO decision 2026-07-20). Implements old backlog **OPS-012** (closed as duplicate).
Terraform applied in prod-eu: new `modules/ses` email-address identity for `lucasmagalhaes2007@gmail.com`
(sandbox, no domain/DKIM); new SSM SecureString `/vita/prod/mail-from` with the REAL address (not a
placeholder — Terraform owns it, no ignore_changes); task-def env `MAIL_FROM_ADDRESS` sourced from it
(rev **vita:4**, service recycled, /health 200); task-role `SesSend` narrowed from `*` to the identity
ARN (`ses:SendEmail`+`SendRawEmail`, simulate-principal-policy = allowed). ENV CONTRACT fixed with
backend BE-033: blank/`REPLACE_ME` ⇒ email disabled → log link. Plan was 3 add / 2 change / 1 destroy
(destroy = old task-def rev), second apply clean. **ONE gate left: the SES identity is `Pending` — AWS
emailed a verification link to the CEO; NOTHING sends until he clicks it.** Post-click SendEmail test
command + CEO follow-ups (production-access request, real domain + DKIM for real users) in
`Progress/OPS-023-ses-mail-Progress.md`. Not moving to Done until verified live post-click.

## 2026-07-20 — OPS-022 DONE (S3 presigned-PUT 403 fixed, verified live)
Prod PDF import (APP-060) was 403 AccessDenied on the presigned PUT: the uploads bucket
(`vita-prod-uploads-201261380352`) is SSE-KMS with the **storage CMK** `075c7c59-...`, the presigned
PUT is signed by the **task role** `vita-ecs-task`, and that role had S3 Get/Put/Delete but **no KMS
grant** → S3 couldn't GenerateDataKey. Fix = one statement `S3SseKmsStorageKey`
(`kms:GenerateDataKey`+`Encrypt`+`Decrypt`, scoped to the storage key ARN only) added to the task
role inline policy in `modules/ecs/main.tf`. Decrypt is needed too — `S3FileStore.read()` GETs the
PDF back to parse. Storage key policy already grants kms:* to root, so no key-policy edit.
`terraform plan` = `0 add, 1 change, 0 destroy`; applied. **Verified end-to-end against live prod**:
magic-link → JWT → POST /v1/uploads → presigned PUT → **HTTP 200** (was 403); head-object shows the
object encrypted under `075c...`; simulate-principal-policy = allowed. Test object deleted. No task
restart needed (IAM policy eval is at request time; running task picked it up immediately). Ledger:
`Progress/OPS-022-kms-presign-Progress.md`.

## Current state (BACKEND LIVE — OIDC BUILD `909262c` DEPLOYED — 2026-07-15)

**Latest roll (OPS-021):** redeployed to `909262c` (BE-007 Google/Apple OIDC + BE-029 per-exercise
muscles + Jackson convergence) and wired the OIDC env. Task-def now **`vita:3`**, RUNNING+HEALTHY,
`/health` 200, Flyway applied **V007** (oidc_identity). Ledger: `Progress/OPS-021-oidc-redeploy-Progress.md`.
- **OIDC env wired**: task-def maps SSM `/vita/prod/google-client-config` → `GOOGLE_OIDC_AUDIENCE`
  and `apple-client-config` → `APPLE_OIDC_AUDIENCE` (env-from-SSM secret, same shape as crypto params).
  CEO pastes real client ids into those two SSM params → next task start picks them up, **no redeploy**.
- **CEO caveat**: while the SSM params hold the placeholder `REPLACE_ME_IN_CONSOLE`, a `POST /v1/auth/oidc`
  returns **401** (not the 503 the brief predicted) — the placeholder is a non-empty string so the
  backend's `isBlank()` 503 guard doesn't trip; it decodes and rejects the token instead. Still fully
  fail-closed (no token ever accepted). See ledger "Caveat" for the optional backend sentinel fix.

**First prod deploy milestone DONE.** The CEO called "subir o backend em produção"; backend lead
pushed the arm64 image and DevOps un-parked the infra in parallel. The API is serving.

- **API base URL** (hand to the app / CEO): `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`
  - `GET /health` → `{"status":"up"}` HTTP 200 (verified end-to-end: API GW → VPC Link → Cloud Map
    SRV → Fargate task:8080 → app → RDS `SELECT 1`).
- **Image**: `vita-api:909262c`, digest `sha256:108eaab9b70e…5af06`, linux/arm64 (was `a03e194`).
- **ECS**: cluster/service `vita`, 1 Fargate task (256 CPU / 1024 MB, ARM64) RUNNING + HEALTHY,
  task-def `vita:3`, `module.ecs.desired_count = 1`. App boots under Spring profile `aws` (KmsKeyWrapper
  + S3FileStore), Flyway migrated RDS to **v007** (oidc_identity) on this boot.
- **RDS**: master password set via CLI, mirrored into SSM `db-credentials`. Connected over TLS.
- **Secrets**: 5 app-consumed SSM SecureStrings filled from this machine (jwt, service-dek, hmac,
  anthropic real key, db-credentials). `google-/apple-client-config` still placeholder
  (`REPLACE_ME_IN_CONSOLE`) but now **wired** into the task-def (OPS-021) → CEO pastes real client ids,
  next task start picks them up. See `Progress/OPS-010-ssm-Progress.md` + `OPS-021-...`.
- **GitHub repo Variables** set (`gh variable set` on llmagalhaes/vita): `AWS_PLAN_ROLE_ARN`,
  `AWS_APPLY_ROLE_ARN`, `AWS_REGION=eu-west-1`. Unblocks the OPS-004 plan workflow.

### Terraform changes this session (all in `services/terraform`)
- `envs/prod-eu/main.tf`: `module.ecs` desired_count 0→1, wired `image_tag`/`db_url`/`uploads_bucket`;
  new `var.app_image_tag` (default `a03e194` — bump + apply to roll a new backend build).
- `modules/ecs/main.tf`: corrected `container_secrets` (`DB_PASSWORD`←db-credentials, added
  `VITA_SERVICE_DEK` + `VITA_HMAC_KEY`); added plain env (`SPRING_PROFILES_ACTIVE=aws`, `DB_URL`,
  `DB_USERNAME`, `VITA_UPLOADS_BUCKET`); added `container_name`/`container_port` to
  `service_registries`; removed `ignore_changes=[task_definition]` (Terraform owns the deploy — no
  CI pipeline).
- `modules/apigw/main.tf`: Cloud Map `dns_records` A→**SRV** (was the prod bug: A gave the task IP
  but no port → API GW 500). `terraform plan` now clean.

### Deploy runbook (from this machine, `envs/prod-eu`)
- **Roll a new backend build**: backend pushes `vita-api:<sha>` → set `app_image_tag = "<sha>"` →
  `terraform apply`. (Terraform registers the new task-def revision and rolls the service.)
- **The SRV/registry gotcha**: if you ever change the Cloud Map service or the service_registries
  block, the old SDS won't delete while a task is registered. Scale the service to 0 first
  (`aws ecs update-service --cluster vita --service vita --desired-count 0`, wait for deregister),
  then apply. Normal image-tag rolls do NOT hit this.
- **Magic-link fishing** (CEO sign-in during testing):
  ```
  aws logs filter-log-events --log-group-name /ecs/vita --region eu-west-1 \
    --start-time $(($(date +%s000) - 600000)) --filter-pattern '"vita://auth"' \
    --query 'events[-1].message' --output text
  ```
  Prints `Magic link for <email>: vita://auth?token=…`. SES (OPS-012) stays backlog.

## Cost (monthly, ~5 users)
Fargate 0.25 vCPU / 1 GB ARM 24/7 ≈ $8.4 + 1 public IPv4 ≈ $3.6 + API GW/Cloud Map/CloudWatch ≈ $1,
on top of the ~$6 idle baseline (2 KMS CMKs, CloudTrail/GuardDuty/S3) → **≈ $19/mo while RDS is in
free tier**, rising to **≈ $34/mo** once the 12-month RDS free tier lapses (+db.t4g.micro ~$13 + 20 GB
gp3 ~$2). Under the $40 budget alarm.

## Docs + board (2026-07-15, post-deploy)
- **Notion prod doc written**: "Production — what's running & why" under the DevOps page
  (https://app.notion.com/p/39e213f6aff481628d49d95207772719) — operational source of truth,
  every ID cross-checked against live AWS/state. See `Progress/OPS-DOC-prod-Progress.md`.
- **Asana board swept to reality**: OPS-001/003/005/008/009/011/020 → Done (joining
  002/006/007/010/013/014). Open: OPS-004 (CEO negative tests), OPS-012, OPS-015, OPS-016, OPS-017.
- **Drift corrected in docs (read-only, no infra change)**: S3 exports lifecycle is 30d not 90d;
  uploads also 30d (photos expire monthly — flagged to CEO/backend below).

## Next steps / backlog (unchanged priority)
- **OPS-017** RDS restore-rehearsal (first backup lands from the `daily-45d` plan; rehearse a PITR restore).
- ~~**OPS-012** SES out of sandbox~~ → superseded by **OPS-023** (SES identity/IAM/SSM applied
  2026-07-20; still sandbox — production-access request is a later CEO decision, see OPS-023 ledger).
- **Observability ticket**: create the AMP workspace, finish the ADOT sidecar pipeline (currently
  essential=false, no remote_write config), tighten `aps:RemoteWrite` from `*` to the workspace ARN,
  point the CEO's local Grafana at AMP (ADR-0007).
- **OPS-004 Done**: CEO runs the PR/fork negative tests + no-op apply (roles + repo Variables now set).
- Rollback (circuit-breaker) + task-role negative tests for OPS-014 (nice-to-have; service is live).

## Open questions for the CEO
- **Public IPv4 cost**: the task runs in public subnets with `assign_public_ip=true` (no NAT, egress
  to Claude/ECR) → ~$3.6/mo for the public IP. Fine for cost, but if you'd rather, a NAT instance/GW
  is more expensive, so the public-IP approach stays the cheap choice. No action needed — flagging.
- **S3 uploads lifecycle = expire-30d**: user photos are deleted 30 days after upload. Confirm that
  matches product intent (Vita keeps a "quiet log" — do meal/photo entries need to survive past 30d?).
  If yes, raise/remove the lifecycle on `vita-prod-uploads-*` (a one-line tfvar, needs CEO OK to apply).
  (Exports staying at 30d is fine — they're regenerated on demand.)
- **google-/apple-client-config** SSM params now wired to the OIDC env (OPS-021) but hold the placeholder
  `REPLACE_ME_IN_CONSOLE`. To turn Google/Apple sign-in on: paste the real OAuth client ids into both
  SSM SecureStrings, then restart the ECS task (or let the next roll pick them up) — no terraform needed.
  Until then the OIDC endpoint returns 401 (fail-closed). Optional: backend can treat the placeholder as
  blank to restore the "not configured" 503 signal.
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger (still `vita://` scheme).

## Blockers
None. Backend is live and verified in production.
