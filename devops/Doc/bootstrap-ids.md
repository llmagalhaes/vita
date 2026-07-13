# Bootstrap IDs (written 2026-07-13, after the first apply)

- AWS account: `201261380352` (dedicated to Vita, ADR-0010)
- CLI identity: IAM user `vita-admin` (default profile — no `--profile` needed; root key deleted per Round 6)
- Region: `eu-west-1`, pinned in Terraform (ADR-0002); CLI default region is eu-north-1 and is harmless
- Terraform state: S3 `vita-tfstate-201261380352`, native lockfile, SSE-S3; bootstrap state key `bootstrap/terraform.tfstate`, prod-eu key per `envs/prod-eu/backend.tf`
- Budget: `vita-monthly-total`, $40/mo, alerts to lucasmagalhaes2007@gmail.com

## CI OIDC (OPS-004, applied 2026-07-13)
- OIDC provider: `token.actions.githubusercontent.com` (aud `sts.amazonaws.com`)
- Plan role: `arn:aws:iam::201261380352:role/vita-ci-plan` (PR-scoped, ReadOnlyAccess)
- Apply role: `arn:aws:iam::201261380352:role/vita-ci-apply` (pinned to apply.yml@main)
- Repo Variables to set: `AWS_PLAN_ROLE_ARN`, `AWS_APPLY_ROLE_ARN`, `AWS_REGION=eu-west-1`

## App infra (OPS-008/009/010/011, applied 2026-07-13)
- ECR: `201261380352.dkr.ecr.eu-west-1.amazonaws.com/vita-api`
- RDS endpoint: `vita.c10cyc6g8s2h.eu-west-1.rds.amazonaws.com:5432` (db `vita`, user `vita`)
- AWS Backup vault: `vita` (daily `daily-45d`, delete_after 45d)
- SSM secrets path: `/vita/prod/*` (7 SecureString, storage CMK) — CEO pastes real values
- S3 buckets: `vita-prod-uploads-201261380352`, `vita-prod-exports-201261380352`

## Pending apply (OPS-013/014, planned 2026-07-13)
- API Gateway URL: known after OPS-013 apply → record here + hand to app team
- ECS task role: `arn:aws:iam::201261380352:role/vita-ecs-task` (once applied)
