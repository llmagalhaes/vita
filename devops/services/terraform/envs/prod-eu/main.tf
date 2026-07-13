# Thin prod root (ADR-0002): modules only, no resources. A future prod-br is a
# copy of this folder with different tfvars and its own state key.

module "network" {
  source   = "../../modules/network"
  vpc_cidr = var.vpc_cidr
}

module "kms" {
  source = "../../modules/kms"
}

# Once per account (multi-region trail + GuardDuty) — a second regional root
# would add only its own GuardDuty detector, never a second trail.
module "audit" {
  source         = "../../modules/audit"
  kms_key_arn    = module.kms.storage_key_arn
  retention_days = var.audit_retention_days
}

# OPS-008 — ECR for the backend image.
module "ecr" {
  source      = "../../modules/ecr"
  kms_key_arn = module.kms.storage_key_arn
}

# OPS-009 — RDS PostgreSQL in the private DB subnets.
module "rds" {
  source                = "../../modules/rds"
  db_subnet_ids         = module.network.db_subnet_ids
  vpc_security_group_id = module.network.db_security_group_id
  kms_key_arn           = module.kms.storage_key_arn
  backup_retention_days = var.rds_backup_retention_days
}

# OPS-010 — App secrets as SSM SecureString.
module "ssm" {
  source      = "../../modules/ssm"
  kms_key_arn = module.kms.storage_key_arn
}

# OPS-011 — App S3 buckets (uploads + exports).
module "storage" {
  source      = "../../modules/storage"
  kms_key_arn = module.kms.storage_key_arn
  account_id  = data.aws_caller_identity.current.account_id
}

data "aws_caller_identity" "current" {}
