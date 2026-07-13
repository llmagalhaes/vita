output "storage_key_arn" {
  value = aws_kms_key.storage.arn
}

output "storage_key_id" {
  value = aws_kms_key.storage.key_id
}

output "app_data_key_arn" {
  value = aws_kms_key.app_data.arn
}
