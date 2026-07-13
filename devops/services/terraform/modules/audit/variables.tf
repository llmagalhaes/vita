variable "kms_key_arn" {
  description = "Storage CMK ARN used to encrypt the audit bucket and trail log files (OPS-006)."
  type        = string
}

variable "retention_days" {
  description = "Audit log retention in the audit bucket."
  type        = number
  default     = 400
}
