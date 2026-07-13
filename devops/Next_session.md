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

**OPS-008/009/010/011 written + planned (NOT applied — awaiting CEO OK).** New modules
`ecr`, `rds`, `ssm`, `storage` wired into prod-eu. `terraform -chdir=envs/prod-eu plan`
= **27 to add, 0 change, 0 destroy** (ecr 2 · rds 8 · ssm 7 · storage 10); existing
network/kms/audit untouched. Highlights:
- OPS-008 ECR: immutable tags, scan-on-push, KMS, keep-last-10.
- OPS-009 RDS pg16 t4g.micro single-AZ 20 GB, storage CMK, force_ssl, deletion
  protection + prevent_destroy. **Backup retention 45 d via AWS Backup vault**
  (RDS automated caps at 35 d) + 14 d PITR. Cross-account copy DEFERRED (single
  account). Master password = placeholder + ignore_changes (see flag below).
- OPS-010 SSM: 7 SecureString under `/vita/prod/` incl. `jwt-secret` (VITA_JWT_SECRET);
  placeholders + ignore_changes; CEO pastes real values.
- OPS-011 S3: `vita-prod-uploads-<acct>` + `vita-prod-exports-<acct>`, SSE-KMS,
  public-access blocked, TLS-only, expire 30 d, prevent_destroy.

## Prior state (session 2 close — 2026-07-13)

**First infra is LIVE in production.** Both applies were CEO-approved plan-by-plan (rule in force: every `terraform plan` is CEO-reviewed before its apply; CI will formalize this in OPS-004).

- **Bootstrap applied** (7/7): state bucket `vita-tfstate-201261380352` + budget `vita-monthly-total` ($40/mo, alerts to the CEO). State migrated to S3 (`bootstrap/terraform.tfstate`), post-migration plan drift-free, **native S3 locking verified** (concurrent plan got a 412 lock error). Local state files and consumed plan files deleted; `*.tfplan` added to `devops/.gitignore`.
- **prod-eu applied** (30/30): `vpc-0f0535c15f51f4b6c` (no NAT; **verified** db route table has no internet route — local + S3 endpoint only), app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`, 2 KMS CMKs (**rotation verified on**: storage `075c7c59-…`, app-data `ad35b909-…`), audit bucket `vita-audit-201261380352`, CloudTrail `vita-trail` (**IsLogging: true**), GuardDuty detector `ffe1dc3d5c63408dadb37638bb9069f7`.
- `devops/Doc/bootstrap-ids.md` written (account 201261380352, IAM `vita-admin`, eu-west-1, bucket, budget).
- **Asana**: OPS-002/005/006/007 → **Done**. OPS-003 stays In progress: CEO must eyeball the subscriber email in console → Billing → Budgets (alerts only send when thresholds trip).
- **Round 7 rule (CEO)**: every Asana ticket carries a `Model:` line (Sonnet = simple, Opus 4.8 = complex) — existing tickets updated by the orchestrator; include it on any new ticket we create.
- CLI identity: IAM `vita-admin` (root key gone). Repo on GitHub. Cost posture: free-tier credits as-is; $40 alarm live.

## Next steps

1. **CEO approves the OPS-008/009/010/011 batch plan** (27 add / 0 / 0). Then apply —
   via `apply.yml` once OPS-004 CI is CEO-verified, or locally against S3 state meanwhile.
2. Finish OPS-004: CEO sets the 3 repo Variables + runs PR/fork negative tests + no-op apply.
3. Post-apply setup (CEO): paste real SSM values; set the RDS master password in console
   AND matching `/vita/prod/db-credentials`; create the quarterly RDS restore-rehearsal ticket.
4. Then OPS-013 (API Gateway HTTP API + VPC Link) → OPS-014 (ECS Fargate, task-role
   least-privilege scoping to the SSM path / buckets / app-data CMK) → unblocks BE-004.
5. Close OPS-003 — already CEO-confirmed in Round 8 (#2); move to Done if not already.

## Open questions for the CEO

- **OPS-009 backups**: 45 d is delivered by AWS Backup (RDS caps at 35 d), same-account
  only (cross-account copy deferred, ADR-0010). OK? PITR window set to 14 d — OK?
- **OPS-009/010 DB password sync**: app reads DB creds from SSM (`db-credentials`), so
  after apply you set the RDS password in console AND paste the same value into that SSM
  param. OK, or should we use RDS-managed password (needs backend to read Secrets Manager)?
- OPS-004: OK with apply role = PowerUserAccess + scoped IAM (no user/key creation), or want it tighter? (see Progress file)
- RDS backup retention: **DECIDED 45 d (Round 8)** — implemented via AWS Backup. (Stale 14/35 split retired.)
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger.

## Blockers

- OPS-008/009/010/011 apply is gated on CEO plan approval (by design) — no engineering blockers.
- OPS-004 Done gated on CEO PR/fork negative tests + no-op apply (roles already applied).
