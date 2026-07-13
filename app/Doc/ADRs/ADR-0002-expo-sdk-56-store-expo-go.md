# ADR-0002 — Pin to Expo SDK 56 for public-store Expo Go compatibility

- **Status**: Accepted
- **Date**: 2026-07-13
- **Supersedes**: the "SDK 53+" version note in ADR-0001 (stack unchanged; only the SDK number is fixed here)

## Context

M1's entire point is that the CEO can walk the app on his **physical phone using
the plain Expo Go installed from the App Store / Play Store** — no store accounts,
no `eas` login, no native/dev-client build. The scaffold (APP-002) had drifted to
the newest published Expo release: **SDK 57 / React Native 0.86**, and the CEO's
store Expo Go rejected it: `"Project is incompatible with this version of Expo Go"`.

**The public-store Expo Go tracks the latest _stable_ SDK that Expo has shipped to
the stores — currently SDK 56.** SDK 57 exists on npm but its store Expo Go build
is still awaiting Apple approval (per Expo's SDK 57 changelog, 2026-06-30), so it
only runs via `eas go` (paid Apple Developer account), TestFlight, the iOS
simulator, or the Expo CLI on Android/emulator — none of which fit the M1
"no accounts, no native build" constraint. On iOS, Apple platform rules mean only
the single latest Expo Go build is installable on a physical device.

The CEO's device confirms the current store version directly: after a first pass
pinned the project to SDK 54, his Expo Go reported
`"Either upgrade this project to SDK 56 or install an older version of Expo Go"` —
i.e. his store Expo Go is on **SDK 56**, and SDK 54 is now too old for it.

Therefore the SDK that opens in the CEO's plain store Expo Go today is **56** —
the latest stable Expo has published to the stores, one below the not-yet-approved 57.

## Decision

**Pin the app to Expo SDK 56** (`expo ~56.0.15`, React Native `0.85.3`,
React `19.2.3`) and align every `expo-*` and community-native dependency to the
versions bundled in SDK 56's Expo Go runtime (`bundledNativeModules.json`):

| package | SDK 56 |
|---|---|
| expo | ~56.0.15 |
| react-native | 0.85.3 |
| react | 19.2.3 |
| expo-router | ~56.2.14 |
| expo-sqlite | ~56.0.5 |
| expo-crypto | ~56.0.4 |
| expo-constants | ~56.0.20 |
| expo-font | ~56.0.7 |
| expo-linking | ~56.0.15 |
| expo-status-bar | ~56.0.4 |
| react-native-gesture-handler | ~2.31.1 |
| react-native-reanimated | 4.3.1 |
| react-native-worklets | 0.8.3 |
| react-native-safe-area-context | ~5.7.0 |
| react-native-screens | 4.25.2 |
| react-native-svg | 15.15.4 |
| typescript (dev) | ~6.0.3 |
| jest-expo (dev) | ^56.0.5 |
| @react-native/jest-preset (dev) | ^0.85.3 |

Because a package outside these versions makes the manifest unopenable in store
Expo Go, the pin is enforced by `npx expo install --check` (must report
"Dependencies are up to date") on every dependency change.

## Why this is a version alignment, not a downgrade of capability

- **Reanimated 4 survives.** SDK 56 bundles Reanimated **4.3.1** + worklets 0.8.3,
  so the Reanimated-driven capture pill (APP-011) needs no rewrite.
- **SQLite / secure-store survive.** expo-sqlite 56 is in the SDK 56 runtime; the
  offline outbox (APP-005) is unaffected.
- New Architecture remains the default in SDK 56 (no config change; ADR-0001 holds).
- Only two mechanical Jest adjustments were needed vs the SDK 57 scaffold:
  1. Kept the Jest `resolver: "react-native-worklets/jest/resolver.js"` — worklets
     0.8.3 ships this resolver (as did 0.10 in SDK 57), so Reanimated resolves in tests.
  2. Added `@react-native/jest-preset ^0.85.3` as a dev dep — in SDK 56, `jest-expo`
     requires the RN Jest preset as a peer dependency (it moved out of RN core).
     23/23 tests stay green.

## Consequences

- **The M1 walk works on plain store Expo Go.** `npx expo start` advertises
  `sdkVersion 56.0.0`, which the CEO's store Expo Go accepts.
- **Do not bump the SDK past 56 until Expo ships a newer public-store Expo Go**
  (i.e. SDK 57 clears Apple review and lands in the stores). Adding a dependency
  version outside SDK 56's bundle re-breaks the CEO's walk. `expo install --check`
  is the guard.
- **Fallbacks if we ever need a newer SDK before the stores catch up** (all cost
  the CEO something M1 was meant to avoid): dev client via `npx expo run:ios` /
  `run:android` (Xcode/Android SDK on his Mac), or `eas go` (paid Apple Developer
  account + EAS login). Rejected for M1 — they defeat the "no accounts, no native
  build" premise.

## Security posture at this pin (npm audit, 2026-07-13)

`npm audit` reports **10 moderate, 0 high, 0 critical**. All 10 are the same root
advisory (`uuid` GHSA-w5hq-g745-h8pq — bounds check when a `buf` arg is passed to
v3/v5/v6) reached transitively through the **Expo CLI build toolchain**
(`@expo/cli`, `@expo/config`, `@expo/metro-config`, `xcode`, …). They are:

- **Dev/build-time only** — none ship in the app's Hermes runtime bundle.
- **Not reachable in Expo's usage** — Expo generates v4 ids with no `buf` argument.
- **Upstream-bundled** — the only `npm audit fix` path is downgrading `expo` to
  46 (semver-major, destroys SDK 56). They move when Expo bumps its own `uuid`.

Accepted as upstream-deferred; no override applied (forcing `uuid` risks breaking
`@expo/cli` — the very `expo start`/`export` commands the CEO runs). The install-time
deprecation warnings (inflight, rimraf@3, glob@7, abab, whatwg-encoding,
domexception, uuid@7) are transitive dev deps of the jest/jsdom + Expo CLI
toolchains — deprecations, not vulnerabilities, same accepted-upstream bucket.

## Note on ADR-0001

ADR-0001 chose the stack and mentioned Skia + TanStack Query + Zustand as the
intended core. This ADR changes none of that; it only fixes the SDK number. Skia is
not yet a dependency and is not required for M1 (the pill and charts run on
Reanimated + react-native-svg). If/when Skia is added, it must be the
SDK-56-bundled version.
</content>
