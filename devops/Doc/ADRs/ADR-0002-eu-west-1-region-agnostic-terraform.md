# ADR-0002 — eu-west-1, region-agnostic Terraform

**Status**: Accepted 2026-07-13 · Reviewed 2026-07-13 against eu-north-1 (the CEO's CLI default): pricing API shows Fargate ARM ~10% **cheaper in eu-west-1** ($0.03238 vs $0.0356/vCPU-h, $0.00356 vs $0.00392/GB-h) while RDS db.t4g.micro is $0.001/h cheaper in eu-north-1 — net ≈ $0.10/mo in Ireland's favor on our bill. Decision stands; Terraform pins eu-west-1 regardless of the CLI default.

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
