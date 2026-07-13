# CEO Decision Log

Dated, append-only. Newest first. Teams read this to know what is decided vs open.

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
