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

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "ssm_parameter_path_arn" {
  description = "Wildcard ARN the OPS-014 task role scopes SSM read to."
  value       = module.ssm.parameter_path_arn
}

output "app_bucket_names" {
  value = module.storage.bucket_names
}

output "app_bucket_arns" {
  description = "For the OPS-014 task-role RW scoping."
  value       = module.storage.bucket_arns
}

output "api_endpoint" {
  description = "OPS-013 HTTP API URL — hand to the app team as the build-config base URL."
  value       = module.apigw.api_endpoint
}
