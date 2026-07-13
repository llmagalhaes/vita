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
