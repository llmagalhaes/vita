# OPS-004 — CI OIDC: post-apply setup + verification procedure

> Written 2026-07-13 by team-lead-devops. The OIDC resources live in the
> **bootstrap** stack and are applied by the CEO from his Mac (like the state
> bucket — CI can't create the roles CI uses). ADR-0008.

## Step 1 — Apply the roles (CEO, human-run)

```sh
export AWS_PROFILE=vita
cd <repo>/devops/services/terraform/bootstrap
terraform plan     # expect: 6 to add, 0 change, 0 destroy (OIDC provider + 2 roles + 3 policies)
terraform apply
terraform output   # note ci_plan_role_arn and ci_apply_role_arn
```

## Step 2 — Wire GitHub repo Variables (CEO, one-time)

GitHub → repo **Settings → Secrets and variables → Actions → Variables** (NOT
Secrets — these are ARNs, not credentials). Add three **repository variables**:

| Variable | Value |
|---|---|
| `AWS_PLAN_ROLE_ARN`  | `ci_plan_role_arn` output (`arn:aws:iam::201261380352:role/vita-ci-plan`) |
| `AWS_APPLY_ROLE_ARN` | `ci_apply_role_arn` output (`arn:aws:iam::201261380352:role/vita-ci-apply`) |
| `AWS_REGION`         | `eu-west-1` |

No AWS access keys are ever stored in GitHub — the workflows mint short-lived
credentials via OIDC at run time.

## Step 3 — Positive tests

1. **PR plan works**: open a PR touching `devops/services/terraform/**`. The
   `terraform-pr` workflow must go green — `checks` (fmt/validate/tflint/checkov)
   and `plan` (assumes the read-only plan role via OIDC, no keys).
2. **Apply works end to end (the CEO no-op apply)**: merge a trivial no-op PR to
   `main` → `terraform-main` runs, uploads artifact `tfplan-prod-eu`, note its
   **run ID**. Then Actions → `apply` → *Run workflow* → paste the run ID. It
   downloads that exact plan and applies it. A no-op plan applies with 0 changes.

## Step 4 — Negative tests (the security gate — run these after apply)

The apply role's trust policy requires ALL of: `aud = sts.amazonaws.com`,
`sub = repo:llmagalhaes/vita:ref:refs/heads/main`, and
`job_workflow_ref = llmagalhaes/vita/.github/workflows/apply.yml@refs/heads/main`.
Each test below breaks one condition and must fail with **AccessDenied /
`Not authorized to perform sts:AssumeRoleWithWebIdentity`**.

1. **Apply role NOT assumable from a PR branch.** On a throwaway branch, open a PR
   that adds a step to `terraform-pr.yml`'s `plan` job attempting to assume the
   *apply* role:
   ```yaml
   - uses: aws-actions/configure-aws-credentials@v4
     with:
       role-to-assume: ${{ vars.AWS_APPLY_ROLE_ARN }}
       aws-region: ${{ vars.AWS_REGION }}
   ```
   Expected: the step FAILS — the token's `sub` is `...:pull_request`, not
   `...:ref:refs/heads/main`, and `job_workflow_ref` is `terraform-pr.yml`, not
   `apply.yml`. Two conditions violated. Delete the branch after.

2. **Apply role NOT assumable from another workflow on main.** `terraform-main.yml`
   runs on `main` but uses the *plan* role. Temporarily point its
   `role-to-assume` at `AWS_APPLY_ROLE_ARN`, push to main: the job FAILS because
   `job_workflow_ref` is `terraform-main.yml`, not `apply.yml`. Revert immediately.
   (This proves branch access alone is not enough — the exact workflow file is pinned.)

3. **Apply role NOT assumable from a fork.** A fork PR's workflow gets a read-only
   `GITHUB_TOKEN` and **no** `id-token`, so `configure-aws-credentials` cannot even
   request a web-identity token. The `plan` job is additionally skipped by its
   `if: head.repo.full_name == github.repository` guard. Confirm a fork PR shows the
   `plan` job skipped and no AWS credentials are ever issued.

4. **checkov no-public-ingress gate.** From repo root:
   ```sh
   pip install checkov
   checkov -d devops/services/ci/checkov/tests \
     --external-checks-dir devops/services/ci/checkov \
     --check CKV_VITA_1,CKV_VITA_2
   ```
   Expected: `CKV_VITA_1` **FAILED** on `aws_vpc_security_group_ingress_rule.bad`
   (0.0.0.0/0). This is the same gate that runs hard-fail in `terraform-pr` against
   the real stack, satisfying OPS-005's acceptance criterion.

## Notes

- Plan CI runs `terraform plan -lock=false`, so the plan role is genuinely
  read-only (no state write, no lock object) → `ReadOnlyAccess` is sufficient.
- `apply.yml` checks out the exact commit the plan was built from (`PLAN_SHA` in
  the artifact); if state drifted since the plan, Terraform rejects the stale plan
  — the CEO always applies exactly what he reviewed.
