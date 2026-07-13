# ADR-0002 — eu-west-1, region-agnostic Terraform

**Status**: Accepted 2026-07-13

## Context

CEO: Europe region, but a Brazil region must be quick to stand up if Brazilian users appear.

## Decision

**eu-west-1 (Ireland)**: ~5–10% cheaper than Frankfurt on our dominant lines (Fargate, RDS t4g), gets new AWS services first in Europe, GDPR-equivalent. Difference ~$2–3/mo — nothing else distinguishes them.

Region-agnostic rules, enforced in review:

- `var.aws_region` is the only place a region is named; provider reads it.
- No hardcoded AZs (`data.aws_availability_zones` + slicing), no hardcoded ARNs/partitions (compose from `data.aws_partition` / `aws_caller_identity`).
- Region-sensitive quirks (SES endpoints, AMP availability) resolved inside modules.
- State layout `envs/prod-eu/`; a future `envs/prod-br/` is a new thin root reusing the same modules with different tfvars.

## Consequences

Brazil = copy one small folder + tfvars. Cost: none. Constraint: every module must pass the "no literal region" review check.
