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
