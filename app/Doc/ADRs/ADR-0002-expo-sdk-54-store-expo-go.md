# ADR-0002 — Pin to Expo SDK 54 for public-store Expo Go compatibility

- **Status**: Accepted
- **Date**: 2026-07-13
- **Supersedes**: the "SDK 53+" version note in ADR-0001 (stack unchanged; only the SDK number is fixed here)

## Context

M1's entire point is that the CEO can walk the app on his **physical phone using
the plain Expo Go installed from the App Store / Play Store** — no store accounts,
no `eas` login, no native/dev-client build. The scaffold (APP-002) had drifted to
the newest published Expo release: **SDK 57 / React Native 0.86**.

The CEO installed the latest store Expo Go and got:
`"Project is incompatible with this version of Expo Go"` on `npx expo start`.

Root cause, confirmed against Expo's own changelog (verified 2026-07-13):

- The **public App Store / Play Store Expo Go is frozen at SDK 54.** Expo's
  "Expo Go and the App Store — May 2026" changelog states SDK 54 continues to be
  available on both stores; **SDK 55, 56 and 57 were never published to the public
  stores.** They are reachable only via `eas go` (a personal TestFlight build,
  requires a paid Apple Developer account), the External TestFlight beta (at
  capacity), the iOS **simulator**, or the Expo **CLI** on Android/emulator.
- The SDK 57 release note (2026-06-30) confirms its store Expo Go build is still
  "waiting on approval".
- On iOS, Apple platform rules mean only the single latest Expo Go build is
  installable on a physical device — so there is no way to side-install an
  SDK-57 Expo Go on the CEO's phone.

Therefore the **only** SDK that opens in plain store Expo Go on a physical phone
today is **SDK 54**. Every SDK above it violates the M1 constraint (no accounts,
no native build).

## Decision

**Pin the app to Expo SDK 54** (`expo ~54.0.35`, React Native `0.81.5`,
React `19.1.0`) and align every `expo-*` and community-native dependency to the
versions bundled in SDK 54's Expo Go runtime (`bundledNativeModules.json`):

| package | SDK 54 |
|---|---|
| expo | ~54.0.35 |
| react-native | 0.81.5 |
| react / react-dom | 19.1.0 |
| expo-router | ~6.0.24 |
| expo-sqlite | ~16.0.10 |
| expo-crypto | ~15.0.9 |
| expo-constants | ~18.0.13 |
| expo-font | ~14.0.12 |
| expo-linking | ~8.0.12 |
| expo-status-bar | ~3.0.9 |
| react-native-gesture-handler | ~2.28.0 |
| react-native-reanimated | ~4.1.1 |
| react-native-worklets | 0.5.1 |
| react-native-safe-area-context | ~5.6.0 |
| react-native-screens | ~4.16.0 |
| react-native-svg | 15.12.1 |
| typescript (dev) | ~5.9.2 |
| jest-expo (dev) | ^54.0.17 |

Because a package outside these versions makes the manifest unopenable in store
Expo Go, the pin is enforced in CI-equivalent terms by `npx expo install --check`
(must report "Dependencies are up to date") on every dependency change.

## Why this is a version alignment, not a downgrade of capability

- **Reanimated 4 survives.** SDK 54 bundles Reanimated **4.1.1** + worklets 0.5.1,
  so the Reanimated-driven capture pill (APP-011) needs no rewrite to Reanimated 3.
- **SQLite / secure-store survive.** expo-sqlite 16 and expo-secure-store 15 are in
  the SDK 54 runtime; the offline outbox (APP-005) is unaffected.
- New Architecture remains the default in SDK 54 (no config change; ADR-0001 holds).
- Only two mechanical adjustments were needed:
  1. Dropped the Jest `resolver: "react-native-worklets/jest/resolver.js"` — that
     resolver ships in worklets 0.10 (SDK 57), not 0.5.1. `jest-expo@54` mocks
     Reanimated 4.1 natively, so no resolver is required. 23/23 tests stay green.
  2. Dropped the unused `@react-native/jest-preset` dev dep (no 0.81.x is published
     under that name; it was never referenced — `jest-expo` provides the preset).

## Consequences

- **The M1 walk works on plain store Expo Go.** `npx expo start` advertises
  `sdkVersion 54.0.0`, which store Expo Go accepts.
- **Do not bump the SDK past 54 until Expo ships a newer public-store Expo Go.**
  Adding a dependency version outside SDK 54's bundle re-breaks the CEO's walk.
  Re-evaluate only when a) Expo publishes SDK 55+ to the public stores, or
  b) the project moves to a dev-client / TestFlight distribution (needs the CEO's
  Apple Developer + Play Console accounts — already the blocker for APP-007).
- **Fallbacks if we ever need a newer SDK before the stores catch up** (all cost
  the CEO something M1 was meant to avoid): dev client via `npx expo run:ios` /
  `run:android` (Xcode/Android SDK on his Mac), or `eas go` (paid Apple Developer
  account + EAS login). Rejected for M1 — they defeat the "no accounts, no native
  build" premise.

## Note on ADR-0001

ADR-0001 chose the stack and mentioned Skia + TanStack Query + Zustand as the
intended animation/state core. This ADR changes none of that; it only fixes the
SDK number. (Skia is not yet a dependency and is not required for M1; the pill and
charts run on Reanimated + react-native-svg. If/when Skia is added, it must be the
SDK-54-bundled version.)
</content>
</invoke>
