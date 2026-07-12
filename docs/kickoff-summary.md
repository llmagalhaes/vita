# Phase 0 — Kickoff Summary (CEO review package)

> Consolidated by the orchestrator from the three team proposals. Full proposals:
> [backend](../backend/Doc/kickoff-proposal.md) · [app](../app/Doc/kickoff-proposal.md) · [devops](../devops/Doc/kickoff-proposal.md)

## Proposals at a glance

| Team | Core choices | Waves |
|---|---|---|
| **Backend** | Modular monolith, Kotlin + Spring Boot 3 (JDK 21), PostgreSQL, Spring Data JDBC + Flyway, REST/OpenAPI 3.1 contract-first, Postgres-backed job queue (no SQS/Kafka in v1). Product AI via Claude API with structured output; the AI only produces drafts — nothing enters the log without the user's Confirm. Auth: magic link + native Google/Apple token verification, JWT + rotating refresh. Health v1: app pushes normalized samples to an idempotent ingestion endpoint; v2 sources (Garmin/Strava/Flo) write into the same normalized table. | W0–W9: skeleton/CI → auth → log entries → AI text capture → photo/PDF plans → habits → health ingestion → trends → vacation/export/deletion → hardening |
| **App** | **React Native + Expo** (Reanimated 3 + Skia + Gesture Handler): closest model to the HTML/SVG prototype, best ecosystem for voice/health/notifications, OTA updates. TypeScript strict, Expo Router, TanStack Query + Zustand, offline-first (SQLite + persisted outbox with idempotency keys), design-system package from the brief's tokens, vacation-mode theming. Voice transcription on-device. QA: Jest/RNTL + Maestro E2E + OpenAPI-generated client with MSW mocks. | 7 waves: foundations → identity/onboarding → capture & log → plans/habits/notifications → movement & trends → account/vacation/export → hardening & store release |
| **DevOps** | ECS Fargate + ALB; Aurora Serverless v2 (prod) / small RDS (dev/staging); per-env VPC, SSM-only access; SES, S3+KMS, Secrets Manager. 4-account AWS Org, Terraform modules + thin env roots, S3 state. AI-safe workflow: CI is plan-only, apply gated by CEO approval via GitHub Environments + OIDC. GitHub Actions CI; mobile via Fastlane → TestFlight/Play internal. Observability: CloudWatch-native, AI-queryable. LGPD posture: CMK everywhere, no PII in logs, cross-account backups. | 6 waves: foundations → dev env → staging + real backend → mobile CI + observability → prod + DR rehearsal → post-launch ops |

**Estimated AWS cost: ~$590/mo** (dev $107 / staging $129 / prod $353; main drivers NAT, Aurora, Fargate) + GitHub/macOS CI minutes ~$60–100/mo + Apple ($99/yr) / Google ($25) fees. Claude API product usage budgeted separately by backend.

## Where the teams already align

- **Contract-first**: backend drafts OpenAPI into `docs/contracts/`, app reviews before either side implements; app generates its client from the same contract.
- **Health data seam**: app reads HealthKit/Health Connect on device and pushes normalized samples; backend dedupes idempotently; v2 providers reuse the same table — no rework.
- **Drafts stay client-side**: unconfirmed AI interpretations never persist server-side; app's offline outbox + backend idempotency keys fit together.
- **AI-safe infra**: devops' plan-only CI + CEO-gated applies matches the process doc's approval rules.

## Cross-team decisions needing resolution (orchestrator will broker after CEO input)

1. **Check-in notifications**: device-local (simplest, works offline) vs server push (needed if check-ins must arrive with the app killed on schedule set server-side). Backend and app both flagged it.
2. **Mobile builds**: app suggests EAS (Expo's managed build service, ~$100/mo tier) vs devops' Fastlane on macOS runners. One must win before app Wave 0.
3. **Trends computation**: backend proposes server-side aggregates (W7); app can render either way. Recommend: server-side (single source of truth, thinner app).

## Questions for the CEO

### Product
1. Habit/check-in notifications: local on device, or server-controlled push? (drives decision 1 above)
2. Export PDF generated server-side (proposed) or on-device? Any branding requirements?
3. Cycle data: store only a derived phase signal or raw samples? Default-exclude from exports?
4. Micronutrient daily-reference set: FDA Daily Values ok?
5. Account deletion: immediate hard-delete or grace period (e.g. 30 days)?
6. Launch language: English-only? (affects parse prompts, evals, email copy — PT-BR support is a scope add)
7. Home cycle chip in v1 via Health platforms, or wait for Flo in v2?
8. Capture bar: ship v2 pill only, or both v1/v2 variants from the prototype?
9. Confirm voice posture: transcription on-device, audio never leaves the phone?
10. Dark mode: prototype is light-only — confirm light-only for v1?
11. Device support: phone-only v1? Min iOS 16+ / Android 10+?

### Infra / budget / accounts
12. AWS region: devops recommends `sa-east-1` (São Paulo) for LGPD data residency — confirm? Any other residency constraint?
13. Budget: is ~$590/mo AWS + ~$100/mo CI acceptable as ceiling for v1?
14. Approve the 4-account AWS Organization (mgmt/dev/staging/prod)?
15. Product domain: what domain will Vita use (needed for SES, deep links, API)?
16. GitHub: confirm GitHub + Team plan as the platform?
17. Anthropic: OK to sign DPA / rely on zero-retention API for health-adjacent prompts?
18. Data retention: how long to keep uploaded PDFs, generated exports, and logs?
19. Apple Developer / Google Play accounts: who creates them (human action required)?
20. Mobile builds: EAS (managed, ~$100/mo) or self-hosted Fastlane on CI runners?
21. AI cost guard: per-user daily parse ceiling OK? Monthly Claude API budget to alarm on?

## Next step

CEO reviews the three proposals and answers/decides above → orchestrator relays decisions → **Phase 1**: each team turns its approved proposal into detailed specs, API contracts in `docs/contracts/`, and Backlog tickets.
