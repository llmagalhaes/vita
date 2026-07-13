# OPS-004 — GitHub OIDC roles + plan-only CI + CEO-gated apply

Asana: https://app.asana.com/0/1216519867368584/1216523339228962
Model: Opus 4.8 · ADR-0008 · Status: In progress (codified + planned; CEO apply pending)

## What was built (session 3, 2026-07-13)

Terraform (in the **bootstrap** stack — account-level, apply-once, manually
applied; CI can't create the roles CI uses):

- `bootstrap/cicd.tf` — GitHub OIDC provider (`token.actions.githubusercontent.com`,
  aud `sts.amazonaws.com`) + two roles:
  - `vita-ci-plan`: `ReadOnlyAccess`; trust `sub = repo:llmagalhaes/vita:pull_request`.
  - `vita-ci-apply`: `PowerUserAccess` + inline IAM-management policy (roles/policies/
    instance-profiles/OIDC/PassRole — **no user/access-key creation**); trust pins
    `sub = ...:ref:refs/heads/main` **and** `job_workflow_ref = .../apply.yml@refs/heads/main`.
- `bootstrap/variables.tf` — `github_repo = "llmagalhaes/vita"`.
- `bootstrap/outputs.tf` — `ci_plan_role_arn`, `ci_apply_role_arn`.

GitHub Actions (`.github/workflows/`):
- `terraform-pr.yml` — PR: `checks` job (fmt -check / validate -backend=false /
  tflint / checkov, no AWS) + `plan` job (OIDC plan role, `plan -lock=false`;
  skipped for forks).
- `terraform-main.yml` — push to main: plan with the read-only role, upload
  `tfplan` + `tfplan.txt` + `PLAN_SHA` as artifact `tfplan-prod-eu`.
- `apply.yml` — `workflow_dispatch(plan_run_id)`: downloads that run's artifact,
  checks out the exact `PLAN_SHA`, assumes the apply role, `apply tfplan`.

checkov custom gate (`devops/services/ci/checkov/`):
- `CKV_VITA_1` (cidr_ipv4) + `CKV_VITA_2` (cidr_ipv6) — hard-fail on any SG
  **ingress** opening `0.0.0.0/0` / `::/0`. Hard-fail list also includes built-ins
  CKV_AWS_24/25/260; everything else soft-fail (advisory, no PR wall-of-noise).
- `tests/negative_public_ingress.tf` — fixture the gate must FAIL on.

Docs: `devops/Doc/ci-oidc-verification.md` (post-apply setup + positive/negative tests),
`.tflint.hcl` at the terraform root.

## Verification done here (no apply — CEO-gated)

- `terraform fmt -recursive` clean; `bootstrap validate` Success.
- `terraform -chdir=bootstrap plan`: **6 to add, 0 to change, 0 to destroy** (OIDC
  provider + 2 roles + 3 policy resources). State bucket + budget untouched.

## Remaining (blocks Done)

1. CEO applies `bootstrap` (adds the 6 resources).
2. CEO sets repo Variables `AWS_PLAN_ROLE_ARN` / `AWS_APPLY_ROLE_ARN` / `AWS_REGION`.
3. Run the positive + negative tests in `ci-oidc-verification.md` (incl. the CEO
   no-op apply end to end, and apply-role-not-assumable-from-PR/fork).

Stays **In progress** until applied + verified in production (DoD).

## Decisions / flags for the CEO

- Apply role = `PowerUserAccess` + scoped IAM management, **not** AdministratorAccess,
  and **not** a hand-maintained per-service allow-list. Rationale: the real boundary
  is the trust policy (only apply.yml on main, CEO-only dispatch on a private repo);
  denying user/access-key creation stops a compromised run from minting a standing
  admin, without breaking on every new-service ticket. Flag if you want it tighter.
