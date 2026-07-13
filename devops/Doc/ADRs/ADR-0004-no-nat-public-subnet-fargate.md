# ADR-0004 — No-NAT networking: Fargate in public subnets

**Status**: Accepted 2026-07-13

## Context

A NAT gateway is ~$37/mo — the single biggest avoidable line. Alternatives: VPC interface endpoints (~$8 each, we'd need 6–8 ≈ $50–60 *and* still lack real egress for the Claude API — worse), fck-nat (~$4 but an EC2 instance to patch and own).

## Decision

**The Fargate task runs in a public subnet with a public IP** (egress to Claude API, ECR, AWS APIs) and a security group allowing **zero inbound** except the API Gateway VPC Link ENIs on the container port. **The database stays in a private subnet with no internet route at all** (RDS needs no egress). Cost: $0.

## Consequences

- Residual risk is *misconfiguration* — someone later opening an inbound rule. Mitigations: SGs exist only in Terraform (plan reviewed on every PR), checkov rule forbidding `0.0.0.0/0` ingress, data tier fully private. Accepted for 5 users; standard cost-sensitive pattern.
- `# ponytail: public-subnet Fargate; move to private subnets + NAT (or fck-nat) if compliance review or scale demands it` — a subnet/tfvars change, not a redesign.
