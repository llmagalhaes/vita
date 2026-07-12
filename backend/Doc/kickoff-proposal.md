# Backend Kickoff Proposal — Vita

> Phase 0 deliverable. Author: Backend Team Lead. Status: awaiting CEO review.
> Scope: complete product (all prototype screens) from zero to production, per founding decisions.

## 1. Architecture

**Modular monolith. One Kotlin service, one PostgreSQL database.**

Why not microservices: one client (the mobile app), one small AI-driven team, a domain where everything joins against everything (timeline joins meals + water + workouts + health samples; trends aggregates all of it). Splitting services now buys network hops, distributed transactions and contract drift between our own components — and nothing else. The monolith is internally organized as Gradle-enforced modules so a future split is a deploy decision, not a rewrite:

```
services/vita-api/
├── modules/
│   ├── auth            # magic link, Google/Apple, sessions
│   ├── users           # profile, units, prefs, vacation mode
│   ├── log             # meals, water, workouts — entries + timeline
│   ├── plans           # eating plans, training programs
│   ├── habits          # habits, check-ins, plan-linked check-ins
│   ├── health          # ingested samples (Apple Health / Health Connect / v2 sources)
│   ├── ai              # Claude API client, parse/photo/import pipelines
│   ├── trends          # read-side aggregations
│   └── export          # PDF export generation
└── app/                # wiring, HTTP layer, config
```

The only candidate for a second deployable later is the AI pipeline (spiky latency, different scaling profile). The `ai` module keeps a clean interface so that split is mechanical if ever needed. Not now.

**Persistence**: PostgreSQL (RDS, provisioned by DevOps). Flyway migrations, schema co-designed with DevOps. `jsonb` for the naturally document-shaped payloads (nutrition breakdowns, exercise lists) — normalized columns for everything we query and aggregate on.

**Async work** (magic-link emails, PDF plan import, export generation, v2 sync jobs): a Postgres-backed job table polled by in-process workers. No SQS/Kafka in v1 — one database is one thing to operate, and the volumes are tiny. If DevOps prefers SQS for operational reasons, the job interface makes that a swap.

## 2. Kotlin framework

**Spring Boot 3 (Kotlin, JDK 21).**

Considered Ktor (lighter, more idiomatic) and http4k. Spring Boot wins on the criteria that matter for this project:

- Batteries we need on day one: OAuth2/JWT resource-server support, transaction management, `spring-data-jdbc`, Flyway integration, Actuator health/metrics endpoints (DevOps needs these for ALB checks and monitoring), Micrometer → CloudWatch.
- Testcontainers and MockMvc/WebTestClient testing story is the most mature in the JVM ecosystem — critical since QA automation is part of every ticket.
- Boring and massively documented — the safest substrate for AI-written code; least chance of inventing infrastructure that already exists.

Data access via **Spring Data JDBC** (not JPA/Hibernate): explicit SQL-shaped aggregates, no lazy-loading surprises, plays well with `jsonb`. Serialization: Jackson with Kotlin module.

## 3. API style

**REST + JSON, OpenAPI 3.1 contract-first**, specs in `docs/contracts/` before implementation (per DEVELOPMENT_PROCESS.md). Versioned base path `/v1`. Auth via `Authorization: Bearer <JWT>`.

- Contract workflow: backend drafts the OpenAPI spec per feature area → orchestrator routes to app team for review → both sides implement against the agreed spec → contract tests (see §8) keep the implementation honest. Changes = ADR + notify app team.
- AI parse endpoints are synchronous (see §5) — the app's "Making sense of it…" state is the loading UX. Long jobs (PDF import, export) are `POST → 202 + job id → GET job status` polling. No websockets/SSE in v1; polling at these payload sizes is fine.
- Pagination: cursor-based on timeline/history endpoints.
- Errors: RFC 7807 problem+json.

## 4. Domain model (outline)

Detailed schema comes in Phase 1 with DevOps. The shape:

- **user** — id, name, email (unique), units (metric/imperial), notification prefs, theme/accent, created_at. Soft state: `vacation_period` (start, end, kept-notification set) as a child table so history is preserved.
- **auth_identity** — user_id, provider (`google` | `apple` | `email`), provider_subject; a user can hold several. **magic_link_token** — hashed token, email, expiry, consumed_at. **refresh_token** — hashed, device label, expiry, revoked_at.
- **log_entry** — the timeline spine: id, user_id, type (`meal` | `water` | `workout`), occurred_at, logged_at, input_method (`voice` | `text` | `photo` | `tap` | `checkin` | `import`), source (`user` | `apple_health` | `health_connect` | future providers), source_phrase (the quoted original), estimate flag, and a typed detail:
  - **meal_detail** — items[] (name, quantity, unit, kcal, macros P/C/F, micros with % daily reference) as `jsonb`; denormalized totals (kcal, P/C/F) as columns for aggregation.
  - **water_detail** — amount_ml.
  - **workout_detail** — title, duration, kcal estimate, muscles[], exercises[] (name, sets/reps/load) as `jsonb`; denormalized duration/kcal/muscle-group columns for the trends heatmap.
- **eating_plan** — user_id, source (`described` | `pdf` | `text`), original document ref (S3), AI summary, daily kcal/macros; child **plan_meal** (breakfast/lunch/…, time) → **plan_item** (name, quantity, unit, nutrition-per-unit). Portion adjustments recompute from nutrition-per-unit.
- **training_program** — user_id, split description, source, structured days/exercises (`jsonb`).
- **habit** — user_id, name, type (`simple` | `plan_linked` + plan_meal_id), schedule (days-of-week + time), enabled. **habit_checkin** — habit_id, date, answer (yes/no), answered_at. A "yes" on a plan-linked check-in creates a `log_entry` (meal) copied from the plan meal.
- **integration_connection** — user_id, source, state (connected/disconnected), last_sync_at, approved data types.
- **health_sample** — the normalized ingestion table (see §7): user_id, source, type (`workout` | `active_energy` | `steps` | `cycle_phase` | …), start/end, value/payload (`jsonb`), external_id + dedupe hash.
- **export_job / import_job** — generic job rows (type, status, params, result ref, error).

Deletion: full account delete is hard-delete of user data (privacy-first product); implemented as a job.

## 5. Product AI

All via the **Claude API** from the `ai` module. One principle drives the design: **the AI never writes to the log.** Parse endpoints are stateless — they transform input into a structured draft; the app shows the confirmation card; only the user's Confirm sends the draft to the ordinary `POST /v1/entries` endpoint. Confirmation-before-commit is therefore structural, not a flag: unconfirmed parses are never persisted (only counted/logged for cost metrics). "Adjust" is an app-side edit of the same draft before submitting.

**Pipelines** (each an OpenAPI-specified endpoint returning the same draft-entry schema the entries endpoint accepts):

1. **NL parse** — `POST /v1/parse/text` with the transcript/text → draft meal/water/workout entry (type inferred), items with kcal/macro/micro estimates, inferred `occurred_at` ("around 4"). Single Claude call with **structured output via a tool definition** — the model must emit our draft schema, no free-text JSON parsing.
2. **Photo recognition** — `POST /v1/parse/photo` (image + optional caption) → plate → meal items with quantities, or whiteboard → workout routine. Vision-capable model, same tool-forced output.
3. **Plan/program import** — `POST /v1/imports` with PDF or free text → async job → structured plan + human-readable summary. User confirms the summary before the plan is activated (same commit rule). PDFs go to Claude's native PDF input; no OCR stack of our own.

**Latency and cost controls:**

- **Small models by default**: the cheapest/fastest current model tier (Haiku-class) for text parse; vision-capable mid-tier (Sonnet-class) only for photos and PDF import. Model ids live in config; exact choices validated against current API pricing in Phase 1 with a small eval set.
- **Prompt caching** on the system prompt + nutrition-reference preamble (the bulk of input tokens) — near-free repeat calls.
- **Capped output tokens** and single-call design — no agentic loops, no chains; one request, one tool-call response.
- Timeouts (~10 s text, ~30 s photo) with one retry; on failure the app falls back to manual entry.
- Per-user daily parse rate limit (generous — abuse guard, not a product limit) and cost metrics per pipeline in CloudWatch.
- Nutrition numbers come from the model as estimates and are labeled as such end to end — we do not bolt on a food database in v1; the prototype's own copy ("Estimated by Vita") is the contract. A verification pass against a nutrition DB is a possible v2 quality upgrade, recorded as a non-goal for now.

**No advice, structurally**: the tool schema has no free-text commentary field; there is nowhere for the model to put advice even if prompted maliciously. User text is data inside the prompt, never instructions.

## 6. Auth

Passwordless only, per product.

- **Magic link**: `POST /v1/auth/magic-link` (email) → single-use token (random 256-bit, stored hashed, 15-min expiry) → email via SES with deep link `vita://auth?token=…` (+ universal link fallback) → `POST /v1/auth/magic-link/verify` exchanges it for a session. Response to the request endpoint is identical whether the email exists or not (no enumeration). Rate-limited per email and per IP.
- **Google / Apple**: the app performs native sign-in and sends the provider **id token**; backend verifies signature (provider JWKS), issuer, audience and nonce, then finds-or-creates the user keyed on `(provider, subject)` with email linking. We receive name and email — nothing else, matching the consent copy.
- **Sessions**: backend-issued **JWT access token (15 min)** + **opaque refresh token (60 days, rotated on use, hashed at rest, revocable per device)**. Sign-out and account pages revoke refresh tokens.
- One user, multiple identities: signing in with Google after magic link on the same verified email links to the same account.

## 7. Health integrations

**v1 — Apple Health / Health Connect are device-side APIs.** There is no server OAuth: the app reads the platforms locally (with the user's per-type approval) and **pushes normalized samples** to the backend. Backend responsibilities:

- `PUT /v1/integrations/{source}` — connection state + approved data types (drives the Integrations screen and "reads only what you approve").
- `POST /v1/health/samples` — batch ingestion of normalized samples: `{source, type, start, end, value/payload, external_id}`. Idempotent via `(user, source, type, external_id)` dedupe — device retries and re-syncs are safe. Sample types for v1: workouts (become `log_entry` workouts with a source badge), active energy + steps (feed the Energy card's consumed-vs-spent), cycle phase where available (feeds the cycle chip; stored minimally, see CEO question).
- The **normalized sample schema is the seam**: the app team co-owns this contract (they write the readers); it is deliberately provider-agnostic.

**v2 — Garmin / Strava / Flo / gym apps** plug into the same seam from the other side: these are **server-side OAuth** providers, so v2 adds an OAuth-connect flow and per-provider **sync workers** (using the existing job table) that fetch from provider APIs and write into the *same* `health_sample` ingestion path and dedupe rules. Nothing downstream (timeline, energy, trends, workout detail) changes — downstream only ever sees normalized samples with a `source`. That is the no-rework guarantee, and it's why normalization lives in v1 even though v1 has only device-side sources.

## 8. QA automation

Part of every ticket, per the global DoD. Stack — all boring, all mainstream:

- **Unit**: JUnit 5 + MockK. Pure domain logic (nutrition math, plan portion recompute, habit scheduling, token lifecycle) tested without Spring context.
- **Integration**: Spring Boot tests + **Testcontainers (PostgreSQL)** — real database, real Flyway migrations, exercising HTTP → DB per endpoint. Claude API and SES stubbed with **WireMock** (recorded golden responses per pipeline; a small tagged live-API smoke suite runs on demand, not in CI).
- **Contract**: the OpenAPI specs in `docs/contracts/` are enforced with an **openapi-validator filter in integration tests** — every request/response in the test suite is validated against the spec, so implementation drift fails the build. Specs are linted in CI. This gives the app team a spec they can trust and mock against.
- **AI quality**: a small versioned eval set (fixture inputs → expected structured shapes/tolerances) run against golden responses in CI and against the live API on demand — catches prompt or model regressions.
- CI (DevOps-owned pipeline): build + all tests on every push; a ticket is Done only green.

## 9. Delivery waves (zero → production, complete scope)

Vertical slices; each wave ends integrable with the app. Detailed tickets in Phase 1.

| Wave | Theme | Epics |
|---|---|---|
| **W0** | Walking skeleton | Repo/Gradle/Spring skeleton; health endpoint; Flyway baseline; CI green; deployed to a dev environment (with DevOps); contract workflow bootstrapped in `docs/contracts/` |
| **W1** | Identity | Magic link auth (SES); Google/Apple token verification; JWT + refresh sessions; user profile + units + notification prefs (Account screen basics) |
| **W2** | The log | `log_entry` model + CRUD; water quick-add; manual meal/workout entries; Today timeline endpoint; meal & workout detail endpoints |
| **W3** | AI capture | Claude client + `ai` module; NL text parse → draft → confirm flow; estimates labeling; cost/latency metrics; AI eval harness |
| **W4** | Eyes and documents | Photo parse (plate, whiteboard); PDF/text eating-plan import (async job + summary confirm); training program import; Eating Plan screen endpoints (portion adjust recompute) |
| **W5** | Habits | Habits CRUD + scheduling; check-ins (incl. plan-linked auto-log); plan digest data; notification scheduling data for the app |
| **W6** | Health ingestion | Integrations state endpoints; normalized sample ingestion + dedupe; imported workouts on timeline; Energy card (consumed vs spent, 7-day); cycle chip |
| **W7** | Trends | Aggregation endpoints: calories bars/curve, in/out, macro balance, water, meal times, muscle heatmap, aerobic minutes, workout history; vacation-day exclusion |
| **W8** | Calm & closure | Vacation mode (period, kept notifications, trip habits); export PDF generation (per-audience, 30-day, estimates marked); account deletion; data export |
| **W9** | Production hardening | Security review pass; rate limiting everywhere; load test; observability dashboards + alarms (with DevOps); runbooks; go-live |

W3 is the product's heart — it ships early so the core capture loop is real before the long tail.

## 10. Dependencies on other teams

**App team**
- **API contract workflow**: OpenAPI specs in `docs/contracts/`, backend-drafted, app-reviewed *before* either side implements; changes via ADR + orchestrator notification. First contracts needed: auth (W1), entries + timeline (W2), parse (W3).
- Co-ownership of the **normalized health sample schema** (§7) — the app writes the HealthKit/Health Connect readers and the push/sync cadence; we need their input on what the platforms actually expose per type.
- Draft-entry handling: the app holds unconfirmed AI drafts client-side (nothing persisted server-side until Confirm) — need agreement this matches their capture UX plan.
- Deep/universal link handling for magic links.
- Decision needed together: habit check-in notifications — local scheduling on device (backend just serves the schedule) vs server push. Local is simpler and offline-proof; flagging as a joint Phase 1 decision.

**DevOps team**
- Dev/staging/prod environments: container runtime for the Kotlin service, **RDS PostgreSQL**, **S3** (plan PDFs, exports), **SES** (magic-link email, incl. domain verification), Secrets Manager (Claude API key etc.), CloudWatch metrics/log/alarm wiring.
- CI pipeline that runs our Gradle build + Testcontainers-based tests.
- Schema/migration review partnership (Flyway) per DEVELOPMENT_PROCESS.md.
- W0 cannot finish without a deployable dev environment.

## 11. Questions for the CEO

1. **Habit/check-in notifications**: are device-local notifications acceptable (simplest, works offline; backend only stores the schedule), or do you want server-side push (requires push infrastructure and a provider decision)?
2. **Export PDF**: generated server-side (proposed — consistent output, S3-stored until shared) or on-device? Any branding requirements for the exported document?
3. **Cycle data**: it's health-sensitive. Is storing the minimal derived signal (current phase for the chip) enough, or must raw cycle samples be stored? Any extra handling you want (e.g. excluded from exports by default)?
4. **Micronutrient "% daily reference"**: which reference set should estimates use (e.g. FDA Daily Values)? Purely a labeling/source choice, but it should be deliberate.
5. **Account deletion**: immediate hard-delete on request, or a grace period (e.g. 14 days to undo)?
6. **Launch markets/languages**: English-only at launch? Affects AI parsing prompts (multi-language parse works, but we'd eval for it) and magic-link email copy.
7. **Data residency**: any constraint on AWS region(s) for user health data (e.g. EU users → EU region)?
8. **Claude API budget guardrail**: is a per-user daily AI-parse ceiling acceptable as an abuse guard (invisible to normal use), and is there a monthly cost envelope we should design alarms around?
