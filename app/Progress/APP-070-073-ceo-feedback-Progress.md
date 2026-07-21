# APP-070..073 — CEO feedback round (session 16, 2026-07-21)

Four CEO tickets, all app-side. Gates: **tsc 0 · Jest 223/223 (44 suites) · expo export iOS OK**.
Fresh release APK rebuilt with prod URL baked. No backend change, no new deps. Tickets left
In progress (DoD = store).

Board: Vita frontend. GIDs: APP-070 `1216754076058121`, APP-071 `1216754186144715`,
APP-072 `1216754230786847`, APP-073 `1216754231571411`.

---

## APP-070 (P0) — Health Connect false "not available" on recent Samsung

### Root cause
The old check collapsed every non-`SDK_AVAILABLE` status to a hard `false`:
`getSdkStatus() === SDK_AVAILABLE (3)`. On Android 14+ / recent One UI, Health Connect is a
platform module reached via Settings — `getSdkStatus()` can return
`SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED (2)` (present-but-needs-setup) rather than `3`, so
Vita reported "not available" and never entered the permission flow. (The provider package
`com.google.android.apps.healthdata` IS correct on Android 14+ — the platform ships HC under
that same package — so the fix is honest status handling, not a package change. `getSdkStatus`
also cannot see whether Samsung Health syncs into HC, so "present but sync off" is a separate,
data-level signal, not an availability code.)

### Fix (`src/health/healthConnect.ts`)
- New `HealthAvailability = "available" | "update_required" | "not_installed"` + pure
  `mapSdkStatus(3→available, 2→update_required, else not_installed)` (unit-tested).
- `HealthReader.isAvailable(): Promise<boolean>` → `availability(): Promise<HealthAvailability>`;
  stub returns `not_installed`, real reader maps `getSdkStatus()`.
- `connectHealthConnect()` now returns a discriminated `ConnectResult`:
  `{ok:true, hasData}` | `{ok:false, reason:"denied"|"update_required"|"not_installed"|"error"}`.
- New `openHealthConnectStore()` — `market://` deep-link (https fallback) to install/update HC.

### Honest states surfaced (`app/(main)/integrations.tsx`)
- **available** → permission flow → data, or `healthConnectNoData` ("open Samsung Health, enable
  sync") when granted-but-empty (the sync-off case).
- **update_required** → `healthConnectUpdate` toast + open store page.
- **not_installed** → `healthConnectInstall` toast + open store page.
- **denied** → `healthConnectDenied` toast; switch reverts.
Every failure reverts the toggle so it never sits "on" with nothing behind it.

### Emulator vs device
Emulator has no HC provider → `mapSdkStatus` branches are **unit-tested** (available / update_required
/ not_installed / denied / connected-no-data). The real Android-14 detection + permission dialog +
Samsung Health data are **CEO-device-only**. Recipe: Settings → Health Connect exists → Vita →
Account → Integrations → toggle Health Connect → grant reads. If it bounces with "needs setup",
the store page opens (honest, not broken). If it connects but shows no data, enable syncing in
Samsung Health → Settings → Health Connect.

---

## APP-071 — metric only

Removed the metric/imperial choice everywhere; hardcoded metric; deleted the dead imperial code
+ i18n keys; persisted `units` is simply ignored (safe default = metric, the only path now).
- `src/lib/units.ts` `formatVolume(ml, t)` — dropped the `units` param + imperial `oz` branch.
- `formatLoad(kg, t)` (workout/[id].tsx, PreviewSheet.tsx) — dropped `units` param + `lb` branch.
- Removed `Settings.units` + `setUnits()` (`src/db/settings.ts`); `patchMe` no longer sends units.
- Onboarding step 0: removed the Metric/Imperial picker (name only). Account profile: removed the
  units editor + the units subtitle.
- Threaded `units` prop removed from `Timeline`/`WaterRow`/`EntryRow`; removed `getSettings().units`
  reads in Home, FoodTab, water/[id], workout/[id], PreviewSheet, ExportSheet, pdf (`ExportOpts.units`).
- i18n deleted: `common.oz`, `workoutDetail.lb`, `onboarding.welcome.{unitsLabel,metric,imperial}`,
  `onboarding.allSet.recapUnits`.
- Tests updated (metric-only formatVolume, dropped imperial assertions/setUnits test).

## APP-072 — Integrations cleanup

Only surfaces what actually works.
- **Integrations screen** now shows Health Connect **only, and only on Android** (`Platform.OS`
  gate). Apple Health / Strava / Garmin / Flo / gym were UI-only stubs → removed. Non-Android →
  `integrations.noneYet` note (Apple Health returns when a HealthKit reader is actually built).
- **Onboarding**: removed the fake "Bring what you already use" connect step entirely (it set
  cosmetic `connected` booleans nothing reads; real connect = the Integrations permission flow).
  `TOTAL_STEPS` 6→5; removed `CONNECT_ITEMS`, `connected` state, `Settings.connected`, the recap
  "Connected" row, and all `onboarding.connect.*` + `integrations.source.{appleHealth,strava,…}` +
  `notConnected`/`connectPrompt` i18n keys.
- Orphaned `assets/android-icon-background.png` is no longer referenced (kept on disk; NO git).

## APP-073 — app icon

Replaced the off-brand blue Expo placeholder with a calm, on-brand mark: a **terracotta water
droplet with a soft-green leaf** on cream (tokens: bg cream, accent terracotta `#C4704E`, soft
green `#8CA58A`). "a quiet log of meals, water & movement" — droplet = water/meals, leaf =
calm/movement.
- SVG sources in `assets/icon-src/{icon,foreground,monochrome}.svg`; rasterized with `rsvg-convert`.
- `assets/icon.png` (1024, opaque) — iOS + fallback.
- `assets/android-icon-foreground.png` (1024, transparent, mark scaled 0.82 into the adaptive safe
  zone) + `assets/android-icon-monochrome.png` (ink silhouette, Android 13+ themed icons).
- `assets/favicon.png` regenerated (web) from the same mark.
- `app.config.ts`: adaptiveIcon `backgroundColor:#F2E9D8` (flat cream, matches the icon) +
  foregroundImage + monochromeImage; dropped `backgroundImage` (one source of truth).
- Verified in the generated project: `mipmap-anydpi-v26/ic_launcher.xml` has background/foreground/
  **monochrome** layers; `colors.xml iconBackground #F2E9D8`; `ic_launcher_{foreground,monochrome}.webp`
  generated. Icon-in-APK confirmed via the built release APK.

---

## Files changed
- `src/health/healthConnect.ts` (+ test) — APP-070
- `app/(main)/integrations.tsx` — APP-070/072
- `src/lib/units.ts`, `src/db/settings.ts`, `src/api/client.ts` — APP-071
- `src/tabs/Home.tsx`, `src/tabs/home/Timeline.tsx`, `src/trends/FoodTab.tsx`,
  `src/export/{pdf.ts,ExportSheet.tsx}`, `src/workout/PreviewSheet.tsx`,
  `app/(main)/{account.tsx,water/[id].tsx,workout/[id].tsx}`, `app/onboarding.tsx` — APP-071/072
- `src/i18n/locales/en.json` — key removals + HC guidance keys
- `app.config.ts`, `assets/icon.png`, `assets/android-icon-foreground.png`,
  `assets/android-icon-monochrome.png`, `assets/favicon.png`, `assets/icon-src/*.svg` — APP-073
- Tests: `water-detail`, `account`, `onboarding`, `settings`, `pdf`, `healthConnect`

## Dependencies on other teams
None.

## Questions for the CEO
- APP-072: on iOS the Integrations screen is empty until a real HealthKit reader is built — OK, or
  do you want an Apple Health placeholder there? (Kept it out per "nothing that doesn't work may
  be visible"; v1 is Android anyway.)
