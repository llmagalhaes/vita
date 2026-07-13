# DevOps — Next session

## Current state (Phase 2 implementation, session 2 close — 2026-07-13)

**First infra is LIVE in production.** Both applies were CEO-approved plan-by-plan (rule in force: every `terraform plan` is CEO-reviewed before its apply; CI will formalize this in OPS-004).

- **Bootstrap applied** (7/7): state bucket `vita-tfstate-201261380352` + budget `vita-monthly-total` ($40/mo, alerts to the CEO). State migrated to S3 (`bootstrap/terraform.tfstate`), post-migration plan drift-free, **native S3 locking verified** (concurrent plan got a 412 lock error). Local state files and consumed plan files deleted; `*.tfplan` added to `devops/.gitignore`.
- **prod-eu applied** (30/30): `vpc-0f0535c15f51f4b6c` (no NAT; **verified** db route table has no internet route — local + S3 endpoint only), app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`, 2 KMS CMKs (**rotation verified on**: storage `075c7c59-…`, app-data `ad35b909-…`), audit bucket `vita-audit-201261380352`, CloudTrail `vita-trail` (**IsLogging: true**), GuardDuty detector `ffe1dc3d5c63408dadb37638bb9069f7`.
- `devops/Doc/bootstrap-ids.md` written (account 201261380352, IAM `vita-admin`, eu-west-1, bucket, budget).
- **Asana**: OPS-002/005/006/007 → **Done**. OPS-003 stays In progress: CEO must eyeball the subscriber email in console → Billing → Budgets (alerts only send when thresholds trip).
- **Round 7 rule (CEO)**: every Asana ticket carries a `Model:` line (Sonnet = simple, Opus 4.8 = complex) — existing tickets updated by the orchestrator; include it on any new ticket we create.
- CLI identity: IAM `vita-admin` (root key gone). Repo on GitHub. Cost posture: free-tier credits as-is; $40 alarm live.

## Next steps

1. **OPS-004** — GitHub OIDC plan-only CI with CEO-gated `workflow_dispatch` apply, so the runbook becomes the last manual apply path; add the checkov 0.0.0.0/0-ingress rule there.
2. Close OPS-003 once the CEO confirms the budget subscriber email.
3. Queue: OPS-008 (ECR) → OPS-009 (RDS — blocked on the 14 d vs 35 d backup-retention decision) → OPS-010/011.

## Open questions for the CEO

- Confirm budget subscriber email in console → Billing → Budgets → `vita-monthly-total` (closes OPS-003).
- RDS backup retention: 14 d (devops) vs 35 d (backend ask) — needed before OPS-009.
- Carried: audit/log retention 400 d default; exports 90 d; domain-purchase trigger.

## Blockers

- None. OPS-004 is fully unblocked.
