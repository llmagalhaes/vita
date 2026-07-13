# OPS-014 — ECS Fargate: 1 ARM64 task (Kotlin app + ADOT sidecar), circuit-breaker
# rollback, awslogs → CloudWatch. Task role least-privilege: exactly the 2 buckets,
# /vita/prod/* SSM, SES send, aps:RemoteWrite. app-data CMK usage is granted by the
# KMS key policy (OPS-006) — prod-eu passes this task role's ARN there.
# APPLY BLOCKED until an arm64 image exists in ECR (BE-004). Plan is image-agnostic.

variable "public_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "ecr_repository_url" { type = string }
variable "storage_key_arn" { type = string }
variable "service_discovery_service_arn" { type = string }

variable "bucket_arns" {
  description = "map(uploads/exports -> arn) from the storage module."
  type        = map(string)
}

variable "image_tag" {
  description = "git SHA in prod. Placeholder until BE-004 pushes the first image."
  type        = string
  default     = "bootstrap"
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# 0 = parked (no image / not a deploy milestone). Flip to 1 at the first real deploy.
variable "desired_count" {
  type    = number
  default = 1
}

# env var -> SSM param short name under /vita/prod/. Backend confirms/extends the
# full contract before apply; VITA_JWT_SECRET is the one firm mapping today.
variable "container_secrets" {
  type = map(string)
  default = {
    VITA_JWT_SECRET   = "jwt-secret"
    ANTHROPIC_API_KEY = "anthropic-api-key"
    DB_CREDENTIALS    = "db-credentials"
  }
}

variable "aps_workspace_arn" {
  description = "AMP workspace for aps:RemoteWrite. '*' until the observability ticket creates it."
  type        = string
  default     = "*"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  ssm_prefix         = "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/vita/prod"
  ssm_path_glob      = "${local.ssm_prefix}/*"
  bucket_object_arns = [for a in values(var.bucket_arns) : "${a}/*"]
}

# --- logs ------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/vita"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.storage_key_arn
}

resource "aws_ecs_cluster" "this" {
  name = "vita"
}

# --- execution role: pull image + inject SSM secrets -----------------------
data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "vita-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid       = "ReadSsmSecrets"
    actions   = ["ssm:GetParameters"]
    resources = [local.ssm_path_glob]
  }
  statement {
    sid       = "DecryptSsmWithStorageKey"
    actions   = ["kms:Decrypt"]
    resources = [var.storage_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "vita-ecs-execution-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# --- task role: exactly what the app touches at runtime --------------------
resource "aws_iam_role" "task" {
  name               = "vita-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

data "aws_iam_policy_document" "task" {
  statement {
    sid       = "AppBucketsRW"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = local.bucket_object_arns
  }
  statement {
    sid       = "AppBucketsList"
    actions   = ["s3:ListBucket"]
    resources = values(var.bucket_arns)
  }
  statement {
    sid       = "ReadSsmAtRuntime"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = [local.ssm_path_glob]
  }
  # app-data CMK is NOT here — its key policy (OPS-006) grants this role directly.
  statement {
    sid       = "SesSend"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
  statement {
    sid       = "AmpRemoteWrite"
    actions   = ["aps:RemoteWrite"]
    resources = [var.aps_workspace_arn]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "vita-ecs-task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# --- task definition: app + ADOT sidecar (ARM64) ---------------------------
locals {
  app_secrets = [
    for env, name in var.container_secrets : {
      name      = env
      valueFrom = "${local.ssm_prefix}/${name}"
    }
  ]

  container_defs = [
    {
      name         = "app"
      image        = "${var.ecr_repository_url}:${var.image_tag}"
      essential    = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment  = [{ name = "AWS_REGION", value = data.aws_region.current.region }]
      secrets      = local.app_secrets
      # curl is present in the image (slim JRE has no wget); path/port confirmed
      # against backend/services/vita-api/Dockerfile (EXPOSE 8080, /health DB-backed).
      healthCheck = {
        command     = ["CMD-SHELL", "curl -fsS http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 40
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "app"
        }
      }
    },
    {
      # ponytail: sidecar present per ticket; its X-Ray + AMP remote_write pipeline
      # config is finalized in the observability ticket once the AMP workspace exists.
      name      = "adot"
      image     = "public.ecr.aws/aws-observability/aws-otel-collector:latest"
      essential = false
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "adot"
        }
      }
    },
  ]
}

resource "aws_ecs_task_definition" "this" {
  family                   = "vita"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode(local.container_defs)
}

resource "aws_ecs_service" "this" {
  name            = "vita"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [var.app_security_group_id]
    assign_public_ip = true # egress to Claude API/ECR, no NAT (ADR-0004)
  }

  service_registries {
    registry_arn = var.service_discovery_service_arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Give the JVM time to boot before the first health verdict.
  health_check_grace_period_seconds = 60

  # ponytail: image tag changes are pushed by the deploy pipeline, not Terraform.
  lifecycle {
    ignore_changes = [task_definition]
  }
}

output "task_role_arn" {
  description = "Passed to the KMS module so the app-data key policy grants this role."
  value       = aws_iam_role.task.arn
}
