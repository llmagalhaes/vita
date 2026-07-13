# State backend created by ../../bootstrap (OPS-002). Backend blocks cannot
# interpolate, hence the literals; the backend region is where the STATE lives
# and stays eu-west-1 even if a future root deploys elsewhere.
terraform {
  backend "s3" {
    bucket       = "vita-tfstate-201261380352"
    key          = "envs/prod-eu/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }
}
