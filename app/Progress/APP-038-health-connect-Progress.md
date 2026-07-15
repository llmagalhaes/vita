# APP-038 — Health Connect read integration

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216604793549171
Model: Opus 4.8 · Session 9 (2026-07-15)

## What / why
Read-only Health Connect integration behind the stub seam (voice/OIDC/notifier
pattern). ONE Android integration covers Samsung Health + Google fitness data —
Google Fit's own APIs are deprecated (ADR-0004). Scope (ponytail, read-only):
daily active energy, steps, exercise-session count → feed the Energy card
"spent" and a small readout. Everything labeled an estimate.

## Design (device-local, NO backend — confirmed by backend ADR-0016)
Health data stays in SQLite/kv only. The committed contract sets `EntrySource`
server-side (`user`); health ingestion is a separate, not-yet-live contract. So
HC data is **never** enqueued to the outbox / `POST /entries`. It is a local
display source, in line with client-side trends (D4).

## Files
- **`src/health/healthConnect.ts`** (new) — the seam:
  - `HealthReader` interface + `stubHealthReader()` (honest absence: Expo Go, iOS,
    jest) + `createHealthConnectReader()` (lazy-requires `react-native-health-connect`;
    `getSdkStatus`/`initialize`/`requestPermission`/`readRecords` for
    ActiveCaloriesBurned, Steps, ExerciseSession over today's range).
  - `getHealthReader()`/`setHealthReader()`; real reader only on an Android dev
    build (`Platform.OS==='android'` && not `StoreClient`).
  - Pure `mapHealthToday()` (record arrays → snapshot; missing fields → 0),
    `dayBounds()`.
  - kv snapshot store (`health.snapshot`, NEVER outbox): `getHealthSnapshot`,
    `clearHealthSnapshot`, `healthActiveKcalToday` (today-only; stale → 0),
    `todaysHealthSnapshot`.
  - `refreshHealthConnect()` (best-effort read+cache when connected; silent no-op
    otherwise), `connectHealthConnect()` (permission → read; returns granted).
- **`src/tabs/Home.tsx`** — `spentKcal` now adds `healthActiveKcalToday()`; mount
  effect calls `refreshHealthConnect()`; expanded Energy section shows a "N steps ·
  M workouts · from Health Connect · estimate" readout when a today snapshot exists.
- **`app/(main)/integrations.tsx`** — the `healthConnect` toggle is the ONE real
  switch: on → `connectHealthConnect()` (permission + read); off →
  `clearHealthSnapshot()`. Other sources stay honest UI-only. Honest subtitles.
- **i18n** `integrations.healthConnectOn/Off`, `home.healthConnectReadout`.
- **Native config** (for the dev build, APP-007): `react-native-health-connect`
  plugin (rationale intent-filter) + local `plugins/withHealthConnect.js` (read
  permissions + `<queries>` for `com.google.android.apps.healthdata` + minSdk 26).
- **Tests** `src/health/__tests__/healthConnect.test.ts` (8): mapping/tolerance,
  dayBounds, today-vs-stale snapshot, stub absence, disconnected no-op,
  connect→cache→disconnect→clear, unavailable→no data.

## New dep
- `react-native-health-connect@^3.5.3` (native module + config plugin; cannot run
  in Expo Go — stubbed there). No other deps.

## Native permission-delegate crash — found + fixed on the emulator
Tapping the HC toggle (real dev build) first crashed the process:
`kotlin.UninitializedPropertyAccessException: lateinit property requestPermission
has not been initialized` (in `HealthConnectPermissionDelegate.launchPermissionsDialog`,
on a coroutine worker thread — so the JS try/catch can't catch it). Root cause:
`react-native-health-connect` requires `HealthConnectPermissionDelegate.setPermissionDelegate(this)`
in `MainActivity.onCreate` (it registers an `ActivityResultLauncher`, which must run
before the activity resumes); the library's own Expo plugin does NOT wire this.
**Fix:** `plugins/withHealthConnect.js` gained a `withMainActivity` mod that injects
the import + the delegate call after `super.onCreate(null)` (CNG-safe, idempotent).
After the fix: no crash; the permission request launches; a denial/no-grant yields
`SecurityException` on read that the try/catch swallows (silent no-op, app stable).

## Emulator / device status
- Real permission + read path **verified crash-free** on the API 37 PlayStore emulator
  (Health Connect is built into Android 14+). Data reads **empty** there (no provider
  feeding HC, and the permission grant can't be completed via automation) — non-zero
  data (active energy/steps/sessions) needs the CEO's **Samsung phone** with Samsung
  Health → Health Connect sync enabled.

## Gates
tsc 0 · Jest 179/179 (36 suites, +8 incl. this suite's 8) · expo export OK.
