# APP — Pin Expo SDK to 56 for store Expo Go (M1 blocker)

Asana: (CEO-reported blocker, mid-M1) — Vita frontend board `1216519867368576`.
ADR: `app/Doc/ADRs/ADR-0002-expo-sdk-56-store-expo-go.md`

## Problem

CEO's latest store Expo Go rejects the project. Scaffold was on SDK 57 / RN 0.86,
which is not yet published to the public stores (awaiting Apple approval). His
store Expo Go is on **SDK 56** — it reports "Either upgrade this project to SDK 56
or install an older version of Expo Go" (SDK 54 is too old for his device; SDK 57
too new / not in stores).

## Root cause

Public-store Expo Go tracks the latest **stable** SDK Expo has shipped to the
stores = **SDK 56**. SDK 57 runs only via eas go / TestFlight / simulator / CLI
(accounts or native build — off-limits for M1). So SDK 56 is the target.

## What changed (package.json only, no app source)

- Every `expo`/`expo-*`/RN/community-native dep pinned to SDK 56's
  `bundledNativeModules` versions (table in ADR-0002). expo `~56.0.15`,
  RN `0.85.3`, react `19.2.3`, reanimated `4.3.1`, worklets `0.8.3`,
  expo-sqlite `~56.0.5`, expo-router `~56.2.14`, svg `15.15.4`,
  gesture-handler `~2.31.1`, safe-area `~5.7.0`, screens `4.25.2`; dev
  typescript `~6.0.3`, jest-expo `^56.0.5`.
- Re-added `@react-native/jest-preset ^0.85.3` dev dep — SDK 56's `jest-expo`
  requires the RN Jest preset as a peer (it moved out of RN core). (0.85.x is
  published, unlike the 0.81.x that didn't exist for the earlier SDK-54 attempt.)
- Kept Jest `resolver: react-native-worklets/jest/resolver.js` — worklets 0.8.3
  ships it, needed for Reanimated to resolve in tests.
- Regenerated `package-lock.json` (clean `rm -rf node_modules` + `npm install`).
- `app.config.ts` untouched (New Arch is SDK 56 default).

## Verification (all green)

- `npx expo install --check` → "Dependencies are up to date"
- `npx expo-doctor` → 21/21 checks passed
- `npx tsc --noEmit` → clean (exit 0)
- `npx jest` → **23/23 passed, 6 suites** (incl. Reanimated capture pill, SQLite home/onboarding)
- `npx expo export --platform ios` → production Hermes bundle built, no errors
- `npx expo config --json` → **sdkVersion 56.0.0** (store-Expo-Go compatible)

## Security — npm audit (2026-07-13)

`npm audit`: **10 moderate, 0 high, 0 critical.** All 10 are one root advisory
(`uuid` GHSA-w5hq-g745-h8pq) reached transitively through the **Expo CLI build
toolchain** (`@expo/cli`, `@expo/config`, `@expo/metro-config`, `xcode`, …).

- **Nothing fixed** — deliberately. `npm audit fix` (no --force) fixes 0 (the only
  offered path is downgrading `expo` to 46, semver-major, would destroy SDK 56).
- **Dev/build-time only**: none of these ship in the app's Hermes runtime bundle.
- **Not reachable in Expo's usage**: Expo mints v4 uuids with no `buf` arg (the
  advisory only triggers with a `buf` argument to v3/v5/v6).
- **Upstream-deferred**: they move when Expo bumps its own `uuid`. No `overrides`
  applied — forcing uuid risks breaking `@expo/cli`, i.e. `expo start`/`export`.
- The deprecation warnings the CEO saw at install (inflight, rimraf@3, glob@7 ×7,
  abab, whatwg-encoding, domexception, uuid@7) are transitive dev deps of the
  jest/jsdom + Expo CLI toolchains — **deprecations, not vulnerabilities** — same
  accepted-upstream bucket.

## The command sequence for the CEO

```
cd app/services/vita-app
npm install
npx expo start          # then scan the QR with plain store Expo Go (SDK 56)
```

Walk: onboarding (6 steps) → Home/Today → tap capture pill → type
"Had a banana and a handful of peanuts around 4" → "Making sense of it…" →
confirmation card → Confirm → timeline. All offline on SQLite (no backend, no
`VITA_API_BASE_URL`).

## Constraint going forward

Do not bump past SDK 56 until Expo publishes SDK 57 to the public stores, or the
project moves to a dev-client/TestFlight build (needs the CEO's Apple Developer +
Play Console accounts — the existing APP-007 blocker). `expo install --check` is
the guard: it must stay "up to date" on any dependency change.
</content>
