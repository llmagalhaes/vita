# Vita Terraform

Layout (ADR-0002 — region-agnostic, modules + thin roots):

```
bootstrap/        # apply-once, LOCAL state first: state bucket (OPS-002) + budgets (OPS-003)
modules/
  network/        # VPC, no-NAT subnets, SGs (OPS-005, ADR-0004)
  kms/            # storage + app-data CMKs (OPS-006)
  audit/          # CloudTrail + GuardDuty + audit bucket (OPS-007)
envs/prod-eu/     # the production root (eu-west-1). prod-br later = copy + tfvars.
```

Rules:

- `var.aws_region` is the only place a region is named (backend blocks excepted — they can't interpolate).
- No hardcoded AZs/ARNs/account IDs in modules — composed from data sources.
- State: S3 `vita-tfstate-<account-id>` with native lockfile (`use_lockfile`, Terraform >= 1.10). No DynamoDB.
- **Never `terraform apply` from an agent session.** Applies are run by the CEO per `devops/Doc/apply-runbook.md` (later: the gated CI workflow, OPS-004).

Local checks: `terraform fmt -recursive -check` and, per root, `terraform init -backend=false && terraform validate`.
