# Apply Runbook — first Terraform bootstrap (human-run)

> Run by the CEO (or the orchestrator guiding him) on his Mac, in order.
> Written 2026-07-13 by team-lead-devops. Agents never run applies.
> Everything below is idempotent — safe to re-run a step that failed halfway.

## Step 0 — Root-key remediation (BLOCKING — do this before any apply)

The CLI is currently configured with a **root access key** (`aws sts get-caller-identity` shows `:root`). Root keys are unlimited, unauditable and unscopeable — our own baseline forbids them.

1. Sign in to the AWS **console as root** (account 201261380352).
2. Create admin access for daily/Terraform use — either (preferred) enable **IAM Identity Center** (region eu-west-1), create user `lucas` with the predefined `AdministratorAccess` permission set, then on the Mac run `aws configure sso` (profile name: `vita`); or (simpler fallback) IAM → Users → Create user `lucas-admin` → attach `AdministratorAccess` → enable console access + MFA → create one access key → `aws configure --profile vita`.
3. Verify the new profile works: `aws sts get-caller-identity --profile vita` — the ARN must show the new identity, **not** `:root`.
4. **Delete the root access key**: console (as root) → account menu → *Security credentials* → *Access keys* → deactivate, then delete. Also remove it locally: edit `~/.aws/credentials` and delete the old default entry.
5. Enable **MFA on the root user** (same Security credentials page) if not already on.
6. Confirm: `aws iam get-account-summary --profile vita` shows `AccountAccessKeysPresent: 0`.

CLI region note: the CLI default region is `eu-north-1`; Terraform pins `eu-west-1` itself (ADR-0002), so no change is required — but `aws configure set region eu-west-1 --profile vita` avoids surprises in ad-hoc CLI calls.

```sh
export AWS_PROFILE=vita   # every step below assumes this
cd <repo>/devops/services/terraform
```

## Step 1 — Bootstrap: state bucket + budgets (local state)

```sh
cd bootstrap
terraform init
terraform plan    # review: 1 bucket (+config) and 1 budget, nothing else
terraform apply
```

Creates `vita-tfstate-201261380352` (versioned, encrypted, TLS-only, public-blocked) and the $40/mo budget with alerts at 50/80/100% actual + 100% forecast to lucasmagalhaes2007@gmail.com.

## Step 2 — Migrate the bootstrap state into the bucket

```sh
# still in bootstrap/
# uncomment the backend block in backend.tf, then:
terraform init -migrate-state   # answer "yes" to copy state
rm terraform.tfstate terraform.tfstate.backup   # local copies no longer authoritative
```

## Step 3 — prod-eu stack: VPC, KMS, CloudTrail + GuardDuty

```sh
cd ../envs/prod-eu
terraform init    # backend is the bucket from step 1
terraform plan    # review: VPC/subnets/SGs, 2 KMS keys + aliases, audit bucket, trail, GuardDuty
terraform apply
```

## Step 4 — Verify (read-only)

```sh
terraform output
aws cloudtrail get-trail-status --name vita-trail --region eu-west-1   # IsLogging: true
aws guardduty list-detectors --region eu-west-1                        # one detector id
aws s3api get-bucket-versioning --bucket vita-tfstate-201261380352     # Enabled
```

Then hand back to the orchestrator: "bootstrap applied" + the profile name. Next infra session takes OPS-004 (CI plan/apply via GitHub OIDC) so future applies go through the gated workflow instead of this runbook.

## Rollback

Nothing here is destructive to data. `terraform destroy` is blocked on the state bucket, KMS keys and audit bucket (`prevent_destroy`) — deliberately. If a step 3 apply goes wrong, fix forward: adjust code, re-plan, re-apply.
