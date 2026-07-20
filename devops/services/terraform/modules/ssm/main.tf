# OPS-010 — App secrets as SSM SecureString (standard tier = free, KMS-encrypted).
# Supersedes Secrets Manager (cost-revision §3). Terraform creates placeholders;
# the CEO pastes real values in the console. ignore_changes keeps real values out
# of state and out of every future plan.

variable "kms_key_arn" {
  description = "Storage CMK encrypting every SecureString."
  type        = string
}

variable "path_prefix" {
  type    = string
  default = "/vita/prod"
}

# The full secret set. jwt-secret is the backend ask (env VITA_JWT_SECRET);
# db-credentials holds the same password the CEO sets on RDS (OPS-009).
variable "secret_names" {
  type = set(string)
  default = [
    "db-credentials",
    "anthropic-api-key",
    "google-client-config",
    "apple-client-config",
    "email-blind-index-hmac-key",
    "wrapped-service-dek",
    "jwt-secret",
  ]
}

resource "aws_ssm_parameter" "secret" {
  for_each = var.secret_names

  name   = "${var.path_prefix}/${each.value}"
  type   = "SecureString"
  key_id = var.kms_key_arn
  tier   = "Standard"
  value  = "REPLACE_ME_IN_CONSOLE"

  lifecycle {
    ignore_changes = [value]
  }
}

# OPS-023 — mail-from is NOT a placeholder: the From: address is the CEO's own
# (already verified as the SES identity), not a credential, so Terraform owns the
# real value (no ignore_changes). Backend (BE-033) treats blank / REPLACE_ME as
# "email disabled → log the link", so this must carry the real address from apply.
variable "mail_from_address" {
  description = "Verified SES sender address, wired to task-def env MAIL_FROM_ADDRESS."
  type        = string
}

resource "aws_ssm_parameter" "mail_from" {
  name   = "${var.path_prefix}/mail-from"
  type   = "SecureString"
  key_id = var.kms_key_arn
  tier   = "Standard"
  value  = var.mail_from_address
}

# Path prefix ARN the task role (OPS-014) scopes read access to — nothing else.
output "parameter_path_arn" {
  value = "arn:aws:ssm:*:*:parameter${var.path_prefix}/*"
}

output "parameter_names" {
  value = [for p in aws_ssm_parameter.secret : p.name]
}
