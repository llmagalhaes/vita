# Backend is intentionally LOCAL for the first apply — this stack creates the
# state bucket (chicken-and-egg). After the first successful apply, uncomment
# the block below and run `terraform init -migrate-state` (apply-runbook.md).
#
# terraform {
#   backend "s3" {
#     bucket       = "vita-tfstate-201261380352"
#     key          = "bootstrap/terraform.tfstate"
#     region       = "eu-west-1"
#     use_lockfile = true
#     encrypt      = true
#   }
# }
