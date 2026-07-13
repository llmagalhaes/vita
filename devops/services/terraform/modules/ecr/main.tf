# OPS-008 — ECR for the backend image. Immutable tags (deploy by git SHA),
# scan-on-push, KMS at rest (storage CMK), keep the last 10 images for rollback.

variable "kms_key_arn" {
  description = "Storage CMK for image encryption at rest."
  type        = string
}

variable "repo_name" {
  description = "ECR repository name."
  type        = string
  default     = "vita-api"
}

variable "keep_last_images" {
  description = "Untagged/rollback retention depth."
  type        = number
  default     = 10
}

resource "aws_ecr_repository" "this" {
  name                 = var.repo_name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }
}

# Keep the last N images; expire the rest. Rollback needs the previous tag, so N=10.
resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last ${var.keep_last_images} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.keep_last_images
      }
      action = { type = "expire" }
    }]
  })
}

output "repository_url" {
  value = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.this.arn
}
