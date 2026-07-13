# OPS-002 · Terraform state backend — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216523338761960 · Status: **In progress** (code done, apply pending)

## 2026-07-13

- Written: `devops/services/terraform/bootstrap/` — S3 bucket `vita-tfstate-<account-id>` with versioning, SSE-S3, public-access block, TLS-only policy, 90 d noncurrent-version expiry, `prevent_destroy`. Native S3 lockfile (`use_lockfile = true`, no DynamoDB). Backend blocks committed for bootstrap (commented, migrate-after-first-apply) and `envs/prod-eu`.
- SSE-S3 instead of a CMK for state, deliberately: state is designed to hold no plaintext secrets (RDS master password will be RDS-managed). Noted in code.
- `terraform validate` + `fmt -check`: pass (Terraform 1.15.6).
- **Not applied** — the CLI currently holds a ROOT access key (security violation); remediation is step 0 of `devops/Doc/apply-runbook.md`, which also covers bootstrap apply → state migration.

Remaining for Done: CEO runs runbook steps 0–2; locking verified with a concurrent plan.
