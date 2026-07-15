# OPS-021 — Redeploy `909262c` (BE-007 OIDC + BE-029 muscles) + wire OIDC env

Asana: Vita devops board `1216519867368584` (deploy roll, no dedicated ticket — logged here).
Date: 2026-07-15.

## What shipped
- **Image roll**: `vita-api:a03e194` → **`909262c`** (arm64, digest
  `sha256:108eaab9b70e9230cef7a177733752ddfb279a2ce704a327ded39b7663b5af06`). Carries BE-007
  (Google/Apple OIDC sign-in), BE-029 (per-exercise muscles), Jackson convergence.
- **OIDC env wired** (new, required by BE-007): two SSM→env mappings added to the ECS task-def,
  same env-from-SSM-secret shape as the crypto params (`modules/ecs/main.tf` `container_secrets`):
  - `GOOGLE_OIDC_AUDIENCE` ← SSM `/vita/prod/google-client-config`
  - `APPLE_OIDC_AUDIENCE`  ← SSM `/vita/prod/apple-client-config`
  App reads `${GOOGLE_OIDC_AUDIENCE:}` / `${APPLE_OIDC_AUDIENCE:}` (application.yaml `oidc.*.audience`).
  Execution role already reads the `/vita/prod/*` glob + decrypts with the storage CMK → **no IAM change**.

## Terraform
- `envs/prod-eu/variables.tf`: `app_image_tag` default `a03e194` → `909262c`.
- `modules/ecs/main.tf`: added the two OIDC entries to `container_secrets` + refreshed the header comment.
- **Plan**: exactly `module.ecs.aws_ecs_task_definition.this` replaced (new revision) +
  `module.ecs.aws_ecs_service.this` updated in place. No RDS/S3/KMS/Cloud Map/network churn. Applied.

## Verification
- Service now on task-def **`vita:3`**; single deployment `COMPLETED`; only `vita:3` ACTIVE (old drained).
- Running task: RUNNING + HEALTHY, image `909262c`, digest `sha256:108eaab9…b5af06`.
- `GET /health` via API GW → **HTTP 200** `{"status":"up"}`.
- **Flyway V007 applied** (boot log, /ecs/vita):
  `Migrating schema "public" to version "007 - oidc identity"` → `Successfully applied 1 migration … now at version v007`.
- `POST /v1/auth/oidc` (dummy body) → **HTTP 401** `{"detail":"Id token failed verification."…"instance":"/v1/auth/oidc"}`.
  Endpoint is deployed (NOT 404) and fails closed (no token accepted). See caveat below.

## Caveat — 401 not 503 while SSM is a placeholder (flag for CEO)
The brief predicted 503 while the OIDC params are unconfigured. Actual: **401**. Root cause: the
backend's fail-closed 503 fires only when the audience `isBlank()` (`OidcVerifier.kt:98`). The SSM
placeholder value is the non-empty string `REPLACE_ME_IN_CONSOLE`, so once wired the audience is
"configured" (to a bogus value) → the verifier proceeds and rejects the dummy token with 401.
- **Still safe / still fail-closed**: no unverified token is ever accepted. A real Google/Apple token
  won't carry `aud = "REPLACE_ME_IN_CONSOLE"` either, so it too gets 401 until the real client id is set.
- **Goal met**: when the CEO pastes real client ids into SSM `google-client-config` /
  `apple-client-config`, the next task start picks them up — **no terraform apply / redeploy needed**.
- The only lost nuance is the "feature not configured" 503 signal (now 401) during the placeholder
  window. Cheap backend fix if the CEO wants the 503 back: treat the `REPLACE_ME_IN_CONSOLE` sentinel
  as blank (not devops's remit; noted for backend). No infra action.

## Cost
Unchanged. Same task size (256 CPU / 1024 MB ARM64, 1 task). ~$19/mo (free-tier RDS) / ~$34/mo post
free tier. Two extra SSM SecureString reads at task start = free (standard tier).
