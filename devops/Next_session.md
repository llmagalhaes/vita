# DevOps — Next session

## Current state (Phase 2 implementation, session 3 close — 2026-07-13)

**OPS-004 APPLIED + CLI-verified.** GitHub OIDC (no stored AWS keys) is live in AWS:
OIDC provider + `vita-ci-plan` (ReadOnlyAccess, PR-scoped) + `vita-ci-apply`
(PowerUserAccess + scoped IAM, pinned to `apply.yml`@main via `job_workflow_ref`).
`bootstrap apply` = 6 added / 0 / 0. Trust conditions verified via `aws iam get-role`.
Workflows in `.github/workflows/`: `terraform-pr.yml`, `terraform-main.yml`, `apply.yml`;
checkov gate `CKV_VITA_1/2`. Procedure in `devops/Doc/ci-oidc-verification.md`.
Role ARNs: `arn:aws:iam::201261380352:role/vita-ci-plan` and `.../vita-ci-apply`.
OPS-004 stays **In progress** until the CEO runs the PR/fork negative tests + no-op apply.

**CEO to finish OPS-004:** set repo Variables `AWS_PLAN_ROLE_ARN`=`.../vita-ci-plan`,
`AWS_APPLY_ROLE_ARN`=`.../vita-ci-apply`, `AWS_REGION`=`eu-west-1`; then positive +
negative tests per `ci-oidc-verification.md`.

**OPS-008/009/010/011 APPLIED + verified in prod (CEO-approved).** prod-eu apply =
27 added / 0 / 0. CLI-verified: RDS encrypted+private+force_ssl, ingress 5432 from app
SG only, AWS Backup `daily-45d`→vault `vita`; 7 SSM SecureStrings on storage CMK; S3
public-blocked + 30 d lifecycle; ECR scan-on-push/immutable/KMS. **OPS-008, OPS-011 →
Done.** OPS-009 In progress (first backup lands tomorrow; CEO sets RDS password +
db-credentials; **OPS-017** restore-rehearsal ticket created). OPS-010 In progress (CEO
pastes 7 real values; task-role read verified in OPS-014).

**OPS-013/014 APPLIED, then CEO PIVOT → milestone-only deploys; ECS PARKED at 0.**
apigw + ecs modules applied (19 add / 1 change). Then CEO changed policy (2026-07-13):
**development is local (docker-compose + bootRun); prod deploys only at milestones, not
per-ticket.** So the BE-004 first-deploy was **cancelled** (no image built/pushed) and I
set `module.ecs.desired_count = 0` (applied) → Fargate $0, no crash-loop.
- OPS-013 API GW live: `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/` (503 until
  a deploy milestone runs a real image). Cloud Map `vita.local`, VPC Link, app-SG ingress:8080.
- OPS-014 ECS cluster/service/roles/task-def applied but **parked** (desired_count 0).
- Foundational infra (RDS/SSM/S3/ECR/KMS/audit) stays applied as-is. CEO's SSM secret-paste
  + RDS-password steps are now **non-urgent** — only needed at the first real deploy milestone.
- Fixed a benign RDS param-group perpetual-diff (`apply_method=pending-reboot`) earlier.

**STOOD DOWN — no more prod work until the CEO calls a deploy milestone.**

## Prior state (session 2 close — 2026-07-13)

**First infra is LIVE in production.** Both applies were CEO-approved plan-by-plan (rule in force: every `terraform plan` is CEO-reviewed before its apply; CI will formalize this in OPS-004).

- **Bootstrap applied** (7/7): state bucket `vita-tfstate-201261380352` + budget `vita-monthly-total` ($40/mo, alerts to the CEO). State migrated to S3 (`bootstrap/terraform.tfstate`), post-migration plan drift-free, **native S3 locking verified** (concurrent plan got a 412 lock error). Local state files and consumed plan files deleted; `*.tfplan` added to `devops/.gitignore`.
- **prod-eu applied** (30/30): `vpc-0f0535c15f51f4b6c` (no NAT; **verified** db route table has no internet route — local + S3 endpoint only), app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`, 2 KMS CMKs (**rotation verified on**: storage `075c7c59-…`, app-data `ad35b909-…`), audit bucket `vita-audit-201261380352`, CloudTrail `vita-trail` (**IsLogging: true**), GuardDuty detector `ffe1dc3d5c63408dadb37638bb9069f7`.
- `devops/Doc/bootstrap-ids.md` written (account 201261380352, IAM `vita-admin`, eu-west-1, bucket, budget).
- **Asana**: OPS-002/005/006/007 → **Done**. OPS-003 stays In progress: CEO must eyeball the subscriber email in console → Billing → Budgets (alerts only send when thresholds trip).
- **Round 7 rule (CEO)**: every Asana ticket carries a `Model:` line (Sonnet = simple, Opus 4.8 = complex) — existing tickets updated by the orchestrator; include it on any new ticket we create.
- CLI identity: IAM `vita-admin` (root key gone). Repo on GitHub. Cost posture: free-tier credits as-is; $40 alarm live.

## Next steps — HELD until the CEO calls a deploy milestone

**At the first deploy milestone (resume the chain):**
1. BE-004: build backend arm64 image (`backend/services/vita-api/Dockerfile`, verified),
   `aws ecr get-login-password` → push to `…/vita-api` by git SHA.
2. CEO sets the RDS master password (console) + pastes 7 real SSM values (`/vita/prod/*`),
   db-credentials matching the RDS password.
3. Flip `module.ecs.desired_count` → 1; run Flyway one-off ECS task; roll the service.
4. Verify health 200 through `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`;
   hand the URL to the app team (APP-008); rollback + task-role negative tests.

**Independent of the milestone (can do anytime):**
- Finish OPS-004: CEO sets the 3 repo Variables + PR/fork negative tests + no-op apply.
- OPS-012 (SES sandbox), observability ticket (AMP + ADOT + alarms), OPS-016 (magic-link).

## Open questions for the CEO

- **container_port/secret env contract** (OPS-014): port 8080 + `/health` confirmed vs
  Dockerfile. Secret env names (VITA_JWT_SECRET, ANTHROPIC_API_KEY, DB_CREDENTIALS) are
  defaults — backend confirms/extends before OPS-014 apply.
- OPS-004: OK with apply role = PowerUserAccess + scoped IAM (no user/key creation), or want it tighter?
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger.
- Resolved this session: 45 d via AWS Backup + 14 d PITR (approved); cross-account copy
  deferred (approved); RDS password = placeholder + CEO console/SSM sync (approved).

## Blockers

- **OPS-014 apply** blocked on BE-004 (arm64 image in ECR). Everything else planned/applied.
- OPS-004 Done gated on CEO PR/fork negative tests + no-op apply (roles already applied).
