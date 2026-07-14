# Backlog — "Vita 100% local" (rev 2, post-CEO Round 10)

> CEO directive (2026-07-14): **the app working 100% locally, feature by feature** — for each feature, the steps each team needs. **No GitHub CI/CD, no AWS deploy — where AWS is needed, LocalStack. Terraform stays ready (no applies). Production (F-LAST) is unscheduled until a future CEO call.**
>
> Method: orchestrator draft → three team-lead rounds (detail → cross-team reconciliation → CEO Round-10 answers incorporated). Local DoD everywhere: backend `./gradlew check` green + contract-first (redocly); app `tsc` clean + Jest green + walkable in **store Expo Go SDK 56**; the app team's pre-merge checklist (`tsc` · `jest` · `api:check` · `expo export`) is the guardrail — documented in `app/Doc/` when implementation starts (no CI ticket, CEO Round 10.5).
>
> Asana sync: tickets below get created on the team boards (with their `Model:` lines) as each slice starts. This file is the plan of record until then.

## Standing decisions (CEO Round 10 + team reconciliation)

| # | Decision |
|---|---|
| D1 | **Habit definitions, notification prefs and vacation config stay device-local; check-in RESULTS and vacation RANGES persist server-side** (CEO R10.1). Check-ins ride the existing entries path as a new `checkin` entry type (BE-024); vacation ranges are `GET/PUT /me/vacations` (BE-025). Notifications remain local on device. |
| D2 | **Export PDF = on-device** (`expo-print` + `expo-sharing`). The log never leaves the phone until the user shares the file. No backend, no infra. |
| D3 | **Photo transport = multipart direct to `POST /parse/photo`** (already in contract v0.3.0; app downscales to 1568px JPEG q0.8). No `/uploads` involvement. `/uploads` stays PDF-only. |
| D4 | **Trends aggregation = client-side over SQLite** for the W/F/M window (via BE-017 range in real mode). No server aggregate endpoint; activity/muscle data is encrypted server-side and never server-aggregated. |
| D5 | **Plan/program: history of past versions, max 5 (configurable `vita.plans.history-max`), fully editable — any field** (CEO R10.2/3). Versions = rows; `POST` = import → new version (cap drops oldest); `GET` = current; `PUT` = edit current, **full-doc replace + whole-blob re-encrypt in the service** (the encryption-safe reading of the jsonb suggestion — no plaintext server-side merge-patch); `GET …/history` = the ≤5 docs. Past versions frozen, no restore v1. Encryption non-negotiable stands (per-user DEK). |
| D6 | **Contract v0.4.0 = one bump**: `GET /entries` `from`/`to` + CSV `type` (incl. new `checkin` enum + `CheckinDetail`), plan/program history+edit paths, `/me/vacations`. ADRs: extend ADR-0011 (plan history/edit/re-encrypt); new ADR-0013 (checkin-as-entry-type + vacation ranges). |
| D7 | **No GitHub CI/CD work** (CEO R10.5): OPS-018 cancelled; existing workflows (backend-ci, contract-lint, terraform) stay untouched. Local pre-merge checklists are the guardrail. |
| D8 | **Energy "spent" = sum of logged workout kcal (labeled estimate) + manual add** (CEO R10.4). Manual add = a `POST /entries type=workout` with kcal and no exercises — no new endpoint or shape. Health-source energy stays honestly "connect a health source" (blocked appendix). |
| D9 | **LocalStack for AWS-shaped local testing** (CEO R10.5): OPS-020 wires LocalStack (compose profile) with **S3 + KMS** so backend builds/tests the REAL `FileStore` presigner (BE-026) and REAL KMS `KeyWrapper` (BE-027) locally. SES stays deferred (`LogMailer` covers local). Plain `docker compose up` stays Postgres-only; `./gradlew check` stays AWS-free. |

## Slice order (each slice CEO-testable in Expo Go)

| Slice | Feature | App | Backend gate | Devops |
|---|---|---|---|---|
| 1 | **F1 Water, complete** | APP-017 | none | — |
| 2 | **F2 Workout, complete (text path)** | APP-018 → APP-019 | **BE-017** | — |
| 3 | **F4/F5 Plan + program: persisted, history, editable** | APP-021 → APP-022 → APP-023 | **BE-019 + BE-020** (+BE-023 early) | — |
| 4 | **F6 Habits & check-ins + F7 Local notifications** | APP-024 → APP-025 → APP-026 | **BE-024** (soft gate — outbox decouples; app builds on mock) | — |
| 5 | **F3 Photo capture** | APP-020 (can start on mock drafts) | **BE-018** | — |
| 6 | **F8 Trends** | APP-027 → APP-028 (needs APP-019 BodyMap) | BE-017 (done by then) | — |
| 7 | **F9 Account / F10 Vacation / F11 Export / F12 Energy** | APP-029 → APP-030 → APP-031 → APP-032 | **BE-025** (vacation ranges) | — |
| 8 | Debt & real adapters | APP-033/034/035 | BE-022 · BE-026 · BE-027 | **OPS-020** LocalStack |
| 9 | **F-LAST Production deploy — UNSCHEDULED** (future CEO call) | — | BE-004 | runbook below |

Backend order: **BE-017** → **BE-023** → **BE-019 + BE-020** → **BE-024** → **BE-018** → **BE-025** → BE-022/BE-026/BE-027 (debt/adapters, anytime after OPS-020).

---

## Features & tickets

### F1 — Water, complete *(slice 1)*
- **APP-017** (Sonnet, M) — Home Water card expands to the day's log list (amount/time/method, units-aware); timeline water cards navigate to a new `water/[id]` detail screen; quick-add unchanged via outbox. Clears the "water card doesn't navigate" debt. *Backend: none.*

### F2 — Workout, complete (text path) *(slice 2)*
- **APP-018** (Sonnet, S/M) — workout-shaped confirm card (title, duration, kcal *estimate*, muscle chips, exercises) → entry via outbox; timeline workout cards navigate.
- **APP-019** (Opus 4.8, L) — workout detail: source badge, **interactive front/back `BodyMap` SVG primitive** (built once, reused by F8), exercises, 30-day history strip → preview sheet.
- **BE-017** (Sonnet, S, v0.4.0 additive) — `GET /entries` gains optional `from`/`to` + **CSV `type`** (`type=meal,water,workout` for Home excludes check-ins; `type=checkin` for Habits). Keyset cursor and single-`date` behaviour unchanged.

### F3 — Photo capture *(slice 5; app half can start earlier on canned mock drafts)*
- **APP-020** (Opus 4.8, M/L) — pill camera → `expo-image-picker` (**works in Expo Go, verified**) → multipart to `/parse/photo` → items with quantity steppers → existing confirm path adds a meal (plate) or workout (whiteboard). Calm permission states, "type instead" fallback.
- **BE-018** (Opus 4.8, M, no contract change) — implement `/parse/photo` (Claude vision via `ClaudeClient.callTool` image block); image sent to the model and **discarded, never persisted** (ADR-0005); reuses quota 429 + metrics; 413 >5 MB, 422 unrecognizable. Gated on **BE-023** (vision model id). Multipart under Boot 4/Jackson 3 — verify.

### F4/F5 — Eating plan + training program: persisted, history (≤5), fully editable *(slice 3)*
- **BE-019** (Opus 4.8, M, v0.4.0 + ADR-0011 ext) — eating plan as versioned rows `(id, user_id, doc_enc, created_at)`, per-user DEK: `POST` import → new version (cap `vita.plans.history-max:5`, drop oldest), `GET` current, `PUT` edit current (full-doc replace, re-encrypt), `GET …/history`. Deletion-cascade wired; repository test proves stored bytes ≠ plaintext.
- **BE-020** (Sonnet, M) — training program, mechanical mirror (same migration file, same ADR).
- **APP-021** (Sonnet, M) — wire onboarding steps 3–4 to REAL parse endpoints, POST the confirmed draft; Home plan row + Account "Your setup" read the persisted plan. **Kills the client-side mock read-back debt.**
- **APP-022** (Opus 4.8, L) — Eating plan screen with **Edit mode: any field editable** (inline text for item names, numeric fields + portion slider for quantities/proportions), live local recompute, estimates labeled, dual input; Save = whole-plan PUT. History has **no UI this ticket** (backend-only; a "previous plans" picker is a small follow-up).
- **APP-023** (Sonnet, **M** — grew from S) — program summary screen with the same Edit mode.

### F6 — Habits & check-ins *(slice 4)*
- **APP-024** (Sonnet, M) — Manage tab: SQLite habits domain (name, days, time, enabled, optional plan-meal link, 14-day dots), CRUD, dual-input form. "A single yes or no per check-in — no streaks, no scores."
- **APP-025** (Opus 4.8, M/L) — Today tab + check-in stack sheet + Home "N waiting" banner; plan check-in "Yes" auto-logs the plan's meal; "Not quite" opens capture. **Check-in answers persist via the existing outbox** as `checkin` entries (BE-024) — soft gate, slice builds on mock. Local SQLite stays the display source for dots; the server write is durability.
- **BE-024** (Sonnet, S–M, v0.4.0) — **`checkin` as a new entry type** (no new domain/table): `CheckinDetail={habitId, habitName, kind, answer, note?}` encrypted in the detail like every entry; idempotency `habitId:date`; change-answer = PATCH.

### F7 — Local notifications *(slice 4)*
- **APP-026** (Opus 4.8, M) — `Notifier` interface + `expo-notifications` impl; scheduling wired to habits; calm/optional permission ask. Local scheduling **works in Expo Go SDK 56** (iOS clean; Android harmless warning); interactive lock-screen Yes/No is the one untrusted slice — if it fails in Expo Go it stubs behind the interface for APP-007 (STT/OIDC pattern), in-app stack as the working path. Fold/supersede `src/db/notify.ts`. *Backend: none (notifications stay local — CEO).*

### F8 — Trends *(slice 6)*
- **APP-027** (Opus 4.8, L) — Food tab: W/F/M, calories bars↔curve, consumed vs spent, macro balance, water, meal-time dot plot; scrub-by-drag; aggregated on device; estimates labeled; vacation-day filter hook.
- **APP-028** (Opus 4.8, M/L) — Activity tab: muscles heatmap reusing `BodyMap`, ranked chips, aerobic minutes, workout squares → session list → preview sheet. *Backend: none beyond BE-017.*

### F9 — Account & settings *(slice 7)*
- **APP-029** (Sonnet, M) — Account screen (profile expand; units apply everywhere via PATCH /me; Your setup deep-links; notification toggles drive APP-026; sign out) + Integrations screen as **honest UI-only toggles** (real health sync in the blocked appendix). *Backend: none — prefs stay local.*

### F10 — Vacation mode *(slice 7)*
- **APP-030** (Opus 4.8, M/L) — date-range sheet, sea-tone accent via one state-driven token source, Home banner, notification pausing, trends hide-days, trip habit by voice. **Resulting ranges sync to backend via outbox** (D1).
- **BE-025** (Sonnet, S, v0.4.0) — `GET/PUT /me/vacations`: encrypted JSON array of `{start,end}`, replace-on-write; server never reads it.

### F11 — Export PDF *(slice 7 — on-device, D2)*
- **APP-031** (Sonnet, M) — export sheet with per-audience content chips → HTML from local SQLite → `expo-print` → `expo-sharing`. Estimates labeled in the PDF; nothing leaves the device until shared. New deps `expo-print`, `expo-sharing` (Expo Go-OK).

### F12 — Energy *(slice 7)*
- **APP-032** (Sonnet, S) — "spent" = sum of logged workout kcal (labeled estimate) **+ manual add with dual input** (type a number / voice "burned 300"), written as a manual workout entry via the existing confirm/outbox path (D8); health-source part shows "Connect a health source", never fabricated. *Backend: none.*

---

## Tech debt & real adapters (slice 8, some anytime)

| Ticket | Owner | What | Model / Size |
|---|---|---|---|
| BE-023 | backend | Verify & pin AI model ids (`plan-pdf-model` unverified/wrong; F3 needs a vision-capable id). **Do early — gates F3/F4.** | Sonnet / S |
| BE-022 | backend | Magic-link token cleanup job (reuse `jobs/` queue). Anytime. | Sonnet / S |
| OPS-020 | devops | **LocalStack** service in backend compose behind a `localstack` profile; `SERVICES=s3,kms`; init via `awslocal` one-liner (not Terraform); plain `up` stays Postgres-only; adapters test against `:4566`. | Sonnet / S |
| BE-026 | backend | Real S3 `FileStore` presigner tested against LocalStack (PDF import path). Needs OPS-020. | Sonnet / M |
| BE-027 | backend | Real KMS `KeyWrapper` (DEK envelope) tested against LocalStack — security-critical, real test value. Needs OPS-020. | Opus 4.8 / M |
| APP-033 | app | Offline pending-interpretation outbox op + NetInfo reconnect drain (new dep `@react-native-community/netinfo`, Expo Go-OK). | Opus 4.8 / M |
| APP-034 | app | Maestro E2E smoke (onboarding→capture→confirm→timeline + auth deep link) once slices stabilize. | Sonnet / M |
| APP-035 | app | Fidelity pass vs prototype (wave draw-on, entrance animations, check-ins banner motion, vacation transitions). | Sonnet / S–M |

Cancelled/dropped: **OPS-018** app CI (CEO: no GitHub CI/CD — local pre-merge checklist instead, to be documented in `app/Doc/`); OPS-019 local bootstrap (compose+bootRun already works); BE-021 trends aggregate (D4); SES real Mailer (deferred to F-LAST, `LogMailer` covers local).

## Blocked appendix — waiting on CEO accounts (NOT in this backlog)

Apple Developer + Play Console unblock: **APP-007** (dev build) → real voice STT, native Google/Apple OIDC (**BE-007**), interactive lock-screen notification actions (if Expo Go can't), real Apple Health / Health Connect (energy from device, integrations). Nothing above depends on these — native-only capabilities ship stubbed behind interfaces, honestly labeled.

## F-LAST — Production deploy (UNSCHEDULED — parked reference runbook)

CEO Round 10: no AWS deploy for now; **Terraform stays ready** (code maintained, no applies). LocalStack (OPS-020 + BE-026/027) means the real S3/KMS adapters arrive at F-LAST already exercised — the prod flip becomes a bean swap + config.

Pre-flight (anytime): finish OPS-004 — CEO sets repo Variables + PR/fork negative tests + no-op apply.
1. **BE-004** build & push arm64 image to ECR. 2. **[CEO]** RDS password + 7 SSM values + `db-credentials`; backend confirms port 8080, `/health`, secret env names. 3. `desired_count` → 1 (**[CEO]-approved plan**). 4. Flyway one-off task. 5. Health 200 via the API GW URL; rollback + task-role negative tests. 6. OPS-016 magic-link redirect. 7. OPS-012 SES out of sandbox (+ real `Mailer`). 8. OPS-011 prod S3 FileStore bean (PDF only — photos are multipart, never touch S3). 9. OPS-015 observability (AMP + ADOT + minimal alarms incl. $10/mo Claude budget; Grafana local). 10. OPS-013/014 end-to-end verify. 11. OPS-017 RDS restore rehearsal.

New infra demanded by the local features at deploy time: **none**. Cost live ≈ $25–40/mo at 5 users, under the $40 alarm.

## Open questions for the CEO

**None.** Round 10 closed them all. The only future CEO signals needed: (a) calling the F-LAST deploy milestone, (b) Apple/Play accounts for the blocked appendix.
