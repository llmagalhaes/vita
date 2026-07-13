# DevOps — Next session

## Current state (Phase 2 implementation, session 3 close — 2026-07-13)

**OPS-004 codified + planned, awaiting CEO apply.** GitHub OIDC (no stored AWS keys):
`bootstrap/cicd.tf` adds the OIDC provider + `vita-ci-plan` (ReadOnlyAccess, PR-scoped)
+ `vita-ci-apply` (PowerUserAccess + scoped IAM, pinned to `apply.yml`@main via
`job_workflow_ref`). Workflows in `.github/workflows/`: `terraform-pr.yml`
(fmt/validate/tflint/checkov + read-only plan), `terraform-main.yml` (plan + upload
artifact), `apply.yml` (CEO `workflow_dispatch`, applies the reviewed `tfplan`).
checkov custom gate `CKV_VITA_1/2` (no 0.0.0.0/0 or ::/0 SG ingress) hard-fails PRs;
negative-test fixture + full procedure in `devops/Doc/ci-oidc-verification.md`.
`terraform -chdir=bootstrap plan` = **6 to add, 0 change, 0 destroy**; nothing applied
(CEO-gated). OPS-004 stays **In progress** until applied + verified.

**CEO must, to close OPS-004:** (1) `terraform apply` the bootstrap stack; (2) set repo
Variables `AWS_PLAN_ROLE_ARN`/`AWS_APPLY_ROLE_ARN`/`AWS_REGION`; (3) run positive +
negative tests (incl. one no-op apply end to end) per `ci-oidc-verification.md`.

## Prior state (session 2 close — 2026-07-13)

**First infra is LIVE in production.** Both applies were CEO-approved plan-by-plan (rule in force: every `terraform plan` is CEO-reviewed before its apply; CI will formalize this in OPS-004).

- **Bootstrap applied** (7/7): state bucket `vita-tfstate-201261380352` + budget `vita-monthly-total` ($40/mo, alerts to the CEO). State migrated to S3 (`bootstrap/terraform.tfstate`), post-migration plan drift-free, **native S3 locking verified** (concurrent plan got a 412 lock error). Local state files and consumed plan files deleted; `*.tfplan` added to `devops/.gitignore`.
- **prod-eu applied** (30/30): `vpc-0f0535c15f51f4b6c` (no NAT; **verified** db route table has no internet route — local + S3 endpoint only), app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`, 2 KMS CMKs (**rotation verified on**: storage `075c7c59-…`, app-data `ad35b909-…`), audit bucket `vita-audit-201261380352`, CloudTrail `vita-trail` (**IsLogging: true**), GuardDuty detector `ffe1dc3d5c63408dadb37638bb9069f7`.
- `devops/Doc/bootstrap-ids.md` written (account 201261380352, IAM `vita-admin`, eu-west-1, bucket, budget).
- **Asana**: OPS-002/005/006/007 → **Done**. OPS-003 stays In progress: CEO must eyeball the subscriber email in console → Billing → Budgets (alerts only send when thresholds trip).
- **Round 7 rule (CEO)**: every Asana ticket carries a `Model:` line (Sonnet = simple, Opus 4.8 = complex) — existing tickets updated by the orchestrator; include it on any new ticket we create.
- CLI identity: IAM `vita-admin` (root key gone). Repo on GitHub. Cost posture: free-tier credits as-is; $40 alarm live.

## Next steps

1. **OPS-004** — CEO applies bootstrap + wires repo vars + runs verification (above). Then move to Done.
2. Once the CI apply path is live, all remaining infra applies flow through `apply.yml` (no more runbook).
3. Queue (all depend on OPS-004's apply path): OPS-008 (ECR) → OPS-009 (RDS — blocked on the 14 d vs 35 d backup-retention decision) → OPS-010/011/013/014 → unblocks BE-004.
4. Close OPS-003 once the CEO confirms the budget subscriber email.

## Open questions for the CEO

- OPS-004: OK with apply role = PowerUserAccess + scoped IAM (no user/key creation), or want it tighter? (see Progress file)
- Confirm budget subscriber email in console → Billing → Budgets → `vita-monthly-total` (closes OPS-003).
- RDS backup retention: 14 d (devops) vs 35 d (backend ask) — needed before OPS-009.
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger.

## Blockers

- OPS-004 Done is gated on the CEO apply + verification (by design). No engineering blockers.
- OPS-008+ effectively wait on OPS-004's apply path being live.
