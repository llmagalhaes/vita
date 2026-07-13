# APP-002 — Expo scaffold — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216519895179137
- **Status**: implemented 2026-07-13; code + tests green locally. Done pending "in production" (tester build — blocked on Apple/Google accounts, CEO Round 5 §3).

## 2026-07-13

- Created `app/services/vita-app/` via `create-expo-app` (blank-typescript): Expo SDK 57, RN 0.86, React 19.2, TypeScript strict.
- `app.config.ts` (replaces app.json): display name a single constant (store name TBD — CEO Round 5), slug `vita`, scheme `vita://`, `com.llmagal.vita` on both platforms, `userInterfaceStyle: light`, `supportsTablet: false`, `extra.apiBaseUrl` from `VITA_API_BASE_URL` env — never hardcoded (`src/config.ts` reads it via expo-constants).
- Expo Router wired (`app/_layout.tsx` Stack + Nunito font loading, `app/index.tsx` placeholder Home).
- Jest + jest-expo + @testing-library/react-native v14 (async render API). Gotchas pinned: jest must be 29.x (jest-expo 57 peer), `@react-native/jest-preset` and `test-renderer` are required peers, `.npmrc` `legacy-peer-deps=true` for expo-router's radix peers.
- **Checks green**: `npx tsc --noEmit` clean; `npx jest` 2 suites / 5 tests pass; `npx expo config` resolves the expected values.
- Not done here (deliberate): min-OS pinning via expo-build-properties (iOS 16 / Android 10) lands with the first prebuild; one-command release script is APP-007 territory.
