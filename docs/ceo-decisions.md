# CEO Decision Log

Dated, append-only. Newest first. Teams read this to know what is decided vs open.

## 2026-07-13 — Round 4 (Phase 1 go)

1. **Bundle ID / package name: `com.vita`** (iOS and Android). Immutable once published. (Orchestrator note: valid two-segment identifier; convention implies owning vita.com, which we don't — accepted by the CEO.)
2. **Phase 1 approved**: teams write specs/contracts and populate the Asana backlogs.
3. **AWS account already exists** (CEO's). DevOps adapts the bootstrap: existing account becomes the management account (enable Organizations, create the prod account from it) — or justifies single-account if simpler. CEO will provide a local AWS CLI profile; credentials are configured by the CEO on his machine, never shared in chat.

## 2026-07-13 — Round 3 (data & cost review)

1. **Domain purchase deferred.** Run on placeholder DNS for now: API Gateway default URL for the API; SES sandbox with the ~5 testers' emails as verified identities; magic-link emails point at an https redirect that opens the app (custom scheme). Bundle ID / package name must NOT depend on the future domain.
2. **Cycle data minimalism confirmed**: latest derived phase only, no history, excluded from exports by default.
3. **Anthropic: zero-retention** arrangement for the Claude API key.
4. **GitHub Free** — Terraform apply gate = CEO-triggered `workflow_dispatch` (no paid Environment approvals).
5. **Budgets**: AWS budget alarm at **$40/mo**; Claude API **$10/mo** (CEO reviews daily). Infra must fit under the alarm.
6. **Account deletion: 7-day grace period**, then crypto-shredding + hard delete.
7. **Infra stays minimalist** even though the full product ships: few test users — use AWS free tier wherever possible.
8. **Every architecture decision is recorded as an ADR** in the owning team's `Doc/ADRs/`.
9. **DB**: PostgreSQL + jsonb confirmed as recommendation after the encrypted-DynamoDB trade-off review (encryption and easy deletion are DB-agnostic via crypto-shredding; Dynamo's real cost is the hand-written read side; DocumentDB eliminated on cost). Documented switch condition: full field-level encryption of numeric values would flip the choice to DynamoDB.
10. Defaults adopted unless CEO objects: micronutrient reference = FDA Daily Values; export PDF = simple Vita-branded header.

## 2026-07-13 — Post-kickoff review

1. **Tickets move to Asana** (our Jira): one board per team (see `DEVELOPMENT_PROCESS.md` for links/GIDs). Flow Backlog → To do → In progress → Done. **Definition of done: in production.** Repo `Backlog/` folders retired.
2. **Notion is the living documentation** (our Confluence): Product + per-team pages. Leads and orchestrator must keep it updated at session close, concisely.
3. **Check-in/habit notifications: local on device.** No server push in v1.
4. **Single environment: production only.** No dev/staging in AWS — pre-prod testing is local. Cuts cost; devops proposal under revision accordingly.
5. **AWS region: Europe.** Services and Terraform must be region-agnostic so a Brazil region can be stood up easily if Brazilian users appear.
6. **Budget reality check**: ~5 test users initially; the ~$590/mo estimate was sized for 3 envs — devops to re-estimate with cost as top priority, without compromising security/encryption.
7. **Data responsibility is a core premise**: store strictly the necessary; sensitive data encrypted. Backend to design the approach (data classification, field-level encryption).
8. **Backend directives**: evaluate a document/NoSQL store (nutrition, activity, personal data as documents — low transactional pressure) — discussed by at least 2 agents; evaluate Spring Boot 4; **no onion/hexagonal architecture** — separate modules, kept simple (ponytail); infra needs (queues, topics, buckets) are requested as tickets on the devops Asana board.
9. **Mobile builds: manual on the CEO's Mac.** No paid build pipeline (no EAS subscription, no macOS CI runners).
10. **Observability**: OpenTelemetry as the pipe into the stack; **Prometheus hosted on AWS** for metrics; **Grafana local-only** on the CEO's machine pointing at Prometheus.
11. **Language: English launch, i18n-ready** from day one — adding a language must be just adding translation files.
12. **CEO account setup**: CEO will create all external accounts (AWS, domain, Apple, Google, etc.) himself — devops to provide a step-by-step guide.

## 2026-07-13 — Kickoff (founding)

- Ship the complete product (all prototype screens) to production; teams slice into waves.
- v1 health integrations: Apple Health + Health Connect only; Garmin/Strava/Flo in v2.
- Backend: Kotlin. Infra: AWS + Terraform. App stack delegated to app team (criteria: fluidity, animation fidelity, future-proof) → **React Native + Expo** accepted.
- All documentation and code in English.
