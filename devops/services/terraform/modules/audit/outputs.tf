output "audit_bucket_name" {
  value = aws_s3_bucket.audit.bucket
}

output "trail_arn" {
  value = aws_cloudtrail.this.arn
}

output "guardduty_detector_id" {
  value = aws_guardduty_detector.this.id
}
