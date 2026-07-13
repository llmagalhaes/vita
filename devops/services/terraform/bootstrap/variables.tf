variable "aws_region" {
  description = "Deployment region (ADR-0002). The only place a region is named."
  type        = string
  default     = "eu-west-1"
}

variable "alert_email" {
  description = "Recipient for budget alerts."
  type        = string
  default     = "lucasmagalhaes2007@gmail.com"
}

variable "monthly_budget_usd" {
  description = "Monthly AWS budget in USD (Round 3 decision #5)."
  type        = string
  default     = "40"
}

variable "github_repo" {
  description = "owner/repo the CI OIDC roles trust (OPS-004 / ADR-0008)."
  type        = string
  default     = "llmagalhaes/vita"
}
