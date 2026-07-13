# DevOps — Next session

## Current state (Phase 1 specification, 2026-07-13)

- **Backlog is ready**: 16 tickets OPS-001…OPS-016 created on the Asana devops board (project `1216519867368584`, section Backlog), in execution order: org bootstrap → state backend (S3 + native lockfile, no DynamoDB) → budgets → GitHub OIDC/CI gate → VPC → KMS (2 CMKs) → CloudTrail/GuardDuty → ECR → RDS → SSM secrets → S3 buckets → SES sandbox → API GW → ECS Fargate → AMP/Grafana → magic-link redirect. Backend kickoff-addendum §6 requests folded in (buckets = OPS-011, app-data CMK = OPS-006, task-role scoping = OPS-014; their SES-domain and Secrets-Manager asks superseded by Round 3 decisions and noted in the tickets).
- **Round 4**: the CEO's **existing AWS account becomes the management account** (Organizations enabled on it, `vita-prod` created from it). `docs/ceo-setup-guide.md` step 1 rewritten accordingly (root MFA check, prod account creation, local CLI profile — Identity Center `aws configure sso` preferred, admin IAM role fallback; credentials never in chat). Bundle ID references in the guide updated to the decided `com.vita`.
- **Free-tier caveat recorded**: free tier is org-wide, keyed to the oldest account — if the CEO's account is >12 months old, year 1 costs ~$37/mo (the year-2 figure), still under the $40 alarm. CEO to confirm account age with the step-1 hand-back.
- Nothing provisioned, no Terraform code written yet. Nothing applied.

## Next steps

1. **Blocked on the CEO's step-1 hand-back** to start OPS-001: CLI profile name + both account IDs + region (eu-west-1) + root-MFA confirmation → commit `devops/Doc/bootstrap-ids.md`.
2. Terraform code (modules + `envs/prod-eu` root) can be written before the hand-back; applies cannot.
3. Escalations riding with the orchestrator: (a) 2nd CMK (+$1/mo, backend §6.2) vs the 1-CMK cost line — recommended keep 2; (b) backup window 14d (ADR-0006) vs backend's 35d ask — reconcile with backend; (c) free-tier reality per above.

## Open questions for the CEO

- Confirm existing-account age (free-tier eligibility → honest year-1 estimate).
- OK with the 2nd KMS CMK (+$1/mo) for app-data envelope encryption?
- Carried over: domain-purchase trigger; retention windows (default 400 d logs / 90 d exports).

## Blockers

- CEO execution of setup-guide step 1 (AWS) — blocks OPS-001 and every apply after it.
