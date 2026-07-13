# DevOps — Next session

## Current state (after Round 3 amendments + ADR round, 2026-07-13)

- **CEO approved the cost revision with amendments** (Round 3, `docs/ceo-decisions.md`): domain purchase deferred (placeholder DNS), GitHub Free `workflow_dispatch` apply gate, budgets $40 AWS / $10 Claude, free tier maximized, zero-retention Anthropic key.
- **`Doc/cost-revision.md` amended**: §1.8 placeholder-DNS architecture (default `execute-api` URL, SES sandbox with verified tester emails, magic-link redirect route on the backend, bundle ID `com.lucasmagalhaes.vita` not domain-derived); §3.1 GitHub Free gate design (OIDC apply role pinned to `apply.yml`@`main` via `job_workflow_ref`, plan-artifact reuse, stale-plan refusal); trims (Route 53 deferred, Secrets Manager → SSM SecureString, 2→1 CMK, X-Ray always-free). **New totals: ~$16/mo year 1 (free tier), ~$37/mo year 2+** — under the $40 alarm.
- **`docs/ceo-setup-guide.md` amended**: critical path is now AWS org → GitHub → Anthropic ($10 limit, zero-retention) → Apple → Google Play. Domain + SES production access moved to a "When we buy the domain (later)" section (SES domain identity + prod access, API custom domain, universal links — nothing else changes).
- **ADRs written**: `Doc/ADRs/ADR-0001`–`0009` (single prod env, eu-west-1 region-agnostic, 2-account org, no-NAT public-subnet Fargate, API GW HTTP API, RDS t4g.micro single-AZ, observability OTel/AMP/local Grafana, GitHub Free CI/CD gate, placeholder DNS + budgets). All Accepted 2026-07-13.
- Still nothing provisioned, no Terraform code written.

## Next steps

1. **Phase 1 — Terraform skeleton: awaiting orchestrator go.** On go: create Asana tickets on the DevOps board (GID `1216519867368584`), Wave 0 first: bootstrap (state bucket + DynamoDB lock, OIDC provider + plan/apply roles), org/accounts module, VPC (public app subnets, private DB subnets, no NAT), budget $40 + SNS alarms, CI skeleton (plan-only PR workflow + `apply.yml` workflow_dispatch), SSM parameters, SES email identities.
2. Blocked on CEO setup-guide execution: AWS account IDs + SSO start URL + repo path → `devops/Doc/bootstrap-ids.md`.
3. Sync with backend: magic-link redirect route (`GET /auth/open` 302 → `vita://auth`) is a backend endpoint; ARM64 Docker build; container health-check endpoint; OTel SDK → ADOT sidecar; async pattern for AI parses (29 s API GW timeout); token-usage metric for the $10 Claude budget watch.
4. Sync with app team: bundle ID `com.lucasmagalhaes.vita` (proposed, CEO to confirm — immutable); API base URL as build config; `vita://auth` scheme handling.

## Open questions for the CEO (also in cost-revision §7)

- Confirm bundle ID `com.lucasmagalhaes.vita` before first store upload.
- What event triggers buying the domain.
- Retention windows (defaulting 400 d logs / 90 d exports unless objected).

## Blockers

- Orchestrator go for Phase 1 ticket creation.
- CEO execution of the setup guide step 1 (AWS) — blocks all bootstrap applies (Terraform code can be written before it).
