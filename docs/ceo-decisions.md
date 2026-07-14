# CEO Decision Log

Dated, append-only. Newest first. Teams read this to know what is decided vs open.

## 2026-07-14 — Round 10 (local-100 backlog answers)

Answers to the open questions in `docs/backlog-local-100.md`:

1. **Check-in results and vacation results are persisted server-side.** Notifications stay local on device (unchanged), and habit definitions/vacation config may stay device-local — but the *outcomes* (check-in yes/no answers; vacation date ranges/days) must persist on the backend. (Amends team decision D1.)
2. **Plan/program history: keep past plans, max 5 (configurable).** Supersedes the singular replace-on-write default (D5 cardinality).
3. **Eating plan and training program must be fully editable — any field** (text and proportions/quantities, not only portions). CEO suggestion: store as jsonb and update per key. Storage design is the backend's call, but the encryption non-negotiable stands — edit semantics must work over encrypted-at-rest data.
4. **Energy "spent"**: sum of logged workout kcal (labeled estimate) approved, **plus manual entry** of spent energy.
5. **Focus = 100% local development.** No GitHub CI/CD work (OPS-018 cancelled), no AWS deploy. Where AWS services are needed, use **LocalStack** — zero cost, real-adapter testing. **Terraform stays ready** (code maintained; no applies). F-LAST is unscheduled until a future CEO call.

## 2026-07-14 — Round 9 (local-first build-out)

1. **Local-first policy**: development runs locally (docker-compose + bootRun + Expo); production deploy happens only at a **called milestone**, not per-ticket. Rationale: per-ticket deploy is too slow for dev. Infra stays applied but ECS parked at $0.
2. **App↔backend integration PROVEN locally** (CEO-chosen): real app client → real Kotlin backend + real Postgres, full capture loop verified, zero contract drift. Not a deploy.
3. **BE-016 un-deferred and done**: old flat packages (auth/crypto/shared) refactored into controller→service→repository (ADR-0012, supersedes ADR-0001's package section). 84 tests still green.
4. Autonomous backlog now exhausted — remaining work gated on CEO: deploy milestone, or Apple/Play accounts (APP-007/BE-007). Handoff in `Next_session.md`.

## 2026-07-13 — Round 8 (M1 test feedback)

0. **Backend package layout = controller → service → repository.** Packages organized in these three layers (per feature). Applies going forward; **existing code (flat packages, ADR-0001) is NOT refactored now** — deferred to a later ticket (BE-016). Expo Go now runs on SDK 56 (see #4, updated from 54).


1. **RDS backup retention = 45 days** (supersedes the 14 d devops / 35 d backend disagreement). Rationale: not in production yet, cheap to change later. Reconcile ADR-0006 + set the value when OPS-009 lands. Blocks nothing now.
2. **OPS-003 confirmed**: CEO verified the `$40/mo` budget lists his email as subscriber → ticket closed.
3. **Plan/program parse-import endpoint approved** for the contract (onboarding steps 3–4). Backend specs it now (contract-only, no impl); PDF import goes via S3 presigned URL, not the JSON body.
4. **Expo Go incompatibility (M1 blocker)**: project scaffolded on Expo SDK 57 (RN 0.86); store Expo Go only runs an older SDK. Fix = downgrade the app to the store-Expo-Go SDK so the CEO walks it on his physical phone (app team). Immediate workaround: `npx expo start` → `i` (iOS simulator) runs SDK 57 fine.

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
