# CEO Decision Log

Dated, append-only. Newest first. Teams read this to know what is decided vs open.

## 2026-07-13 — Round 7 (model policy + Anthropic key)

1. **Model assignment per task (cost rule)**: every Asana ticket gets an explicit Claude model. Simple tasks → **Sonnet**; complex tasks → **Opus 4.8**; **Fable** only for orchestration that needs it — simple orchestration uses Opus. Team-lead agents may run on Opus. The orchestrator sets the model when dispatching and records `Model:` on each ticket.
2. **Anthropic API key delivered** (unblocks BE-013 parse when it starts). CEO placed it in `application.yaml`; orchestrator moved it to `backend/services/vita-api/secrets.yaml` (gitignored, auto-imported by Spring locally — never commit real keys; prod uses env vars/Secrets Manager). Key was never committed/pushed, so no rotation needed.

## 2026-07-13 — Round 6 (unblocked)

1. Repo pushed to GitHub by the CEO (`llmagalhaes/vita`).
2. Root access key remediated: CLI now uses IAM user `vita-admin` (verified). Terraform applies unblocked — each apply still requires CEO plan approval.
3. Cost: proceed on free-tier credits as-is; CEO will add caps later if needed. ($40/mo budget alarm ships with the first apply.)

## 2026-07-13 — Round 5 (implementation go)

1. **AWS**: CEO created a **brand-new dedicated AWS account** (free tier applies — year-1 ~$16/mo estimate restored) and configured the AWS CLI locally with an access key. Implementation of infra is authorized to start.
2. **Bundle ID / package name: `com.llmagal.vita`** (supersedes Round 4's `com.vita`). "Vita" is an internal codename — the public app name is NOT final; keep store-facing naming open where possible (display name stays easily changeable until release), keep "vita" internally.
3. **Apple Developer / Google Play accounts: deferred** — CEO will create them later. APP-007 (tester builds) and BE-007 (Google/Apple sign-in) stay blocked on this.
4. **UX answers**: capture bar = **v2 pill only**; **light mode only** in v1; **phone-only, iOS 16+ / Android 10+**; cycle chip ships in v1 sourced **only from Apple Health / Health Connect** (Flo stays v2).
5. **Go**: start everything that isn't blocked (BE-001–003, APP-001–006, OPS bootstrap).

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
