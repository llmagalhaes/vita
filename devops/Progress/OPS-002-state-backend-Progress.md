# OPS-002 · Terraform state backend — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216523338761960 · Status: **Done** (applied 2026-07-13, locking verified)

## 2026-07-13

- Written: `devops/services/terraform/bootstrap/` — S3 bucket `vita-tfstate-<account-id>` with versioning, SSE-S3, public-access block, TLS-only policy, 90 d noncurrent-version expiry, `prevent_destroy`. Native S3 lockfile (`use_lockfile = true`, no DynamoDB). Backend blocks committed for bootstrap (commented, migrate-after-first-apply) and `envs/prod-eu`.
- SSE-S3 instead of a CMK for state, deliberately: state is designed to hold no plaintext secrets (RDS master password will be RDS-managed). Noted in code.
- `terraform validate` + `fmt -check`: pass (Terraform 1.15.6).
- **Not applied** — the CLI currently holds a ROOT access key (security violation); remediation is step 0 of `devops/Doc/apply-runbook.md`, which also covers bootstrap apply → state migration.

Remaining for Done: CEO runs runbook steps 0–2; locking verified with a concurrent plan.

## 2026-07-13 (session 2)

- Root-key blocker RESOLVED (Round 6): `aws sts get-caller-identity` now shows `arn:aws:iam::201261380352:user/vita-admin`. Runbook step 0 satisfied.
- `terraform init` + `plan` run for `bootstrap/` (local state): **7 to add, 0 change, 0 destroy** — bucket `vita-tfstate-201261380352` (+ versioning, SSE-S3, public-block, TLS-only policy, lifecycle) and the $40 budget. Plan saved to `bootstrap.tfplan`; no surprises.
- Awaiting CEO approval of the plan before apply (hard rule: every plan is CEO-reviewed before its apply).
- **CEO APPROVED → APPLIED**: 7 added, 0 changed, 0 destroyed. Bucket `vita-tfstate-201261380352` live.
- **State migrated** (runbook step 2): backend block uncommented in `backend.tf`, `init -migrate-state` run, state object verified in bucket (`bootstrap/terraform.tfstate`, SSE AES256), post-migration `plan`: no changes (no drift). Local `terraform.tfstate*` and consumed `bootstrap.tfplan` deleted.
- **Locking verified**: two concurrent plans — second failed with `Error acquiring the state lock` (S3 412 on the lockfile). Native S3 locking works.
- **DONE — in production.** Bucket live, state migrated, drift-free plan, locking verified.
