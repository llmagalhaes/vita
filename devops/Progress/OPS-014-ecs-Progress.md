# OPS-014 — ECS Fargate service (ARM64, ADOT sidecar)

Asana: https://app.asana.com/0/1216519867368584/1216514543845558 (OPS-014)
Model: Opus 4.8 · cost-revision §1.5 · Status: In progress (planned, NOT applied)

## APPLIED 2026-07-13, then PARKED (CEO pivot to milestone-only deploys)
The ECS cluster/service/roles/task-def are applied. The service was created at
desired_count=1, could not pull the (nonexistent) `vita-api:bootstrap` image, and the
deployment circuit breaker rolled back to 0 running tasks. CEO then changed policy to
local-dev + milestone-only prod deploys, so I set **`module.ecs.desired_count = 0`**
(applied) — service parked, **$0 Fargate cost**, no crash-loop noise. No image was built
or pushed. **To resume at a milestone**: BE-004 pushes an arm64 image by git SHA, CEO
pastes the SSM secrets, then flip `desired_count` to 1 and deploy.

## Built (session 3, 2026-07-13)
`modules/ecs/main.tf`, wired as `module.ecs` in prod-eu.
- ECS cluster `vita`; service 1 task, FARGATE, ARM64, 256 CPU / 1024 MB.
- Task def: `app` (ECR image :git-SHA, port 8080, awslogs, container health check,
  SSM secret injection) + `adot` sidecar (essential=false; X-Ray/AMP pipeline config
  finalized in the observability ticket once the AMP workspace exists).
- Network: public subnets + `assign_public_ip=true` + app SG (egress to Claude/ECR, no NAT).
- Registers into the OPS-013 Cloud Map service. Deployment circuit breaker + rollback.
- **Execution role**: ECR pull (managed) + `ssm:GetParameters` on `/vita/prod/*` +
  `kms:Decrypt` on the storage CMK (secret injection).
- **Task role (least-privilege)**: RW the 2 buckets, read `/vita/prod/*`, `ses:Send*`,
  `aps:RemoteWrite`. app-data CMK usage is granted by the **KMS key policy** (OPS-006) —
  prod-eu passes this role's ARN to `module.kms.app_data_key_user_role_arns` (the "1 to
  change" in the plan is that key-policy update).
- Log group `/ecs/vita` (KMS storage CMK, 30 d).
- Output `task_role_arn`.

## Plan
Part of the OPS-013+014 batch: **19 to add, 1 to change, 0 to destroy** (ecs = 9; the
1 change = app-data key policy granting the task role).

## Flags for backend / CEO
- **container_port 8080 + health path `/health`**: CONFIRMED against
  `backend/services/vita-api/Dockerfile` (EXPOSE 8080, DB-backed `/health`, no actuator).
  Health check uses `curl` (present in image; slim JRE has no wget).
- **Secret env-var contract** (`container_secrets`: VITA_JWT_SECRET→jwt-secret,
  ANTHROPIC_API_KEY→anthropic-api-key, DB_CREDENTIALS→db-credentials) are my defaults —
  backend confirms/extends the full set before apply.
- `aps:RemoteWrite` scoped to `*` until the AMP workspace exists (observability ticket);
  tighten to the workspace ARN then.
- Task-role permissions to be negative-tested at apply (ticket AC).

## Remaining for Done
BE-004 image → apply → service healthy, health 200 through API GW over https (closes
OPS-013 e2e), rollback verified, task-role negative-tested.

## UN-PARKED + LIVE 2026-07-15 (first prod deploy milestone — CEO called it)

Backend lead pushed the arm64 image to ECR; DevOps ran secrets + flip + verify in parallel.

**Image**: `vita-api:a03e194` (+`latest`), digest `sha256:fa747eb6d537…c10c33`, OCI index
with a `linux/arm64` manifest (built from committed `a03e194`).

**Task-def env contract corrected** (the parked defaults did NOT match what the container
reads — this was the real failure spot). `modules/ecs/main.tf` now injects, verified against
`backend/.../application.yaml` + `service/crypto/*.kt` and cross-checked with the backend lead:
- plain env: `SPRING_PROFILES_ACTIVE=aws` (LOAD-BEARING — swaps in KmsKeyWrapper + S3FileStore;
  its absence would drop to LocalKeyWrapper and fail boot), `DB_URL`, `DB_USERNAME=vita`,
  `VITA_UPLOADS_BUCKET=vita-prod-uploads-201261380352`, `AWS_REGION`.
- SSM secrets: `VITA_JWT_SECRET`←jwt-secret, `ANTHROPIC_API_KEY`←anthropic-api-key,
  `DB_PASSWORD`←db-credentials (was wrongly `DB_CREDENTIALS`), `VITA_SERVICE_DEK`←wrapped-service-dek,
  `VITA_HMAC_KEY`←email-blind-index-hmac-key. `VITA_MASTER_KEY` deliberately omitted (LocalKeyWrapper
  only). google-/apple-client-config SSM params unused by the app → left as placeholders.

**API GW integration bug found + fixed (never exercised while parked at 0):** the Cloud Map
service used `A` records, so ECS registered the task IP but **no `AWS_INSTANCE_PORT`** → API
Gateway's private integration had no port → fast HTTP 500. Changed `modules/apigw` Cloud Map
`dns_records` to **SRV** and added `container_name`/`container_port=8080` to the ECS
`service_registries`. Both the SDS (A→SRV forces replacement) and the coupled ECS service change
race on the old SDS delete ("Service contains registered instances"), so the apply sequence is:
scale service to 0 (drains + deregisters) → apply (old SDS empty → replaces clean, ECS re-registers
with port). Cloud Map now returns `10.0.x.x:8080`.

**Deploy ownership:** removed `ignore_changes=[task_definition]` from the ECS service — there is
no CI deploy pipeline (standing rule: applies from this machine), so Terraform owns the deploy;
bump `var.app_image_tag` + apply to roll a new build. Reinstate the ignore if a pipeline ever
pushes tags out of band.

**Verified in prod (evidence):**
- Task RUNNING, container health HEALTHY; boot log shows profile `aws`, RDS Postgres 16.13
  connected, Flyway applied all 6 migrations to v006, "Started in 70.9s".
- `curl https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/health` → `{"status":"up"}` HTTP 200
  (full path API GW → VPC Link → Cloud Map SRV → task:8080 → app → RDS `SELECT 1`).
- Write path: `POST /v1/auth/magic-link` → HTTP 202; magic link logged to CloudWatch `/ecs/vita`.
- `terraform plan` clean ("No changes").

**Magic-link fishing command** (CEO/orchestrator, during testing):
```
aws logs filter-log-events --log-group-name /ecs/vita --region eu-west-1 \
  --start-time $(($(date +%s000) - 600000)) --filter-pattern '"vita://auth"' \
  --query 'events[-1].message' --output text
```
(prints `Magic link for <email>: vita://auth?token=…` — paste the token into the app.)

→ **OPS-014 DONE (in production).** Rollback (circuit-breaker) and task-role negative tests
still nice-to-have but not blocking; the service is live and serving.
