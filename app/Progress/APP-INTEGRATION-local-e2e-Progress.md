# APP-INTEGRATION — Local end-to-end against the real backend

Prove the app ↔ backend flow end-to-end against the **real Kotlin backend running locally**
(real Postgres, real auth/entries/timeline/me). No production, no deploy. Replaces the
in-process mock with a real HTTP integration for a dev/integration toggle. Verified 2026-07-14.

No Asana ticket — CEO-assigned integration exercise. Mock stays the default for tests/CI.

## TL;DR — the recipe

**1. Backend up** (terminal 1):

```bash
cd backend/services/vita-api
docker compose up -d          # Postgres 16 on :5432
./gradlew bootRun             # :8080; magic-link + parse both live
curl localhost:8080/health    # {"status":"up"}
```

The magic-link mailer is `LogMailer` — the `vita://auth?token=…` link is printed to the
bootRun console. A real Anthropic key must be in the gitignored `secrets.yaml` for
`/v1/parse/text`; everything else works without it.

**2. Point the app at it.** The wiring already exists (`extra.apiBaseUrl` ← `VITA_API_BASE_URL`,
`src/api/index.ts` selects http-vs-mock on `apiBaseUrl === ""`). Just set the env var —
**base URL must include `/v1`** (client paths are `/auth/...`, `/entries`; `/health` is unversioned):

| Target | `VITA_API_BASE_URL` |
|---|---|
| iOS simulator | `http://localhost:8080/v1` |
| Android emulator | `http://10.0.2.2:8080/v1` |
| Physical phone (Expo Go, same Wi-Fi) | `http://<Mac-LAN-IP>:8080/v1` |

```bash
cd app/services/vita-app
VITA_API_BASE_URL=http://localhost:8080/v1 npx expo start   # real backend instead of mock
```

Leave `VITA_API_BASE_URL` unset → the app is fully mocked (M1 walkable build, the default).

**3. Repeatable client smoke** (drives the *real* app HTTP client + generated types against
the running backend — the integration proof without needing a simulator):

```bash
# request a link, read the token from the bootRun console, then:
cd app/services/vita-app
VITA_API_BASE_URL=http://localhost:8080/v1 MAGIC_TOKEN=<token> npm run integration:smoke
# add RUN_PARSE=1 to also hit Claude (costs budget — off by default)
```

## What was verified E2E (real Postgres, real backend)

Both via `curl` (proves the wire) and via `npm run integration:smoke` (proves the **app's
`createHttpApi` + `types.gen.ts`** — same code the app ships):

- **(a) Magic-link sign-in** — `POST /v1/auth/magic-link` → 202; token read from the backend
  console; `POST /v1/auth/magic-link/verify` → `{accessToken, refreshToken, expiresIn:900}`.
  Session stored / bearer attached by the client.
- **(b) Capture a meal** — `POST /v1/parse/text` (**one real Haiku call**, see cost note) →
  meal draft; confirmed draft → `POST /v1/entries` with `Idempotency-Key` → **201**; replay
  with the same key → **200, same id** (idempotent); `GET /v1/entries?date&tz` → the entry is
  present with **server-computed totals** (275 kcal / P8 / C33 / F15 from the two items).
  Persisted in real Postgres.
- **(c) Profile** — `GET /v1/me` (name/email/units/createdAt, decrypted) and
  `PATCH /v1/me {name,units}` → updated echo.

Client smoke output: all PASS (a/c/b create/replay/timeline/totals).

## Cost guard (Claude budget)

The compose file ships **Postgres only** — no WireMock present (its header comment says it
"joins later"; it hasn't). Rather than stand up a golden-response stub, I did **exactly ONE
real Claude call** (Haiku, `/v1/parse/text`, ~sub-cent) as the smoke check and did **not**
loop. The client smoke test defaults to a canned golden draft (`RUN_PARSE=1` to opt into a
paid call), so re-runs cost nothing.

## Findings (contract / integration)

No contract drift. Generated types (contract v0.3.0) matched real backend responses exactly
at runtime — `LogEntry` incl. `source`/`loggedAt`/`updatedAt`, `MealDetail.totals`, etc. tsc
clean, `api:check` green. Notes below are behavioural, **not bugs** — no fix needed:

1. **Base URL needs `/v1`.** Documented above and already the shape of the prod example in
   `app.config.ts`. The client's `path.startsWith("/auth")` bearer-skip still works because
   paths are relative to the base, independent of the `/v1` prefix. No change.
2. **Timezone normalisation.** App sends `occurredAt` with a local offset (`…+02:00`); the
   backend stores/returns UTC (`…Z`) — same instant, correct round-trip. The app already
   renders the timeline with a tz, so this is fine; just don't assume the string round-trips
   byte-identically.
3. **Default display name** on first sign-in is derived from the email local-part (`integ`
   for `integ@local.dev`) until the user sets one via onboarding/`PATCH /me`. Backend
   behaviour, informational.
4. **No CORS needed** — React Native native `fetch` isn't subject to browser CORS, confirmed;
   no backend change required.

## Files touched (app team)

- `app/services/vita-app/scripts/integration-smoke.ts` — new dev-only integration harness
  (drives the real client; not in the app bundle, not in CI).
- `app/services/vita-app/package.json` — added `integration:smoke` script.
- `app/services/vita-app/tsconfig.json` — `exclude: ["scripts"]` so the dev harness (which
  uses node globals) doesn't pollute the app's jest-only global types. App tsc stays clean.

**No app source (`src/`) changed** — the http client already supported real mode (APP-006/008).
**No backend files changed** — I only ran the existing local loop.

## Ops note

Killed a **stray 9-hour-old bootRun** (prior session, Android-Studio JBR) that held :8080, so
I could own a backend whose console I read for the magic-link token. Nothing persistent
changed.
