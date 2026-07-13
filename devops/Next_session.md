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

**OPS-013/014 written + planned (NOT applied — awaiting CEO OK).** New modules `apigw`,
`ecs`. `plan` = **19 to add, 1 to change, 0 to destroy** (apigw 10 · ecs 9; the 1 change
= app-data CMK key policy granting the ECS task role).
- OPS-013 API GW HTTP API + VPC Link + Cloud Map `vita.local`; adds the app SG's only
  ingress (from VPC-Link SG, port 8080); `prevent_destroy` on the API. Apply-ready
  independent of the image.
- OPS-014 ECS Fargate ARM64 (app + ADOT sidecar), circuit-breaker rollback, health
  check `curl /health:8080` (confirmed vs backend Dockerfile). Least-privilege task role
  (2 buckets, `/vita/prod/*`, SES, aps:RemoteWrite; app-data CMK via key policy).
  **APPLY BLOCKED on BE-004 pushing the arm64 image to ECR** — plan is image-agnostic.
- Also fixed a benign RDS param-group perpetual-diff (`apply_method=pending-reboot`).

## Prior state (session 2 close — 2026-07-13)

**First infra is LIVE in production.** Both applies were CEO-approved plan-by-plan (rule in force: every `terraform plan` is CEO-reviewed before its apply; CI will formalize this in OPS-004).

- **Bootstrap applied** (7/7): state bucket `vita-tfstate-201261380352` + budget `vita-monthly-total` ($40/mo, alerts to the CEO). State migrated to S3 (`bootstrap/terraform.tfstate`), post-migration plan drift-free, **native S3 locking verified** (concurrent plan got a 412 lock error). Local state files and consumed plan files deleted; `*.tfplan` added to `devops/.gitignore`.
- **prod-eu applied** (30/30): `vpc-0f0535c15f51f4b6c` (no NAT; **verified** db route table has no internet route — local + S3 endpoint only), app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`, 2 KMS CMKs (**rotation verified on**: storage `075c7c59-…`, app-data `ad35b909-…`), audit bucket `vita-audit-201261380352`, CloudTrail `vita-trail` (**IsLogging: true**), GuardDuty detector `ffe1dc3d5c63408dadb37638bb9069f7`.
- `devops/Doc/bootstrap-ids.md` written (account 201261380352, IAM `vita-admin`, eu-west-1, bucket, budget).
- **Asana**: OPS-002/005/006/007 → **Done**. OPS-003 stays In progress: CEO must eyeball the subscriber email in console → Billing → Budgets (alerts only send when thresholds trip).
- **Round 7 rule (CEO)**: every Asana ticket carries a `Model:` line (Sonnet = simple, Opus 4.8 = complex) — existing tickets updated by the orchestrator; include it on any new ticket we create.
- CLI identity: IAM `vita-admin` (root key gone). Repo on GitHub. Cost posture: free-tier credits as-is; $40 alarm live.

## Next steps

1. **CEO approves the OPS-013/014 plan** (19 add / 1 change / 0 destroy). Then apply
   OPS-013 (API GW — image-independent); **OPS-014 apply waits on BE-004 pushing the
   arm64 image to ECR**. After OPS-014: e2e health 200 over https, rollback + task-role
   negative tests.
2. Finish OPS-004: CEO sets the 3 repo Variables + runs PR/fork negative tests + no-op apply.
3. Post-apply setup (CEO): paste 7 real SSM values; set the RDS master password in console
   AND matching `/vita/prod/db-credentials`. Verify tomorrow that the first AWS Backup ran.
4. Record the API GW URL in bootstrap-ids.md + hand to the app team once OPS-013 applies.
5. Remaining infra: OPS-012 (SES sandbox + tester identities) → observability ticket
   (AMP workspace + ADOT config + CloudWatch alarms; scope `aps:RemoteWrite` to it then)
   → OPS-016 (magic-link redirect, backend-owned route).

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
