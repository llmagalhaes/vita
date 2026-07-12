# DevOps — Next session

## Current state (after Phase 0 kickoff, 2026-07-12)

- Team folder structure created (`Backlog/` + `Wip/` + `Done/`, `Progress/`, `Doc/ADRs/`, `services/`).
- **`Doc/kickoff-proposal.md` written and awaiting CEO review.** Key proposals: ECS Fargate + Aurora/RDS PostgreSQL + SES + S3 + Secrets Manager; 4-account AWS Org; Terraform with S3 state, plan-only CI, CEO-gated apply; GitHub Actions CI/CD (backend rolling deploy, mobile via Fastlane → TestFlight/Play); CloudWatch-native observability (Logs Insights, EMF, X-Ray) designed for AI querying; ~$590/mo AWS estimate; 6 delivery waves.
- No Terraform written, nothing provisioned (per Phase 0 constraints).

## Next steps

1. Wait for CEO answers to the 8 questions in kickoff-proposal.md §9 — region, budget, account structure, domain, GitHub plan, Anthropic DPA, retention, Apple/Google accounts. These gate Phase 1.
2. On Phase 1 approval: turn the proposal into ADRs (compute choice, DB, CI platform, account structure, region) and Backlog tickets (OPS-001…), starting with Wave 0 (org bootstrap, Terraform state, OIDC, CI skeleton, SES production access request — SES approval has multi-day lead time, ticket it first).
3. Sync with backend team on Dockerfile/health-check/logging contract and with app team on stack + bundle IDs once their kickoffs land.

## Blockers

- CEO review of the kickoff proposal (Phase 0 → 1 gate).
- Human-only steps identified early: domain purchase, Apple Developer / Google Play accounts, AWS org root emails.
