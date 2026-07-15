# ADR-0005 — Android dev build: CNG prebuild + Gradle, debug-signed sideload APK

Status: Accepted · 2026-07-15 · APP-007 (Android half)

## Context

We need a real, installable Android APK — no Expo Go, no store, no EAS cloud (no
paid pipeline; the CEO builds releases manually on his Mac). It must:
- run standalone (JS bundled, no Metro),
- work against both mock mode and the production backend,
- keep the managed Expo Go workflow alive for fast iteration,
- unlock the real `expo-notifications` path, the `react-native-health-connect`
  native module (APP-038), and `vita://` deep-link sign-in,
- yield a package name + signing SHA-1 for the CEO's Google OAuth client.

## Decision

**Continuous Native Generation (CNG).** `android/` is generated on demand by
`npx expo prebuild --platform android` and stays **gitignored** (it already was).
The repo remains a managed Expo project; all native config lives in
`app.config.ts` + config plugins, so the native project is reproducible and there
is nothing hand-edited to drift.

**Build:** `./gradlew :app:assembleRelease` produces a minified, JS-bundled
release APK.

**Signing: Expo's per-project `debug.keystore`** (`android/app/debug.keystore`,
alias `androiddebugkey`, storepass/keypass `android`). Expo re-copies this same
keystore on every prebuild, so the signing identity is **stable** across
regenerations. Rationale: it needs zero secret management and gives the CEO a
fixed SHA-1 to register now. It is Expo's *shared* debug keystore (every Expo
project has it) — fine for local testing + a Google OAuth **test** client, but a
private upload keystore must be generated for a real Play release (deferred to
F-LAST; that is when a dedicated keystore + its own SHA-1 get created and backed
up).

**Base URL at build time.** The API base URL comes from `VITA_API_BASE_URL`
(read into `app.config.ts` `extra.apiBaseUrl`, embedded by the release JS bundle
task). One APK = one baked URL:
- mock-mode APK (fully offline, seeded demo): build with the var unset.
- prod-backed APK: `VITA_API_BASE_URL=https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1 ./gradlew :app:assembleRelease`.

**minSdk 26.** Health Connect requires it; Expo SDK 56 defaults to 24 via the
`expo-root-project` Gradle plugin (a version catalog, not a build.gradle line).
The local plugin `plugins/withHealthConnect.js` appends `ext.minSdkVersion = 26`
to the root `build.gradle` after that plugin applies (subprojects read the ext
lazily, so the override wins) — CNG-safe, survives re-prebuild.

## Consequences

- One-command reproducible build; nothing native is committed.
- `npx expo start` (mock Expo Go) still works for iteration — unaffected by
  prebuild. NOTE: `expo prebuild` rewrites the `android`/`ios` npm scripts to
  `expo run:*`; we revert them to `expo start --*` in the committed `package.json`
  because we deliberately do NOT commit `android/` (CNG). Use `npm start` (Expo
  Go) or the documented Gradle command (dev build).
- Real notifications, Health Connect, and `vita://` deep links now work in the
  dev build; the Expo Go stubs (ADR-0003 pattern) still cover Expo Go.
- Package name `com.llmagal.vita`; debug-keystore SHA-1
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` — both handed to
  the CEO for the Google Android OAuth client id.
