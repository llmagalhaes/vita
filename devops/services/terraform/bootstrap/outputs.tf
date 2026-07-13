output "state_bucket_name" {
  description = "S3 bucket holding all Terraform state. Referenced by every backend block."
  value       = aws_s3_bucket.tfstate.bucket
}
