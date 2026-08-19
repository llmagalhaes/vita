# APP-107 — Health Connect permission request: fix + diagnostic + READ_WEIGHT

Session 22 (2026-08-19). Builder: Opus. Files touched (all under `app/services/vita-app/`):

| File | Change |
|---|---|
| `plugins/withHealthConnect.js` | Android-14+ `<activity-alias>` (the fix) + `READ_WEIGHT` permission |
| `src/health/healthConnect.ts` | `DIAG` toast surface, `readWeight()`, `Weight` read scope, `getLastSdkStatus()` |
| `src/health/__tests__/healthConnect.test.ts` | `readWeight` on every fake reader + a diagnostic-payload test (12 tests) |
| `src/library/sections/Sources.tsx` | diag suffix on failure toasts; honest subtitle (3 states, not 2) |
| `src/i18n/locales/en.json` | new `library.sources.hcOnNoData` |

## 1. The fix — Android-14+ `<activity-alias>`

Session-21's hypothesis (missing permission delegate) is confirmed **disproven**: the generated
`MainActivity.kt:22` carries `HealthConnectPermissionDelegate.setPermissionDelegate(this)` (verified
below).

The real gap in the generated manifest: the app declared **only** the legacy
`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter that
`react-native-health-connect`'s own `app.plugin.js` pushes. From Android 14 the provider is a platform
module and the framework looks instead for an `<activity-alias>` answering
`android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS`.
Without it the system has nothing to launch — which is exactly the observed symptom on the CEO's
Android 15 SM_S942B: no dialog, no Play Store, zero logcat lines, toggle reverts.

Both filters ship: the alias serves Android 14+, the legacy filter still serves 13 and below.

```xml
<activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"
                android:targetActivity=".MainActivity"
                android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
  <intent-filter>
    <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
    <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
  </intent-filter>
</activity-alias>
```

### Step 2 if the alias alone does not fix it on device (NOT applied)

`MainActivity` is generated with `android:launchMode="singleTask"` (manifest line 40). `singleTask` can
route the permission activity's result through `onNewIntent` instead of the registered
`ActivityResultLauncher`, silently dropping the callback. If the dialog still does not appear after the
alias, add a fourth mod to `plugins/withHealthConnect.js` rewriting that attribute to `singleTop`, and
re-verify the deep link (`vita://`) and the notification tap paths, which are the two flows `singleTask`
was protecting. **Deliberately not applied now** — one variable at a time, and `singleTop` changes
task/back-stack behaviour app-wide.

## 2. Diagnostic surface (temporary — APP-109 removes it)

Release builds strip `console`, so the toast is the only window on the CEO's phone.
`src/health/healthConnect.ts` has a single `const DIAG = true`. While on, every **failure** path of
`connectHealthConnect()` carries `diag: "sdk=<raw getSdkStatus()> <caught message>"`, and
`Sources.tsx` appends it to the toast as ` [sdk=2 …]`. Success paths carry nothing.

Reading the raw value on device tells us which branch we are in:
`3` = SDK_AVAILABLE, `2` = provider update/setup required, `1`/`0` = absent.

**APP-109: flip `DIAG` to `false`** and drop the `say()` suffix in `Sources.tsx`. The `diag` field on
`ConnectResult` is optional, so nothing else changes.

## 3. `READ_WEIGHT` + `readWeight()`

- Permission added to `READ_PERMISSIONS` in the plugin and to the `READ` scope array requested at
  connect time.
- `HealthReader.readWeight(): Promise<number | null>` — newest-first `readRecords("Weight", …)` with
  `ascendingOrder: false, pageSize: 1` over a 90-day window (Health Connect has no "latest" call and
  `readRecords` requires a time filter; a scale reading older than 90 days is not current weight).
  Returns `weight.inKilograms` or `null`. The stub returns `null` — never a fabricated weight.
- **Device-local per ADR-0016**: like every other HC read, this never touches the outbox.
- **Deliberately not wired to storage yet** (ponytail/YAGNI): no screen reads a health-sourced weight
  today, so `HealthSnapshot` gains no `weightKg` field. Add one when the weight domain surfaces it —
  the permission and the reader are already there.

## 4. Honest copy in `Sources.tsx`

The subtitle was two states (`hcOn` / `hcOff`), and `hcOn` claims *"Connected · weight & workouts flow
in"* whenever the **pref** is on — a claim the pref cannot back after the connect moment (permission
revoked in Health Connect settings, Samsung Health sync switched off). Now three states, using the
already-cached snapshot, no extra native call:

| Condition | Copy |
|---|---|
| pref on **and** today's snapshot exists | `Connected · weight & workouts flow in` |
| pref on, no snapshot today | `Connected · nothing has come through yet` (new `hcOnNoData`) |
| pref off | `Off — nothing is read` |

## 5. Verification

### Generated-manifest evidence (clean `npx expo prebuild --platform android --no-install --clean`)

`android/app/src/main/AndroidManifest.xml`:

```
 9:  <uses-permission android:name="android.permission.health.READ_ACTIVE_CALORIES_BURNED"/>
10:  <uses-permission android:name="android.permission.health.READ_EXERCISE"/>
11:  <uses-permission android:name="android.permission.health.READ_STEPS"/>
12:  <uses-permission android:name="android.permission.health.READ_WEIGHT"/>          <-- new
...
51:      <intent-filter>
52:        <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/>  <-- legacy, still there, exactly once
53:      </intent-filter>
54:    </activity>
55:    <activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"
                      android:targetActivity=".MainActivity"
                      android:permission="android.permission.START_VIEW_PERMISSION_USAGE">   <-- new
56:      <intent-filter>
57:        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
58:        <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
59:      </intent-filter>
60:    </activity-alias>
```

`android/app/src/main/java/com/llmagal/vita/MainActivity.kt`:

```
13: import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate
22:     HealthConnectPermissionDelegate.setPermissionDelegate(this)
```

`android/app/build.gradle:93` → `minSdkVersion 26`. All three plugin mods intact.

**Prebuild gotcha worth knowing:** running `npx expo prebuild` **without** `--clean` over an existing
`android/` re-applies `react-native-health-connect`'s `app.plugin.js`, which pushes the rationale
intent-filter **non-idempotently** — a second prebuild produced a duplicate `<intent-filter>`. Our own
mods are all idempotent. Always prebuild with `--clean` before cutting an APK. Second gotcha: prebuild
rewrites `package.json`'s `android`/`ios` scripts to `expo run:*`; that was reverted (`git checkout`),
the committed scripts stand.

### Gates (scoped, as briefed)

- `npx jest src/health` → **12/12 pass** (was 11; +1 diagnostic-payload test, +`readWeight` assertion on
  the stub).
- `npx jest src/library` → 7/7 pass (Sources has no direct test; nothing regressed).
- `npx tsc --noEmit` → **0 errors in APP-107 files**. Two errors remain in the tree, both in another
  builder's in-flight work: `src/notify/notifier.ts` cannot resolve `./dayClose` (APP-106, file not
  written yet). Not mine, not touched. (An earlier run also showed `src/db/restore.ts` errors; that
  builder fixed them mid-session.)

### Device-only verification — CEO steps (SM_S942B, Android 15)

Jest and the emulator **cannot** verify any of this; the emulator has no Health Connect provider.

1. Install the fresh APK **clean**: `adb uninstall com.llmagal.vita` first (a stale install keeps the old
   manifest — this is the whole point of the ticket).
2. Open **Library → Connected sources → Health Connect** and flip the toggle **on**.
3. **Expected (fixed):** the Health Connect permission dialog appears, listing four scopes — active
   energy, steps, exercise, **weight**. Allow all four.
4. Toggle stays on; subtitle reads *"Connected · weight & workouts flow in"* if data came through, or
   *"Connected · nothing has come through yet"* if Samsung Health has not synced yet (that second one is
   honest, not a bug — open Samsung Health and enable sync to Health Connect, then re-toggle).
5. **If it still fails:** the toast now ends with `[sdk=N …]`. **Report N and any message verbatim** —
   that number is the whole diagnostic:
   - `sdk=3` + no dialog → the alias did not help; apply the `singleTop` fallback (§1).
   - `sdk=2` → the provider needs setup; the store page opens — finish setup there and retry.
   - `sdk=1` / `sdk=0` → provider genuinely absent (unexpected on Android 15).
   - `sdk=? <message>` → an exception before the status read; the message is the lead.
6. Cross-check in **Settings → Security and privacy → More privacy settings → Health Connect → App
   permissions → Vita**: Vita should be listed with the four granted read scopes. Tapping Vita's privacy
   policy entry there also exercises the new alias.
7. Toggle **off** → subtitle returns to *"Off — nothing is read"*, cached snapshot cleared.

## Deviations / notes

- `DIAG` ships **on** by design (this is the diagnostic build). It leaks nothing personal — an SDK
  integer and an exception message.
- The plugin now owns four mods; kept in one file, one `withAndroidManifest` pass for the permissions,
  queries and alias.
- `src/i18n/locales/en.json` is shared with APP-108 (i18n restructure): only one key added,
  `library.sources.hcOnNoData`, inside the existing `library.sources` block.
