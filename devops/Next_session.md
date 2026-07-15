# DevOps — Next session

## Current state (BACKEND IS LIVE IN PRODUCTION — 2026-07-15)

**First prod deploy milestone DONE.** The CEO called "subir o backend em produção"; backend lead
pushed the arm64 image and DevOps un-parked the infra in parallel. The API is serving.

- **API base URL** (hand to the app / CEO): `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`
  - `GET /health` → `{"status":"up"}` HTTP 200 (verified end-to-end: API GW → VPC Link → Cloud Map
    SRV → Fargate task:8080 → app → RDS `SELECT 1`).
- **Image**: `vita-api:a03e194` (+`latest`), digest `sha256:fa747eb6d537…c10c33`, linux/arm64.
- **ECS**: cluster/service `vita`, 1 Fargate task (256 CPU / 1024 MB, ARM64) RUNNING + HEALTHY,
  `module.ecs.desired_count = 1`. App boots under Spring profile `aws` (KmsKeyWrapper + S3FileStore),
  Flyway migrated RDS to v006 on first boot.
- **RDS**: master password set via CLI, mirrored into SSM `db-credentials`. Connected over TLS.
- **Secrets**: 5 app-consumed SSM SecureStrings filled from this machine (jwt, service-dek, hmac,
  anthropic real key, db-credentials). `google-/apple-client-config` left placeholder (app doesn't
  read them — no OAuth). See `Progress/OPS-010-ssm-Progress.md`.
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

## Next steps / backlog (unchanged priority)
- **OPS-017** RDS restore-rehearsal (first backup lands from the `daily-45d` plan; rehearse a PITR restore).
- **OPS-012** SES out of sandbox (real magic-link email; today it's CloudWatch only).
- **Observability ticket**: create the AMP workspace, finish the ADOT sidecar pipeline (currently
  essential=false, no remote_write config), tighten `aps:RemoteWrite` from `*` to the workspace ARN,
  point the CEO's local Grafana at AMP (ADR-0007).
- **OPS-004 Done**: CEO runs the PR/fork negative tests + no-op apply (roles + repo Variables now set).
- Rollback (circuit-breaker) + task-role negative tests for OPS-014 (nice-to-have; service is live).

## Open questions for the CEO
- **Public IPv4 cost**: the task runs in public subnets with `assign_public_ip=true` (no NAT, egress
  to Claude/ECR) → ~$3.6/mo for the public IP. Fine for cost, but if you'd rather, a NAT instance/GW
  is more expensive, so the public-IP approach stays the cheap choice. No action needed — flagging.
- **google-/apple-client-config** SSM params are placeholders and unused (no OAuth wired). Keep or drop?
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger (still `vita://` scheme).

## Blockers
None. Backend is live and verified in production.
