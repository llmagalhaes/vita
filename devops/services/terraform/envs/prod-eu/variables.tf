variable "aws_region" {
  description = "Deployment region (ADR-0002). The only place a region is named."
  type        = string
  default     = "eu-west-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "audit_retention_days" {
  description = "CloudTrail log retention (default 400 d — open CEO question)."
  type        = number
  default     = 400
}

variable "rds_backup_retention_days" {
  description = "RDS automated backup retention. CEO Round 8: 45 days."
  type        = number
  default     = 45
}

variable "app_image_tag" {
  description = "ECR image tag deployed to ECS (git SHA). Bump + apply to roll a new backend build."
  type        = string
  default     = "909262c"
}

variable "mail_from_address" {
  description = "Verified SES sender for the magic-link email (OPS-023). Sandbox: sender == recipient == CEO during testing."
  type        = string
  default     = "lucasmagalhaes2007@gmail.com"
}
