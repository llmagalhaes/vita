# Bootstrap IDs (written 2026-07-13, after the first apply)

- AWS account: `201261380352` (dedicated to Vita, ADR-0010)
- CLI identity: IAM user `vita-admin` (default profile — no `--profile` needed; root key deleted per Round 6)
- Region: `eu-west-1`, pinned in Terraform (ADR-0002); CLI default region is eu-north-1 and is harmless
- Terraform state: S3 `vita-tfstate-201261380352`, native lockfile, SSE-S3; bootstrap state key `bootstrap/terraform.tfstate`, prod-eu key per `envs/prod-eu/backend.tf`
- Budget: `vita-monthly-total`, $40/mo, alerts to lucasmagalhaes2007@gmail.com
