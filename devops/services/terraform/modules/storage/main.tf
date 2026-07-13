# OPS-011 — App S3 buckets: uploads (plan PDFs, incl. BE-015 presigned PUT) and
# exports. SSE-KMS (storage CMK), all public access blocked, TLS-only, expire 30d,
# prevent_destroy. Access is presigned URLs via the task role only (OPS-014) — the
# buckets never sit behind API Gateway (10 MB body limit).

variable "kms_key_arn" {
  type = string
}

variable "account_id" {
  description = "Bucket names are globally unique; suffix with the account id."
  type        = string
}

locals {
  # both buckets: identical config, 30-day expiry.
  buckets = toset(["uploads", "exports"])
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  bucket   = "vita-prod-${each.value}-${var.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id

  rule {
    id     = "expire-30d"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}

data "aws_iam_policy_document" "tls_only" {
  for_each = aws_s3_bucket.this

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      each.value.arn,
      "${each.value.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  policy   = data.aws_iam_policy_document.tls_only[each.key].json
}

output "bucket_names" {
  value = { for k, b in aws_s3_bucket.this : k => b.bucket }
}

output "bucket_arns" {
  value = { for k, b in aws_s3_bucket.this : k => b.arn }
}
