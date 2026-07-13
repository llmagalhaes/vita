output "state_bucket_name" {
  description = "S3 bucket holding all Terraform state. Referenced by every backend block."
  value       = aws_s3_bucket.tfstate.bucket
}

# Set these as GitHub repo Variables after apply (Settings → Secrets and variables
# → Actions → Variables): AWS_PLAN_ROLE_ARN, AWS_APPLY_ROLE_ARN, AWS_REGION.
output "ci_plan_role_arn" {
  description = "OIDC role for PR plan CI (read-only). → repo var AWS_PLAN_ROLE_ARN."
  value       = aws_iam_role.ci_plan.arn
}

output "ci_apply_role_arn" {
  description = "OIDC role for CEO-gated apply.yml. → repo var AWS_APPLY_ROLE_ARN."
  value       = aws_iam_role.ci_apply.arn
}
