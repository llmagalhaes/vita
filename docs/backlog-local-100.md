# Backlog — "Vita 100% local"

> CEO directive (2026-07-14): the previous autonomous backlog is exhausted. New goal: **the app working 100% locally, feature by feature** — for each feature, the steps each team needs. **Production deploy is the LAST milestone (F-LAST).**
>
> Method: orchestrator draft → the three team leads reviewed it in parallel (round 1) → cross-team asks reconciled between the leads (round 2) → this consolidated plan. Local DoD everywhere: backend `./gradlew check` green + contract-first (redocly); app `tsc` clean + Jest green + walkable in **store Expo Go SDK 56** (no dev-build dependency); nothing touches AWS before F-LAST.
>
> Asana sync: tickets below get created on the team boards (with their `Model:` lines) as each slice starts. This file is the plan of record until then.

## Decisions the teams closed in reconciliation (CEO can veto any)

| # | Decision | Who converged |
|---|---|---|
| D1 | **Habits, check-ins, notification prefs, vacation state = local-first on device (SQLite/kv), no backend this milestone.** Server sync/multi-device is an explicit future ticket. | app + backend |
| D2 | **Export PDF = on-device** (`expo-print` + `expo-sharing`). The log never leaves the phone until the user shares the file. No backend job, no exports infra. | app + backend + devops |
| D3 | **Photo transport = multipart direct to `POST /parse/photo`** (already in contract v0.3.0: `image` binary + optional `caption`/`capturedAt`; app downscales to 1568px JPEG q0.8). No `/uploads` involvement, no base64. `/uploads` stays PDF-only. | app + backend |
| D4 | **Trends aggregation = client-side over SQLite** for the selected W/F/M window (fetched via BE-017 range in real mode). Backend aggregate endpoint (was BE-021) **dropped**; noted as upgrade path only. Activity/muscle data is encrypted server-side, so it was never a server-aggregation candidate. | app + backend |
| D5 | **Plan/program = singular per-user resources**, `GET/PUT /me/eating-plan` + `GET/PUT /me/training-program`, replace-on-write, storing the confirmed BE-015 draft shape as one encrypted blob (per-user DEK). Portion-slider "save" = whole-plan PUT. | app + backend |
| D6 | **Contract v0.4.0** = one bump bundling BE-017's additive `GET /entries` params + the new plan/program paths. One redocly pass, one ADR (extends ADR-0011). `/parse/photo` needs nothing (shipped in v0.3.0). | backend |
| D7 | **CI**: `backend-ci.yml` + `contract-lint.yml` already exist and pass (draft was wrong). The only gap is **app CI** → OPS-018 (`npx tsc --noEmit` · `npx jest --ci` · `npm run api:check`; `expo export` stays a local pre-merge check, not CI). Lands **before F1**. | app + devops |

## Slice order (each slice CEO-testable in Expo Go)

| Slice | Feature | App tickets | Backend gate | Devops |
|---|---|---|---|---|
| 0 | Guardrail | — | — | **OPS-018** app CI |
| 1 | **F1 Water, complete** | APP-017 | none | — |
| 2 | **F2 Workout, complete (text path)** | APP-018 → APP-019 | **BE-017** (30-day history) | — |
| 3 | **F4/F5 Eating plan + training program, persisted** | APP-021 → APP-022 → APP-023 | **BE-019 + BE-020** (+BE-023 early) | — |
| 4 | **F6 Habits & check-ins + F7 Local notifications** | APP-024 → APP-025 → APP-026 | none (uses F4 plan for plan check-ins) | — |
| 5 | **F3 Photo capture** | APP-020 (can start on mock drafts) | **BE-018** | — |
| 6 | **F8 Trends** | APP-027 → APP-028 (needs APP-019 BodyMap) | BE-017 (already done) | — |
| 7 | **F9 Account / F10 Vacation / F11 Export** | APP-029 → APP-030 → APP-031 (+APP-032) | none | — |
| 8 | Tech debt sweep | APP-033/034/035 · BE-022 (anytime) | — | — |
| 9 | **F-LAST Production deploy** | — | BE-004 | runbook below |

Backend order within that: **BE-017** (first, gates slice 2) → **BE-023** (cheap, gates F3/F4 correctness) → **BE-019 + BE-020** (gate slice 3) → **BE-018** (gates slice 5) → **BE-022** (debt, anytime).

---

## Features & tickets

### F1 — Water, complete *(slice 1)*
- **APP-017** (Sonnet, M) — Home Water card expands to the day's log list (amount/time/method, units-aware); timeline water cards navigate to a new `water/[id]` detail screen; quick-add unchanged via outbox. Clears the "water card doesn't navigate" debt. *Backend: none — water is already a first-class entry type (`/entries`, `/entries/{id}`).*

### F2 — Workout, complete (text path) *(slice 2)*
- **APP-018** (Sonnet, S/M) — workout-shaped confirm card (title, duration, kcal *estimate*, muscle chips, exercises) → entry via outbox; timeline workout cards navigate. Clears the "workout card doesn't navigate" debt.
- **APP-019** (Opus 4.8, L) — workout detail: source badge, **interactive front/back `BodyMap` SVG primitive** (built once, reused by F8), exercises, 30-day history strip → preview sheet.
- **BE-017** (Sonnet, S, contract v0.4.0 additive) — `GET /entries` gains optional `from`/`to`/`type`. Keyset cursor and single-`date` behaviour unchanged; 400 on `from>to`/bad type. Shared prerequisite for slices 2/6 and F12 (device is a cache in real mode — it won't hold 30 days).

### F3 — Photo capture *(slice 5; app half can start earlier on canned mock drafts)*
- **APP-020** (Opus 4.8, M/L) — pill camera → `expo-image-picker` (**works in Expo Go, verified**) → multipart to `/parse/photo` → items with quantity steppers (remove/discard) → existing confirm path adds a meal (plate) or workout (whiteboard). Calm permission states, "type instead" fallback.
- **BE-018** (Opus 4.8, M, no contract change) — implement `/parse/photo` (Claude vision via `ClaudeClient.callTool` with an image block); image sent to the model and **discarded, never persisted** (ADR-0005); reuses `ParseQuota` 429 + `ParseMetrics`; 413 >5 MB, 422 unrecognizable. Multipart under Boot 4/Jackson 3 is untried surface — verify. Gated on **BE-023** (vision model id).

### F4 — Eating plan, persisted + screen *(slice 3)*
- **BE-019** (Opus 4.8, M, contract v0.4.0 + ADR) — `GET/PUT /me/eating-plan`: PUT stores the confirmed `EatingPlanDraft` as one encrypted blob (per-user DEK, C3), replace-on-write; GET decrypts; empty → 204. Expand-only migration (also carries F5's table), wired into the account-deletion cascade. Repository test proves stored bytes ≠ plaintext.
- **APP-021** (Sonnet, M) — wire onboarding steps 3–4 to the REAL `/parse/eating-plan` + `/parse/training-program`, PUT the confirmed draft; Home plan row + Account "Your setup" read the persisted plan. **Kills the client-side mock read-back debt.**
- **APP-022** (Opus 4.8, L) — Eating plan screen (prototype §10): meal cards, per-item portion sliders with live local recompute, estimates labeled; save = whole-plan PUT.

### F5 — Training program, persisted *(slice 3, merged with F4 — the draft over-cut it)*
- **BE-020** (Sonnet, S–M, contract v0.4.0) — `GET/PUT /me/training-program`, mechanical mirror of BE-019 (same migration file, same ADR).
- **APP-023** (Sonnet, S) — minimal program summary screen (split/days/exercises) off Account "Your setup". Onboarding wiring is already APP-021 (shared `PlanStep`).

### F6 — Habits & check-ins *(slice 4 — local-first, D1)*
- **APP-024** (Sonnet, M) — Manage tab: SQLite habits domain (name, days, time, enabled, optional plan-meal link, 14-day dots), CRUD, dual-input new-habit form. "A single yes or no per check-in — no streaks, no scores."
- **APP-025** (Opus 4.8, M/L) — Today tab + check-in stack sheet + Home "N waiting" banner; plan check-in "Yes" auto-logs the plan's meal via the existing confirm path (`POST /entries` — the only server touch, exists); "Not quite" opens capture. *Backend: none. Depends on F4 for plan-linked check-ins.*

### F7 — Local notifications *(slice 4)*
- **APP-026** (Opus 4.8, M) — `Notifier` interface + `expo-notifications` impl; scheduling wired to habits; calm/optional permission ask. **Verified partial in Expo Go SDK 56:** local scheduling works (iOS clean; Android with a harmless warning); interactive lock-screen Yes/No actions are the one untrusted slice — if they don't fire in Expo Go, that slice stubs behind the interface for APP-007 (same pattern as STT/OIDC), with the in-app check-in stack as the working path. Fold/supersede the existing `src/db/notify.ts` — no second notify module. *Backend: none (CEO decision: local, no server push v1).*

### F8 — Trends *(slice 6 — client-side, D4)*
- **APP-027** (Opus 4.8, L) — Food tab: W/F/M, calories bars↔curve, consumed vs spent, macro balance, water, meal-time dot plot; all scrub-by-drag; aggregated on device; estimates labeled; vacation-day filter hook for F10.
- **APP-028** (Opus 4.8, M/L) — Activity tab: muscles-worked heatmap reusing `BodyMap` (APP-019), ranked chips, aerobic minutes, workout squares → session list → preview sheet. Encrypted workout detail means the server never aggregates this — client-side by design. *Backend: none beyond BE-017.*

### F9 — Account & settings *(slice 7)*
- **APP-029** (Sonnet, M) — Account screen (expandable profile; units apply everywhere immediately via PATCH /me; Your setup rows deep-link plan/program/habits/integrations; notification toggles drive APP-026; sign out) + Integrations screen as **honest UI-only toggles** ("not connected" — real Apple Health/Health Connect sync is in the blocked appendix). *Backend: none — prefs stay local (D1).*

### F10 — Vacation mode *(slice 7)*
- **APP-030** (Opus 4.8, M/L) — date-range sheet, sea-tone accent swap via a single state-driven token source (no per-screen edits), Home banner, notification pausing within range, trends hide-days filter, trip habit by voice reusing the habits form. *Backend: none.*

### F11 — Export PDF *(slice 7 — on-device, D2)*
- **APP-031** (Sonnet, M) — export sheet with per-audience content chips → HTML from local SQLite → `expo-print.printToFileAsync` → `expo-sharing`. Estimates labeled in the PDF; nothing leaves the device until the user shares. New deps `expo-print`, `expo-sharing` (Expo Go-compatible, SDK 56). *Backend/devops: none.*

### F12 — Energy card *(folded into slice 7 — not a real feature)*
- **APP-032** (Sonnet, XS, foldable into APP-029) — honest copy: "spent" = sum of logged workout kcal (labeled estimate); the health-source part shows "Connect a health source", never a fabricated number. *Backend: none (consumed/spent both come from existing entry data via BE-017).*

---

## Tech debt & best practices (scheduled, not optional)

| Ticket | Owner | What | Model / Size |
|---|---|---|---|
| OPS-018 | devops | App CI on PRs (`tsc --noEmit` · `jest --ci` · `api:check`), mirrors backend-ci; free tier, no AWS. **Before F1.** | Sonnet / S |
| BE-023 | backend | Verify & pin AI model ids — `vita.ai.plan-pdf-model = claude-sonnet-4-6` is unverified/wrong; F3 needs a confirmed vision-capable id. **Gates F3/F4.** | Sonnet / S |
| BE-022 | backend | Magic-link token cleanup job (reuse `jobs/` queue + V003). Anytime. | Sonnet / S |
| APP-021 | app | Onboarding mock read-back → real endpoints (counted in F4). | — |
| APP-017/018 | app | Water/workout card navigation (counted in F1/F2). | — |
| APP-033 | app | Offline pending-interpretation outbox op + NetInfo reconnect drain (new dep `@react-native-community/netinfo`, Expo Go-OK). | Opus 4.8 / M |
| APP-034 | app | Maestro E2E smoke (onboarding→capture→confirm→timeline + auth deep link) once slices stabilize. | Sonnet / M |
| APP-035 | app | Fidelity pass vs prototype (wave draw-on, entrance animations, check-ins banner motion, vacation transitions). | Sonnet / S–M |

Dropped as not-work: OPS-019 one-command local bootstrap (compose+bootRun already works — add only if someone files the friction); BE-021 trends aggregate (D4); APP-036 (folded into OPS-018).

## Blocked appendix — waiting on CEO accounts (NOT in this backlog)

Apple Developer + Play Console unblock: **APP-007** (dev build) → real voice STT, native Google/Apple OIDC (**BE-007**), interactive lock-screen notification actions (if Expo Go can't), real Apple Health / Health Connect (energy "spent", integrations). Nothing above depends on these — where a capability is native-only it ships stubbed behind an interface, honestly labeled.

## F-LAST — Production deploy milestone (devops runbook, parked until the CEO calls it)

Pre-flight (anytime): finish OPS-004 — CEO sets repo Variables (`AWS_PLAN_ROLE_ARN`, `AWS_APPLY_ROLE_ARN`, `AWS_REGION=eu-west-1`) + PR/fork negative tests + no-op apply.

1. **BE-004** — build & push the arm64 image to ECR (Dockerfile ready).
2. **[CEO]** RDS master password + 7 real SSM SecureStrings under `/vita/prod/*` + `db-credentials`; backend confirms container port 8080, `/health`, secret env names for the ECS task def.
3. Flip `module.ecs.desired_count` → 1 (**[CEO]-approved plan**).
4. Flyway one-off task — all F1–F11 tables ride the same migration chain.
5. Health 200 via `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`; rollback + task-role negative tests; hand the URL to the app.
6. OPS-016 magic-link redirect → prod URL. 7. OPS-012 SES out of sandbox. 8. OPS-011 prod S3 `FileStore` bean (PDF uploads only — photos are multipart, never touch S3, D3). 9. OPS-015 observability (AMP + ADOT + minimal alarms; Grafana local on the CEO's Mac) — includes the $10/mo Claude budget alarm (photo vision + PDF Sonnet both spend). 10. OPS-013/014 end-to-end verify. 11. OPS-017 RDS restore rehearsal.

New infra demanded by the local features at deploy time: **none** (photos = multipart, exports = on-device; F4/F5/F6 tables ride existing RDS+Backup). Fargate task memory should be checked for the vision round-trip. Cost live ≈ $25–40/mo at 5 users, under the $40 alarm.

## Open questions for the CEO (the only ones that survived reconciliation)

1. **Habits/notification-prefs/vacation: local-only on device (teams' default, D1) or server-synced** so they survive reinstall / multi-device? Local ships now; sync is a future backend domain.
2. **Plan/program cardinality:** one-per-user, replaced on re-import (default, D5) — or keep a history of past plans?
3. **Eating-plan portion edits persist** (whole-plan PUT, D5) — confirm that's the product intent vs display-only "what-if".
4. **Training program screen depth:** is the minimal read-back summary (APP-023) enough for v1?
5. **Energy "spent":** sum of logged workout kcal (labeled estimate) + "connect a health source" for the rest — OK, or offer interim manual entry?
6. **F-LAST trigger:** what flips prod on — F1–F11 all local-green, a date, or your explicit call? (Devops needs the signal; nothing applies before it.)

Vetoable team defaults already applied: export on-device (D2), photo multipart (D3), trends client-side (D4).
