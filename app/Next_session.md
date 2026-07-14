# App Team — Next Session

## Current state (Phase 2 — session 6 done 2026-07-14: APP-INTEGRATION local E2E vs REAL backend ✅)

- **App ↔ real Kotlin backend proven end-to-end locally** (real Postgres, real auth/entries/timeline/me). No prod, no deploy. The mock stays the default for tests/CI; real mode is a dev toggle via `VITA_API_BASE_URL`.
- **Recipe** (full detail in `Progress/APP-INTEGRATION-local-e2e-Progress.md`): backend = `cd backend/services/vita-api && docker compose up -d && ./gradlew bootRun` (health 200 on :8080; magic-link token printed to console by `LogMailer`). App = `VITA_API_BASE_URL=http://localhost:8080/v1 npx expo start`. **Base URL must include `/v1`** (client paths are relative; `/health` is unversioned). iOS sim `localhost`, Android emu `10.0.2.2`, physical Expo Go `<Mac-LAN-IP>`.
- **Verified all three flows** via curl AND via the real app client (`createHttpApi` + `types.gen.ts`): (a) magic-link request→verify→session; (b) parse/text→confirm→POST /entries (Idempotency-Key → 201, replay 200 same id) → timeline reflects it with server-computed totals (275 kcal), persisted in real Postgres; (c) GET/PATCH /me. New `npm run integration:smoke` harness (`scripts/integration-smoke.ts`) re-runs it.
- **No contract drift** — generated types (v0.3.0) matched real responses exactly. Behavioural notes (not bugs): base URL needs `/v1`; app sends `occurredAt` with local offset, backend returns UTC `Z` (same instant); default name = email local-part until set; no CORS needed (native fetch).
- **Cost guard**: compose ships Postgres only (no WireMock). Did exactly ONE real Haiku parse call as the smoke check, no loop; client smoke defaults to a canned golden draft (`RUN_PARSE=1` to opt into a paid call).
- Gates green: `tsc` clean · **Jest 51/51 (10 suites, mock default)** · `expo install --check` up to date · no new deps (tsx already a dev dep) · SDK 56 preserved. Files touched (app): `scripts/integration-smoke.ts` (new), `package.json` (+script), `tsconfig.json` (`exclude: ["scripts"]`). No `src/` change, no backend change.

## Prior state (Phase 2 — session 5 done 2026-07-13: APP-008 auth + magic link ✅ OIDC native stubbed)

- **APP-008 built** (In progress on Asana). Passwordless sign-in faithful to the prototype: `app/auth.tsx` (provider consent "nothing else" + email magic link "No passwords — ever"). Deep link `vita://auth?token=…` handled cold + warm (`src/auth/useMagicLink.ts`); token exchanged via `src/auth/session.ts` (single source of truth, **expo-secure-store**, single-flight refresh, sign-out, survives restart). API client gained the 5 auth methods + **Bearer injection + 401 silent-refresh** (hooks injected in `src/api/index.ts` via lazy thunks to dodge the session⇄api cycle). Auth gate: `app/index.tsx` (signed-out → `/auth`), `(main)/_layout.tsx` bounces to `/auth` on sign-out, root `_layout.tsx` reads the session before gating. React state via `useSyncExternalStore` (`useAuth`/`useAuthReady`), no provider. i18n `auth.*`. `tsc` clean · **Jest 51/51 (10 suites)**, +12 · `expo install --check` up to date (only new dep expo-secure-store ~56.0.4, SDK 56 preserved) · `expo export` iOS OK · `api:check` green (types.gen.ts regenerated to contract 0.3.0). See `Progress/APP-008-auth-magic-link-Progress.md`.
- **Google/Apple native sign-in is stubbed** (`src/auth/oidc.ts` `getOidcIdToken`) — same pattern as APP-012. Native OIDC needs a dev build (**APP-007**, CEO store accounts). Mock mode returns a fake id token so the consent→session demo flows in Expo Go; a real API base URL throws `OidcUnavailable` → screen shows "use email for now". Swap one function at APP-007, zero UI change.
- **Expo Go demo**: first screen is Sign in. Email → "Send link" → "Check your inbox" → **"Open the link · demo"** re-enters via the real `vita://auth` deep link → session → onboarding → Home. Or tap Google/Apple → consent → Accept → session.

## Prior state (Phase 2 — session 4 done 2026-07-13: APP-012 voice capture ✅ recognition stubbed)

- **APP-012 hold-to-talk built** (In progress on Asana). Press-and-hold the pill's mic → live-transcript overlay → release-to-send routes the final text through the **existing APP-011 parse→confirm path** (no parallel stack). Quick tap still toggles the text field. Slide up while holding → "Release to cancel". Calm permission/denied/unavailable/error states with a **Type instead** fallback to text. New files: `src/capture/speech.ts` (`SpeechRecognizer` interface + `stubRecognizer` + `getRecognizer`/`setRecognizer`), `src/capture/useVoiceCapture.ts` (state machine), `src/capture/VoiceOverlay.tsx`. Mic gesture = gesture-handler `Pan` (runOnJS) on the pill. i18n `capture.voice.*`. Mic/speech permission strings pre-declared in `app.config.ts` (inert in Expo Go). `tsc` clean · **Jest 39/39 (8 suites)**, +14 · `expo install --check` up to date (no new deps, SDK 56 preserved) · `expo export` iOS OK. See `Progress/APP-012-voice-capture-Progress.md` + **ADR-0003**.
- **Real recognition does NOT run in Expo Go SDK 56 — by design.** `expo-speech-recognition@56.0.1` is a native module + config plugin (verified from tarball) → needs a dev-client build, not in the Expo Go binary. Per the ticket stop-condition it was NOT installed. Recognition is stubbed behind the interface; the real engine drops in at **APP-007** (dev build) via `setRecognizer(real)` with zero UI changes. **Blocker: APP-007 (CEO Apple/Play accounts).**

## Prior state (Phase 2 — session 3b done 2026-07-13: APP-014 meal detail ✅)

- **APP-014 meal detail built** (In progress on Asana; DoD = tester build). New route `app/(main)/meal/[id].tsx`, read-only over SQLite/`getEntry`, faithful to the prototype: hero + estimate tag, source-phrase quote, item breakdown, **macro donut** (new `src/ui/Donut.tsx` primitive), micronutrients vs FDA daily reference (aggregated by name across items), footer. Timeline **meal** cards now `router.push('/meal/<id>')`; water/workout cards don't navigate (their detail screens are later tickets). Seed meal gained `micros` so the screen is full in Expo Go. i18n `mealDetail.*`. Exported `MealItem`/`Micro` from `src/api/client.ts`. `tsc` clean · **Jest 25/25 (7 suites)** · `expo export` iOS OK · SDK-56 guard green. See `Progress/APP-014-meal-detail-Progress.md`.

## Prior state (session 3 — SDK 56 pin so store Expo Go opens M1)

- **SDK pinned to 56** (was 57). Public-store Expo Go tracks the latest **stable** shipped SDK = **56**; SDK 57 is not yet in the stores (awaiting Apple approval, runs only via eas go/TestFlight/simulator/CLI). CEO's store Expo Go (on 56) now opens the app. SDK 54 was too old for his device. See `Doc/ADRs/ADR-0002-expo-sdk-56-store-expo-go.md` + `Progress/APP-SDK56-expo-go-fix-Progress.md`.
- **Version alignment, not a rewrite**: SDK 56 bundles Reanimated **4.3.1** + worklets 0.8.3, so the capture pill and SQLite survive untouched. Changes: dep versions pinned to SDK 56 bundle; kept the worklets Jest resolver; re-added `@react-native/jest-preset ^0.85.3` (SDK 56's jest-expo needs it as a peer). No app source touched.
- Verified: `expo install --check` up to date · `expo-doctor` 21/21 · `tsc --noEmit` clean · **Jest 23/23 (6 suites)** · `expo export` iOS Hermes bundle OK · `expo config` reports **sdkVersion 56.0.0**.
- **npm audit**: 10 moderate / 0 high / 0 critical — all one `uuid` advisory via the Expo CLI build toolchain (dev/build-time only, not in the app bundle, not reachable in Expo's v4 usage). Accepted-upstream; no fix (only path is downgrading expo to 46). Install deprecation warnings are transitive jest/jsdom + Expo-CLI dev deps, not vulns.
- **⚠️ Do not bump past SDK 56** until Expo publishes SDK 57 to the public stores (or we move to a dev-client/TestFlight build, which needs the CEO's Apple/Play accounts — the APP-007 blocker). `npx expo install --check` is the guard.

- **The app is walkable end to end with mock data**: `cd app/services/vita-app && npm install && npx expo start` → Expo Go → onboarding (6 steps) → Home/Today → capture pill → type a phrase ("Had a banana and a handful of peanuts around 4") → "Making sense of it…" → confirmation card → Confirm → timeline. No backend needed: with no `VITA_API_BASE_URL`, `src/api` serves a deterministic in-process mock and SQLite is seeded with a demo morning.
- `tsc --noEmit` clean · **Jest 23/23 green (6 suites)** · iOS Metro production bundle verified via `expo export`.
- **APP-001 closed-pending-nothing**: backend applied both contract edits (contract v0.2.0 — muscles 11-enum, drafts maxItems 5); generated types match.
- **APP-005 built**: SQLite (`entries`/`outbox`/`kv`), instant local writes, idempotency-key drain with backoff + LWW; node:sqlite-backed Jest mock (`__mocks__/expo-sqlite.ts`).
- **APP-006 built**: openapi-typescript codegen (`npm run api:gen` / `api:check` drift gate), typed `Api` iface, http client (RFC 7807), mock client (MSW-equivalent by design — see Progress). TanStack Query deliberately skipped.
- **APP-009/010 built**: single-route 6-step onboarding; shared `PlanStep` for plan/program; settings→kv + fire-and-forget PATCH /me; skippable paths.
- **APP-011 built**: v2 pill (Reanimated unfold, motion tokens in `src/ui`), capture sheet with parse→confirm/adjust/stacked drafts; camera/mic = factual placeholders.
- **APP-013 built**: Home fully offline from SQLite — kcal hero (estimates tag), water quick-add via outbox, macros bars, energy (spent placeholder), plan row, wave-illustrated timeline with "waiting to sync".
- New deps: expo-sqlite, react-native-reanimated 4 (+worklets), gesture-handler, react-native-svg, expo-crypto; dev openapi-typescript. Jest needs `"resolver": "react-native-worklets/jest/resolver.js"` (already in package.json). `app.json` deleted (was duplicating `app.config.ts`).

## Next steps

1. **APP-008 native OIDC** — deferred to APP-007 dev build: implement `getOidcIdToken` in `src/auth/oidc.ts` (@react-native-google-signin + expo-apple-authentication), keep the `/auth/oidc` exchange + consent UI as-is. A Maestro deep-link flow (`vita://auth?token=…`) where the simulator permits. `types.gen.ts` now tracks contract **0.3.0** (plan/program parse-import types available for the onboarding-import ticket).
2. **APP-012 real recognition** — deferred to APP-007 dev build: `npm i expo-speech-recognition`, add its config plugin, implement `SpeechRecognizer`, `setRecognizer(real)`; then a Maestro flow where the simulator permits. UI is done.
3. **Workout detail** (interactive muscle map) + **water detail** — timeline workout/water cards don't navigate yet; `Donut` primitive now exists to reuse.
4. Offline pending-interpretation for capture (unparsed outbox op) once a real API URL exists; NetInfo reconnect drain trigger.
5. Maestro E2E smoke (deferred this session — RNTL covers flows; add when tester builds exist).
6. Fidelity pass vs prototype (wave draw-on animation, check-ins banner with habits wave).

## Blockers / dependencies

- **Plan/program parse-import endpoint missing from contract** — onboarding steps 3–4 use a client-side mock read-back; backend ticket needed (raised to orchestrator).
- Apple Developer + Play Console accounts (CEO) — still blocks APP-007 and any Done.
- API Gateway URL (devops) — blocks exercising the http client for real.

## Key references

- `app/Doc/foundations.md`, `app/Doc/contract-review-v0.md` (all 7 points settled; edits applied in contract v0.2.0).
- Asana "Vita frontend" `1216519867368576`; In progress section `1216521805290095`, Backlog `1216523313289549`.
