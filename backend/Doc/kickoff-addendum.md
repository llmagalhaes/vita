# Kickoff Addendum — alignment with CEO decisions of 2026-07-13

> Amends `kickoff-proposal.md` after the post-kickoff review. Where this addendum and the proposal conflict, the addendum wins. Companions: `data-protection-design.md`, `db-evaluation.md`.

## 1. Spring Boot 4 — evaluated, adopted

The CEO asked "why not Spring Boot 4?". Answer: yes — and the support calendar makes it the *conservative* choice, not the adventurous one.

- Boot 4.0 (on Spring Framework 7) went GA **November 2025** — it is ~8 months and several patch releases mature by now.
- Boot 3.5 was the last 3.x line and its **OSS support ended June 2026** — last month. Starting a greenfield service on 3.5 today means running without free security patches from day one, or paying for enterprise support.
- What Boot 4 changes for our stack: Jakarta EE 11, JDK 17+ baseline (we stay on **JDK 21 LTS**), Kotlin 2.x baseline, JSpecify null-safety annotations (nice for Kotlin interop), modularized starters, first-class API versioning. Our ingredients — Spring Data JDBC, Flyway, Jackson Kotlin, Actuator/Micrometer, Testcontainers, MockK, springdoc — all have Boot-4-compatible releases.
- Risk & mitigation: any long-tail library lag surfaces in **W0 (walking skeleton)**, when the codebase is a health endpoint and one migration — falling back to a 3.5.x pin at that point is a one-line version change. Zero migration cost because we have zero code.

**Verdict: Spring Boot 4.0.x, Kotlin, JDK 21.** Supersedes proposal §2's "Spring Boot 3".

## 2. Architecture — no onion, no hexagon (confirmed and simplified)

The proposal never had ports-and-adapters; this addendum goes one step simpler. **One Gradle module, plain packages** — the proposal's Gradle-enforced module boundaries are dropped as ceremony we don't need yet:

```
services/vita-api/src/main/kotlin/vita/
├── auth/       ├── users/      ├── log/        ├── plans/
├── habits/     ├── health/     ├── ai/         ├── trends/
├── export/     ├── crypto/     # field encryption + DEK cache (data-protection design)
└── shared/     # jobs table worker, problem+json, config
```

Each package: controller, service, repository, and its domain records — as few files as do the job. Rules: no interfaces with one implementation, no mapper layers, no `domain/application/infrastructure` subfolders, no events between packages — a package that needs another calls its service class directly. `// ponytail: single Gradle module; split into modules only when compile time or a real boundary violation hurts.`

## 3. Notifications — local on device (decided)

Removes proposal kickoff-question 1 and all server-push ambiguity:

- Backend serves **data only**: habit schedules (days + time), plan-digest content, vacation-mode kept-notification set. The app schedules local notifications from it.
- **No push infrastructure, no device tokens stored** (a data-minimization win — one less identifier class), no SNS/FCM/APNs anywhere in v1.
- W5's "notification scheduling data for the app" epic shrinks to: schedule fields already in the habit model + one endpoint the app reads after sync.

## 4. Single production environment — what changes

Proposal assumed dev/staging/prod. Now: **prod only; everything pre-prod is local.**

- **Local = the environment**: `docker compose` (Postgres 16 + WireMock for Claude/SES) is the daily dev loop; CI runs the identical stack via Testcontainers. What passes CI is what ships.
- **Migration discipline (the big one — no staging to catch a bad migration)**: Flyway migrations are **expand/contract only** — additive changes ship with the code that uses them; destructive steps (drop column, tighten constraint) ship at least one release later, once no running image references the old shape. This makes every deploy rollback-safe: previous image + current schema always work together. CI runs `flyway validate` + full migration from baseline on every build.
- **Rollout for risky changes**: simple **config-property feature flags** (`vita.features.x=false`) for anything scary (new AI pipeline versions, ingestion changes) — flip in prod config, no redeploy, no flag service. Post-deploy smoke test (health + login + one parse) gates "Done = in production".
- **Rollback** = redeploy previous image tag; guaranteed compatible by the migration rule above.
- W0 changes: "deployed to a dev environment" becomes "deployed to production behind the feature-flag default-off + compose-based local env documented".

## 5. i18n — English launch, translation-file-ready

Backend produces user-facing strings in exactly two places: **magic-link emails** and **export PDFs**. Both read every string from standard Java resource bundles (`messages_en.properties`, ICU MessageFormat for plurals/dates) via Spring's `MessageSource` — zero hardcoded user-facing literals, enforced by review. A new language = a new properties file. API error `detail` strings stay English (developer-facing); the app owns user-facing error copy. AI parse output is user content, not UI copy — not translated. `// ponytail: no locale column on user yet; add when a second language ships.`

## 6. Infra requests for DevOps (future Asana tickets — listed here, not created)

Aligned with `db-evaluation.md` and `data-protection-design.md`; region Europe, everything region-agnostic, single prod env:

1. **RDS PostgreSQL 16, t4g.micro, single-AZ**, KMS-encrypted, 35-day automated backups, deletion protection, `require_ssl` — replaces the Aurora Serverless proposal (cost).
2. **KMS CMK `vita-app-data`** for application envelope encryption, decrypt/generate-data-key restricted to the API task role. Separate from the RDS/S3 storage keys.
3. **S3 buckets**: `vita-prod-uploads` (plan PDFs; lifecycle-expire 30d) and `vita-prod-exports` (lifecycle-expire 30d), SSE-KMS, no public access.
4. **SES**: domain identity + DKIM/SPF/DMARC + **production-access request filed early** (AWS approval takes days — this ticket should be first).
5. **Secrets Manager** entries: DB credentials, Claude API key, Google/Apple client config, email blind-index HMAC key, wrapped service DEK.
6. **ECS task role** scoped to exactly the above (the two buckets, the secrets, the CMK, SES send).
7. **Not needed — please don't provision**: SQS/queues (Postgres job table), SNS/push (local notifications), DynamoDB, Redis (in-memory caches suffice at this scale).

## 7. Open questions to the CEO (consolidated)

Still open from kickoff: Q2 (export PDF server-side + branding), Q3 (cycle minimal storage — minimal proposal in data-protection-design §2), Q4 (micronutrient reference set), Q5 (deletion grace period), Q8 (AI cost envelope for alarms). New: Anthropic zero-data-retention arrangement (data-protection-design §6). Answered by the 2026-07-13 decisions: Q1 (local notifications), Q6 (English + i18n-ready), Q7 (Europe region).
