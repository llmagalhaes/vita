output "vpc_id" {
  value = module.network.vpc_id
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "db_subnet_ids" {
  value = module.network.db_subnet_ids
}

output "app_security_group_id" {
  value = module.network.app_security_group_id
}

output "db_security_group_id" {
  value = module.network.db_security_group_id
}

output "storage_key_arn" {
  value = module.kms.storage_key_arn
}

output "app_data_key_arn" {
  value = module.kms.app_data_key_arn
}

output "audit_bucket_name" {
  value = module.audit.audit_bucket_name
}
