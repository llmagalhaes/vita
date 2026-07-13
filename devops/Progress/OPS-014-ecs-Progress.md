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
