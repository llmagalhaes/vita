# OPS-006 — Two CMKs (cost-revision §3 + backend kickoff-addendum §6.2):
#   storage  — encryption at rest for RDS, S3, CloudWatch Logs, SSM
#   app-data — application envelope encryption; separate key is what makes
#              crypto-shredding deletion work (Round 3 decision #6)
# Note on "restricted to the task role only": the account admin principal keeps
# kms:* on both keys — removing it makes a key unmanageable forever. Usage
# separation is real: no IAM identity except admins and the ARNs passed in
# var.app_data_key_user_role_arns can use the app-data key.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  partition    = data.aws_partition.current.partition
  region       = data.aws_region.current.region
  account_root = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
}

# --- storage CMK -----------------------------------------------------------

data "aws_iam_policy_document" "storage" {
  statement {
    sid = "AccountAdminViaIam"

    principals {
      type        = "AWS"
      identifiers = [local.account_root]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  # CloudWatch Logs encrypts log groups with this key (scoped to this account's log groups).
  statement {
    sid = "CloudWatchLogs"

    principals {
      type        = "Service"
      identifiers = ["logs.${local.region}.amazonaws.com"]
    }

    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${local.partition}:logs:${local.region}:${local.account_id}:log-group:*"]
    }
  }

  # CloudTrail encrypts trail log files delivered to the audit bucket (OPS-007).
  statement {
    sid = "CloudTrail"

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    actions = [
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = ["*"]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.partition}:cloudtrail:*:${local.account_id}:trail/*"]
    }
  }
}

resource "aws_kms_key" "storage" {
  description             = "vita storage CMK - encryption at rest for RDS, S3, CloudWatch Logs, SSM"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.storage.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "storage" {
  name          = "alias/vita-storage"
  target_key_id = aws_kms_key.storage.key_id
}

# --- app-data CMK ----------------------------------------------------------

data "aws_iam_policy_document" "app_data" {
  statement {
    sid = "AccountAdminViaIam"

    principals {
      type        = "AWS"
      identifiers = [local.account_root]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  # Usage grant for the ECS task role — wired by OPS-014 when the role exists.
  dynamic "statement" {
    for_each = length(var.app_data_key_user_role_arns) > 0 ? [1] : []

    content {
      sid = "TaskRoleUsage"

      principals {
        type        = "AWS"
        identifiers = var.app_data_key_user_role_arns
      }

      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:GenerateDataKeyWithoutPlaintext",
        "kms:DescribeKey",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_kms_key" "app_data" {
  description             = "vita app-data CMK - application envelope encryption (crypto-shredding)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.app_data.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "app_data" {
  name          = "alias/vita-app-data"
  target_key_id = aws_kms_key.app_data.key_id
}
