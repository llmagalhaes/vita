# App Team — Next Session

## Current state (Phase 2 — session 3 done 2026-07-13: SDK 54 pin so store Expo Go opens M1 ✅)

- **SDK pinned to 54** (was 57). Public-store Expo Go is frozen at SDK 54 — SDK 55/56/57 were never published to the stores (only via eas go/TestFlight/simulator/CLI). CEO's plain store Expo Go now opens the app. See `Doc/ADRs/ADR-0002-expo-sdk-54-store-expo-go.md` + `Progress/APP-SDK54-expo-go-fix-Progress.md`.
- **Version alignment, not a rewrite**: SDK 54 bundles Reanimated **4.1.1** + worklets 0.5.1, so the capture pill and SQLite survive untouched. Only changes: dep versions pinned to SDK 54 bundle, dropped the worklets Jest resolver (SDK-57-only) and unused `@react-native/jest-preset`. No app source touched.
- Verified: `expo install --check` up to date · `expo-doctor` 18/18 · `tsc --noEmit` clean · **Jest 23/23 (6 suites)** · `expo export` iOS Hermes bundle OK · `expo config` reports **sdkVersion 54.0.0**.
- **⚠️ Do not bump past SDK 54** until Expo publishes a newer public-store Expo Go (or we move to a dev-client/TestFlight build, which needs the CEO's Apple/Play accounts — the APP-007 blocker). `npx expo install --check` is the guard.

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

1. **APP-008 auth screens + magic link** (vita://auth deep link, expo-secure-store, serialized refresh) — client auth endpoints still to add in `src/api`.
2. **APP-012 voice capture** (hold-to-talk on the pill; pill already reserves the gesture).
3. **APP-014 meal detail** (Donut primitive; timeline meal cards currently don't navigate).
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
