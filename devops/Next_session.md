# DevOps — Next session

## Current state (after cost revision, 2026-07-13)

- CEO reviewed the kickoff and issued directives (see `docs/ceo-decisions.md`, 2026-07-13 items 4, 5, 6, 9, 10, 12): **single environment (prod only)**, ~5 users, cost top priority, Europe region (region-agnostic Terraform), Prometheus on AWS + Grafana local-only on CEO's Mac, no mobile build pipeline, CEO creates all external accounts from a guide.
- **`Doc/cost-revision.md` written** — the revised architecture: 2-account org (management + prod), no NAT (public-subnet Fargate, SG-locked, DB fully private), API Gateway HTTP API instead of ALB, RDS PostgreSQL t4g.micro single-AZ instead of Aurora, 1 ARM Fargate task 0.25vCPU/1GB with ADOT sidecar (traces→X-Ray, metrics→Amazon Managed Prometheus, logs→CloudWatch), Grafana reaches AMP via SigV4/SSO (no tunnel), eu-west-1, **~$42/mo** vs $590. Cut-risk table and single-env deploy/migration discipline included.
- **`docs/ceo-setup-guide.md` written** — ordered human-only checklist: AWS 2-account org + MFA + $60 budget → domain (Route 53) → SES prod-access request (1–2 day wait) → GitHub repo + workflow_dispatch apply gate → Anthropic key with $25 spend limit → Apple Developer ($99/yr, ~2 d verification) → Play Console ($25, up to 1 wk verification, 12-tester/14-day closed-test rule flagged). Bundle IDs blocked on the domain decision.
- Still nothing provisioned, no Terraform code written. Tickets now live on Asana (repo Backlog/ folders retired per CEO decision #1).

## Next steps

1. Wait for CEO: cost-revision approval + open questions (domain name; GitHub Free `workflow_dispatch` gate vs Team; $60 budget confirm; Grafana SigV4 flow ok; Anthropic DPA; retention windows).
2. Wait for CEO to execute the setup guide — AWS account IDs, SSO URL, domain, repo path land in `devops/Doc/bootstrap-ids.md`.
3. On approval: write ADRs (2-account org, no-NAT public-subnet pattern, API GW ingress, RDS choice, AMP/Grafana-local, eu-west-1) and create Asana tickets on the DevOps board (GID `1216519867368584`), Wave 0 first: Terraform bootstrap (state, OIDC), SES verification, budget alarms, CI skeleton (plan-only).
4. Sync with backend: their document-store evaluation (DynamoDB would replace the RDS line, ~$1/mo, kills single-AZ risk); ARM64 Docker builds; container health-check endpoint; OTel SDK wiring to the ADOT sidecar; async pattern for AI parses (API GW 29 s timeout).
5. Sync with app team: bundle ID / package name once the domain is decided; deep-link host for magic links.

## Blockers

- CEO approval of `Doc/cost-revision.md` and answers to its §7 questions.
- CEO execution of `docs/ceo-setup-guide.md` step 1 (AWS) — blocks all bootstrap work. Domain decision blocks SES, API hostname and store identifiers.
