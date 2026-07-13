# APP — Downgrade Expo SDK 57 → 54 for store Expo Go (M1 blocker)

Asana: (CEO-reported blocker, mid-M1) — Vita frontend board `1216519867368576`.
ADR: `app/Doc/ADRs/ADR-0002-expo-sdk-54-store-expo-go.md`

## Problem

CEO installed latest store Expo Go, `npx expo start` → "Project is incompatible
with this version of Expo Go". Scaffold was on SDK 57 / RN 0.86.

## Root cause (verified 2026-07-13 against Expo changelog)

Public App Store / Play Store Expo Go is **frozen at SDK 54**. SDK 55/56/57 were
never published to the public stores — only via `eas go` (paid Apple Dev account),
External TestFlight (full), the iOS simulator, or Expo CLI on Android/emulator.
SDK 57's store build is still awaiting Apple approval. On a physical phone with
plain store Expo Go, **SDK 54 is the only openable SDK**.

## What changed

- `package.json`: every `expo`/`expo-*`/RN/community-native dep pinned to SDK 54's
  `bundledNativeModules` versions (table in ADR-0002). expo `~54.0.35`,
  RN `0.81.5`, react `19.1.0`, reanimated `~4.1.1`, worklets `0.5.1`,
  expo-sqlite `~16.0.10`, expo-router `~6.0.24`, svg `15.12.1`,
  gesture-handler `~2.28.0`, safe-area `~5.6.0`, screens `~4.16.0`; dev
  typescript `~5.9.2`, jest-expo `^54.0.17`.
- Removed Jest `resolver: react-native-worklets/jest/resolver.js` — that path
  only exists in worklets 0.10 (SDK 57). `jest-expo@54` mocks Reanimated 4.1
  natively; no resolver needed.
- Removed unused `@react-native/jest-preset` dev dep (no 0.81.x published; never
  referenced).
- Regenerated `package-lock.json` (clean `rm -rf node_modules` + `npm install`).
- No app source changes. `app.config.ts` untouched (New Arch is SDK 54 default).

## Verification (all green)

- `npx expo install --check` → "Dependencies are up to date"
- `npx expo-doctor` → 18/18 checks passed
- `npx tsc --noEmit` → clean (exit 0)
- `npx jest` → **23/23 passed, 6 suites** (incl. Reanimated capture pill, SQLite home/onboarding)
- `npx expo export --platform ios` → production Hermes bundle built (4.28 MB), no errors
- `npx expo config --json` → **sdkVersion 54.0.0** (store-Expo-Go compatible)

## The command sequence for the CEO

```
cd app/services/vita-app
npm install
npx expo start          # then scan the QR with plain store Expo Go
```

Walk: onboarding (6 steps) → Home/Today → tap capture pill → type
"Had a banana and a handful of peanuts around 4" → "Making sense of it…" →
confirmation card → Confirm → timeline. All offline on SQLite (no backend, no
`VITA_API_BASE_URL`).

## Constraint going forward

Do not bump past SDK 54 until Expo publishes a newer public-store Expo Go, or the
project moves to a dev-client/TestFlight build (needs the CEO's Apple Developer +
Play Console accounts — the existing APP-007 blocker). `expo install --check` is
the guard: it must stay "up to date" on any dependency change.
</content>
