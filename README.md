# Vita

**A quiet log of meals, water & movement.** A personal health assistant that records what the user tells it — by voice, text, tap or photo — and shows it back as clearly labeled estimates. No goals, no scores, no streaks, no advice.

Built **100% by AI agents organized as a company** (orchestrator + backend/app/devops team leads), with a human CEO deciding product and priorities. How that works: [`DEVELOPMENT_PROCESS.md`](DEVELOPMENT_PROCESS.md).

## Status (2026-07-14)

Phase 2 — **local-first development**. The core loop (magic-link sign-in → text capture → AI parse → confirm → timeline) is proven end-to-end against the real backend locally. Active plan: [`docs/backlog-local-100.md`](docs/backlog-local-100.md) — everything working 100% locally, feature by feature; AWS stays parked (LocalStack for adapter tests); store publishing comes last (hygiene sweep → AWS deploy → Android vs AWS → iOS on device vs AWS → Play Store → App Store).

## Stack

| Part | Where | Stack |
|---|---|---|
| Mobile app | `app/services/vita-app` | React Native + Expo (SDK 56, store Expo Go compatible), SQLite offline-first, generated API client |
| Backend | `backend/services/vita-api` | Kotlin + Spring Boot 4, Postgres, Flyway, per-user envelope encryption (crypto-shredding), Claude API for parsing |
| Infra | `devops/` | AWS (eu-west-1) via Terraform — applied but parked (~$6/mo); LocalStack locally |
| Contract | `docs/contracts/vita-api-v0.yaml` | OpenAPI, contract-first (currently v0.3.0; v0.4.0 in flight) |

## Run it locally

**App with mock data (no backend needed):**
```sh
cd app/services/vita-app && npm install && npx expo start   # open in Expo Go
```

**App against the real local backend:**
```sh
cd backend/services/vita-api && docker compose up -d && ./gradlew bootRun
# magic-link token is printed to the backend console (LogMailer)
cd app/services/vita-app && VITA_API_BASE_URL=http://localhost:8080/v1 npx expo start
# base URL MUST include /v1 · iOS sim: localhost · Android emu: 10.0.2.2 · device: <Mac-LAN-IP>
```

Checks: backend `./gradlew check` · app `npx tsc --noEmit && npx jest --ci && npm run api:check`.

## Read order for a fresh session

1. [`CLAUDE.md`](CLAUDE.md) — bootstrap + non-negotiables
2. [`Next_session.md`](Next_session.md) — orchestrator state (what just happened, what's next)
3. [`docs/ceo-decisions.md`](docs/ceo-decisions.md) — dated decision log (newest first)
4. [`docs/backlog-local-100.md`](docs/backlog-local-100.md) — the active backlog
5. [`docs/product-brief.md`](docs/product-brief.md) — what Vita is (screens, data model, philosophy)

Tools of record: Git (this repo = the memory) · Asana (tickets) · Notion (living docs).
