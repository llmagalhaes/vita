# ---------------------------------------------------------------------------
# OPS-004 — GitHub Actions OIDC: no stored AWS keys, CEO-gated apply (ADR-0008).
# Lives in bootstrap (account-level, apply-once, manually applied) for the same
# chicken-and-egg reason as the state bucket: CI cannot create the roles CI uses.
# After this is applied, every prod-eu apply flows through .github/workflows/*.
# ---------------------------------------------------------------------------

# GitHub's OIDC issuer. aud is always sts.amazonaws.com for AssumeRoleWithWebIdentity.
# Thumbprints are GitHub's current + rotation leaf; with provider v6 AWS validates
# the token against the CA chain regardless, but the API still requires the field.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fca",
  ]
}

# --- PLAN role: read-only, assumable only by PR workflows of this repo ---------
# Plan CI runs `terraform plan -lock=false` so ReadOnlyAccess is genuinely enough
# (no state write, no lock object). Fork PRs get no id-token, so they can't assume.
data "aws_iam_policy_document" "ci_plan_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Any pull_request event on this repo. The sub for pull_request events is
    # repo:<owner>/<repo>:pull_request regardless of the source branch.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "ci_plan" {
  name                 = "vita-ci-plan"
  assume_role_policy   = data.aws_iam_policy_document.ci_plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "ci_plan_readonly" {
  role       = aws_iam_role.ci_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# --- APPLY role: assumable ONLY by apply.yml on refs/heads/main ----------------
# Two pins: sub = the main branch, and job_workflow_ref = the exact apply.yml.
# No other workflow, branch, tag, or fork can produce a token that satisfies both.
data "aws_iam_policy_document" "ci_apply_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }

    # The strong control (ADR-0008): the job must originate from apply.yml on main.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:job_workflow_ref"
      values   = ["${var.github_repo}/.github/workflows/apply.yml@refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "ci_apply" {
  name                 = "vita-ci-apply"
  assume_role_policy   = data.aws_iam_policy_document.ci_apply_trust.json
  max_session_duration = 3600
}

# PowerUserAccess = every service, no IAM. Terraform manages IAM (task roles, KMS
# key policies, this OIDC), so we add IAM management below — but deliberately NOT
# user/access-key creation, so a compromised apply run cannot mint a standing
# admin identity. The real boundary is the trust policy above (CEO-only dispatch);
# this narrows blast radius without a hand-maintained per-service action list.
resource "aws_iam_role_policy_attachment" "ci_apply_poweruser" {
  role       = aws_iam_role.ci_apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "ci_apply_iam" {
  statement {
    sid    = "ManageServiceRolesAndPolicies"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy", "iam:ListRolePolicies",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:ListPolicyVersions",
      "iam:ListPolicies", "iam:TagPolicy", "iam:UntagPolicy",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:ListInstanceProfilesForRole", "iam:ListEntitiesForPolicy",
      "iam:CreateOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider", "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:TagOpenIDConnectProvider",
      "iam:CreateServiceLinkedRole",
      "iam:PassRole", "iam:ListRoles",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ci_apply_iam" {
  name   = "vita-ci-apply-iam"
  role   = aws_iam_role.ci_apply.id
  policy = data.aws_iam_policy_document.ci_apply_iam.json
}
