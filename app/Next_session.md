# App Team — Next Session

## Current state (Phase 2 — session 3 done 2026-07-13: SDK 56 pin so store Expo Go opens M1 ✅)

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
