# First apply ran with LOCAL state (this stack creates the state bucket —
# chicken-and-egg); state was migrated here on 2026-07-13 (apply-runbook.md step 2).

terraform {
  backend "s3" {
    bucket       = "vita-tfstate-201261380352"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}
