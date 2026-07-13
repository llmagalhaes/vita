# ADR-0008 — CI/CD on GitHub Free: plan-only CI, CEO workflow_dispatch apply

**Status**: Accepted 2026-07-13

## Context

CEO Round 3 decision #4: GitHub Free — no paid Environment approvals. Applies must still be impossible without the CEO, and CI must never hold AWS keys.

## Decision

- **No stored AWS keys**: GitHub OIDC provider, two IAM roles. *Plan* role: read-only, trust `sub` scoped to this repo's pull requests. *Apply* role: trust policy pins repo + `refs/heads/main` + (via customized `sub` including `job_workflow_ref`) the exact `.github/workflows/apply.yml` — no other workflow, branch, or fork can assume it.
- **PR**: fmt/validate/tflint/checkov + `terraform plan` (plan role). **Merge to `main`**: plan runs again, plan file saved as artifact.
- **Apply**: CEO-triggered `workflow_dispatch` taking the plan run's ID; downloads that artifact and runs `terraform apply saved.tfplan`. Stale plan (state drifted) ⇒ Terraform refuses. What the CEO reviewed is exactly what applies. Private repo ⇒ only collaborators (the CEO) can dispatch.
- `prevent_destroy` on DB/S3/KMS/API GW.

## Consequences

Enforced branch protection on a Free **private** repo isn't available; compensating controls: sole collaborator, PR-plan review habit, apply role pinned as above. If a second human collaborator joins, upgrade to Team ($4/mo) and enable protection that day.
