# OPS-009 — RDS PostgreSQL, ADR-0006. db.t4g.micro single-AZ, 20 GB gp3, in the
# private DB subnets, storage CMK, force_ssl, deletion protection, prevent_destroy.
# Backups: 45 days same-account PITR (CEO Round 8). Cross-account vault copy is
# DEFERRED — ADR-0010 collapsed us to a single account, so there is no management
# account to copy to yet; revisit when the org is stood up.

variable "db_subnet_ids" {
  type = list(string)
}

variable "vpc_security_group_id" {
  description = "The db SG (5432 from the app SG only, no egress)."
  type        = string
}

variable "kms_key_arn" {
  description = "Storage CMK for encryption at rest."
  type        = string
}

# CEO Round 8 wants 45-day retention. RDS automated backups cap at 35 days, so 45
# is delivered by the AWS Backup vault below; RDS automated backups stay a shorter
# PITR window (recover-recent-mistakes), which is what the automated store is for.
variable "backup_retention_days" {
  description = "AWS Backup vault retention (CEO Round 8: 45 days)."
  type        = number
  default     = 45
}

variable "pitr_days" {
  description = "RDS automated-backup / PITR window (max 35; free within 20 GB)."
  type        = number
  default     = 14
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "engine_version" {
  description = "Postgres major; minor auto-upgrades. Pin a minor at apply if drift appears."
  type        = string
  default     = "16"
}

variable "multi_az" {
  description = "Single-AZ (ADR-0006). One tfvars flip to true (+~$13/mo)."
  type        = bool
  default     = false
}

variable "db_name" {
  type    = string
  default = "vita"
}

variable "master_username" {
  type    = string
  default = "vita"
}

# ponytail: placeholder only. Terraform NEVER holds the real password — the CEO
# sets it once via the console after apply and pastes the same value into the
# /vita/prod/db-credentials SSM param (OPS-010) that the app reads. ignore_changes
# below keeps the placeholder out of every future plan.
variable "master_password" {
  type      = string
  sensitive = true
  default   = "CHANGEME-set-in-console-and-SSM"
}

resource "aws_db_subnet_group" "this" {
  name       = "vita"
  subnet_ids = var.db_subnet_ids
}

# force_ssl=1: the server rejects any non-TLS connection.
resource "aws_db_parameter_group" "this" {
  name   = "vita-postgres16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
    # Static param — takes effect on reboot; pinning stops perpetual immediate/pending churn.
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "this" {
  identifier     = "vita"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  db_name  = var.db_name
  username = var.master_username
  password = var.master_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.vpc_security_group_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  multi_az               = var.multi_az
  publicly_accessible    = false

  backup_retention_period    = var.pitr_days
  auto_minor_version_upgrade = true
  deletion_protection        = true
  # Real DB — a destroy must be a deliberate, snapshotted act, never a plan surprise.
  skip_final_snapshot       = false
  final_snapshot_identifier = "vita-final"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [password]
  }
}

# --- AWS Backup: 45-day retention (the ransomware/DR boundary) --------------
# Same-account vault for now. Cross-account copy to a management account is
# DEFERRED (ADR-0010: single account); when the org exists, add a copy_action
# with a destination_vault_arn here.

resource "aws_backup_vault" "this" {
  name        = "vita"
  kms_key_arn = var.kms_key_arn

  lifecycle {
    prevent_destroy = true
  }
}

data "aws_iam_policy_document" "backup_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "vita-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_plan" "this" {
  name = "vita"

  rule {
    rule_name         = "daily-45d"
    target_vault_name = aws_backup_vault.this.name
    schedule          = "cron(0 5 * * ? *)"

    lifecycle {
      delete_after = var.backup_retention_days
    }
  }
}

resource "aws_backup_selection" "rds" {
  name         = "vita-rds"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.this.id
  resources    = [aws_db_instance.this.arn]
}

output "endpoint" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}
