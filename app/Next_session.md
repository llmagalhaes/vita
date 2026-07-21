# App Team — Next Session

## Session 16 (2026-07-21) — CEO feedback round APP-070..073 SHIPPED ✅
Four CEO tickets, all app-side. Ledger: `Progress/APP-070-073-ceo-feedback-Progress.md`.
Gates: **tsc 0 · Jest 223/223 (44 suites) · expo export iOS OK**. No backend change, no new deps.
Fresh prod-baked release APK rebuilt (`android/app/build/outputs/apk/release/app-release.apk`).
Tickets left **In progress** (DoD = store).
- **APP-070 (P0) HC false "not available"** — root cause: the check treated only
  `getSdkStatus()===SDK_AVAILABLE(3)` as usable and collapsed everything else to false. On
  Android 14+/recent One UI, HC is a platform module and returns
  `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED(2)` (present-but-needs-setup). Fix
  (`src/health/healthConnect.ts`): `HealthAvailability` 3-state + pure `mapSdkStatus` (unit-tested);
  `isAvailable()→availability()`; `connectHealthConnect()` returns a discriminated `ConnectResult`;
  new `openHealthConnectStore()` deep-link. `integrations.tsx` maps each state to an honest toast
  (denied / install / update / no-data-sync-off) and reverts the toggle on failure. Provider
  package `com.google.android.apps.healthdata` is correct on 14+ (unchanged). **Detection +
  permission + Samsung data are CEO-device-only** (emulator has no HC provider; branches unit-tested).
- **APP-071 metric only** — dropped the imperial branch + `units` param from `formatVolume`/
  `formatLoad`; removed `Settings.units`/`setUnits`, the onboarding + account unit pickers, all
  `getSettings().units` reads, and the dead i18n (oz/lb/metric/imperial/unitsLabel/recapUnits).
  Metric is the only path; any persisted `units` is ignored.
- **APP-072 integrations cleanup** — Integrations shows Health Connect ONLY and only on Android
  (`Platform.OS`); removed the appleHealth/strava/garmin/flo/gym stubs; non-Android → "none yet".
  Onboarding's fake "connect apps" step removed entirely (TOTAL_STEPS 6→5; `Settings.connected`
  gone). **CEO Q:** iOS Integrations is empty until a real HealthKit reader exists — OK?
- **APP-073 app icon** — replaced the blue Expo placeholder with a calm terracotta droplet + soft-
  green leaf on cream (token palette). SVG sources `assets/icon-src/*.svg` → rsvg-convert →
  `icon.png` (opaque), `android-icon-foreground.png`, `android-icon-monochrome.png`, `favicon.png`.
  `app.config.ts` adaptiveIcon `backgroundColor:#F2E9D8` + foreground + monochrome (dropped the flat
  backgroundImage). Prebuild regen confirmed adaptive xml has all 3 layers; icon lands in the APK.
- **CEO on device:** install the rebuilt APK clean (`adb uninstall com.llmagal.vita` first) — check
  (1) the new droplet icon in the launcher, (2) Health Connect now offers connect/guidance on your
  Samsung (not a flat "not available"), (3) no unit choice anywhere, (4) Integrations shows only HC.

## Session 15 (2026-07-20) — REAL on-device voice STT SHIPPED (APP-069, CEO option A) ✅
CEO chose option A: build real sound→text on device (interpretation stays Claude via
`/parse/text`; audio never leaves the device). Ledger: `Progress/APP-069-voice-stt-Progress.md`.
Ticket APP-069 (`1216730553659158`) left **In progress** (DoD = store).
- **Lib: `expo-speech-recognition@56.0.1`** (pinned exact; npm dist-tags confirm 56.0.x = the
  SDK-56 line — `sdk-54/55` are 3.1.3). Maintained Expo config-plugin module over Android
  `SpeechRecognizer` / iOS `SFSpeechRecognizer`: partial results, device locale, on-device,
  CNG-safe permission/`<queries>` wiring — drops straight onto the existing `SpeechRecognizer`
  seam. No cloud STT, no audio upload (ponytail rung 5).
- **`src/capture/speech.ts`**: new `nativeRecognizer(mod?)` bridges native `result`/`error`/`end`
  events → the interface (`onPartial`/`onFinal` once/`onError`; user `aborted` suppressed; `end`
  safety-net empty final). New zero-dep `deviceLocale()` = Hermes `Intl…resolvedOptions().locale`
  (→ pt-BR from device, no expo-localization). `defaultRecognizer`: Expo Go/jest → `stubRecognizer`;
  real build → `nativeRecognizer` (falls back to `unavailableRecognizer` if the module can't load).
  **The fabricating canned-phrase stub never runs on device again** (APP-058 root cause closed).
- **`app.config.ts`**: added the `expo-speech-recognition` plugin (mic + speech usage strings,
  `androidSpeechServicePackages`) → injects RECORD_AUDIO + iOS strings + `RecognitionService`
  `<queries>`. Merged manifest verified.
- **`src/capture/__tests__/speech.test.ts`** (+5): native event mapping via a fake module
  (partial/final ordering+dedupe, error→onError honest, abort suppresses late events, end→reset,
  denied never fabricates).
- Gates: **tsc 0 · Jest 221/221 (44 suites, +5) · expo export iOS OK**. `expo install --check`:
  no warning for the new dep (listed drifts pre-existing, out of scope). Prebuild regen OK
  (reverted its package.json script rewrite, per the CNG note). **Fresh release APK rebuilt** with
  prod URL baked (`android/app/build/outputs/apk/release/app-release.apk`).
- **Emulator STT is unreliable** (no recognition service → honest "type instead"), so on-device
  transcription/pt-BR/permission dialog are **CEO-device-only**. Full recipe in the ledger:
  hold mic → say **"comi um pão de queijo e café com leite"** → parsed meal draft.
- **CEO:** run the device recipe on your phone; no blocking questions. Optional: pin a fixed STT
  language instead of device locale (one-line `deviceLocale()` change) — say if you want it.

## Session 14 (2026-07-20) — VISUAL batch APP-062..068 SHIPPED + emulator-verified ✅
CEO device-tested the 2026-07-20 prod APK and filed visual/fidelity bugs. This session owned the
VISUAL batch; a sibling agent owned the FUNCTIONAL batch (APP-058..061) in a separate worktree —
capture/sync/outbox/health/api-client untouched here. Ledger: `Progress/APP-062-068-visual-batch-Progress.md`.
- **APP-066 (P0)** Home water card explosion ROOT-CAUSED + fixed (`src/tabs/Home.tsx`): the expanded
  row split a `flex:1` amount from an *unconstrained* `method·time` Text (RN `flexShrink` default 0)
  → starved the amount → per-char wrap. Fix = one ellipsized meta `Text` (`flex:1,minWidth:0,
  numberOfLines`) + short `flexShrink:0` time (the prototype's own pattern); header amount →
  `adjustsFontSizeToFit`. **Decision:** the prototype DOES have the in-card history (proto L456–466)
  — kept it, fixed layout. Emulator: 4×250 ml → 4 clean rows, no explosion.
- **APP-063** Macros pop card already matched the prototype; residual gap was Android blur. Fix
  (`src/ui/SheetBackdrop.tsx`): `blurReductionFactor={1}` on Android (default 4 divides the blur →
  the "not blurred" cause), intensity 26→40, scrim → prototype-exact `rgba(247,242,233,.45)`. Kept
  `blurMethod="dimezisBlurView"` (already correct in expo-blur 56.0.3). ⚠ **CEO: confirm "strongly
  blurred" on the next prod APK** — emulator blur ≠ device.
- **APP-064** stack transition `slide_from_right → fade_from_bottom` (`app/(main)/_layout.tsx`) —
  findings: prototype detail screens use `vtIn` (fade+rise), lateral slide was only its fake tab nav.
  Tab pager + sheet system untouched.
- **APP-065** shadow sweep: Account export CTA + Export "Prepare PDF" → `shadowCta`; Home CountBanner
  → warm `#A0643C@.12`; inline CheckinQuestion → prototype `#69543C@.10`.
- **APP-062** dock tooltip `bottom 26→52` + `overflow:"visible"` on row/slot (`DockDatePicker.tsx`);
  `dock.ts` worklet directives untouched. Needs a live-drag device check (mid-drag transient).
- **APP-067** nav pill (= CapturePill) soft lift: `shadowRadius 22→30`, elevation 8→9, bg .94→.90;
  active/icon/label colours already matched the prototype.
- **APP-068** reverted session-8's 4-icon Home header to a single Account (person) icon (Trends/Habits
  = pill; Integrations via Account → Your setup; nothing orphaned).
- Gates: **tsc 0 · Jest 212/212 (43 suites) · expo export iOS OK**. No new deps, no backend change.
  All 7 tickets commented, left In progress (DoD=store).
- **CEO Qs:** (1) confirm the macros backdrop reads "strongly blurred" on a real device; (2) the dock
  tooltip position/feel on a live drag.

## Session 14 (2026-07-20) — CEO device-test functional batch APP-058..061 ✅ (root-caused vs real prod)
CEO device-tested the fresh prod APK (real prod backend) → 4 functional bugs. All root-caused
against the **live prod backend** (magic-link→verify→parse→POST /entries→refresh all exercised).
Ledger: `Progress/APP-058-061-functional-batch-Progress.md`. Gates: **tsc 0 · Jest 216/216
(43 suites, +5) · expo export iOS OK**. No backend change. Files: see ledger.
- **APP-061 (P0) "~0 kcal" — PROVEN + FIXED.** Real `/parse/text` returns meal drafts with
  `items` (real kcal) but **NO `totals`** (contract: server recomputes totals on write). Every
  Home surface reads `detail.totals.kcal ?? 0` → ~0. Mock computes totals inline → only ever OK
  in mock mode. Fix: **`fillDraftTotals()` at the API boundary (`src/api/client.ts`)** — sums
  items→totals for meal drafts lacking them, in `parseText`/`parsePhoto`. One chokepoint fixes the
  confirm card + all Home surfaces + offline-interpret. +3 regression tests reproduce the prod reply.
- **APP-061 "waiting to sync" — NOT an API failure.** POST /entries=201, /auth/refresh=200 vs prod.
  Fixed a latent **boot-ordering bug** (`app/_layout.tsx`: drain fired before `loadSession()`
  resolved → unauth 401 → backoff) and **instrumented the silent backoff** (`src/db/outbox.ts`
  `console.warn` op/status/attempts, visible in `adb logcat`) so the next device run names any
  residual cause. Retry semantics unchanged (offline durability kept).
- **APP-058 voice — real STT was never built.** `active` hardcoded to `stubRecognizer()`,
  `setRecognizer` never called, **no STT dep**. Standalone streamed a CANNED phrase and logged a
  fabricated meal. Fix (no native dep): `getRecognizer()` → streaming stub only in Expo Go/jest;
  any real build → new **`unavailableRecognizer()`** → the existing "voice isn't available — Type
  instead" state. **CEO Q: build real STT now (native dep + rebuild) or ship the honest fallback?**
- **APP-060 PDF import — INFRA defect, not app.** S3 presigned PUT → **403**: `vita-ecs-task` role
  lacks `kms:GenerateDataKey` on uploads CMK `075c7c59-ebae-4806-a1a8-01e7671e29a8` → object never
  lands → parse 422. **→ DevOps ticket** (grant KMS encrypt to the task role). App now surfaces the
  real S3 error (`putPresignedFile` body + `planImport` warn) instead of a blank "upload error".
- **APP-059 Health Connect — wiring correct (device-only), UX made honest.** Toggle was
  fire-and-forget; now awaits `connectHealthConnect()`, reverts on failure + toasts guidance
  ("install HC, enable Samsung Health→HC sync") / a no-data hint. On-device recipe in the ledger.
- **⚠ Worktree note for orchestrator:** this agent's worktree was created on a stale base commit
  (`ffe880b`, missing all app source); I `git reset --hard` it to main (`6b48de3`) to get the code,
  then symlinked `node_modules` from the shared checkout to run gates. My 9 changed files are the
  session-14 diff; no other app work is mine.

## Session 13 (2026-07-15) — Home v2 (dock date picker + inline timeline) SHIPPED + emulator-verified ✅
CEO greenlit the build ("manda ver"). Home v2 **replaces** v1 (no toggle). Full detail:
`Progress/HOME-V2-Progress.md`. Epic **HOME-V2** `1216600225044885` (subtasks 1..9 → In progress).
- **New**: `src/tabs/home/{dock.ts,DockDatePicker,DaySection,Timeline,timelineData}.tsx` + `src/lib/haptics.ts`.
  **Modified**: `src/tabs/Home.tsx` (day-aware), `src/ui/tokens.ts`, `en.json`. New dep **`expo-haptics ~56.0.3`**.
- **Dock magnifier**: per-dot Gaussian `useAnimatedStyle`, touch-down gesture (`manualActivation` +
  `blocksExternalGesture(tabsPagerRef)`), commit-on-release only, per-crossing haptic tick, `vtTip` tooltip.
  Release spring = ONE `drag` value 1→0 with the overshoot bezier `(.34,1.56,.64,1)/550` blending drag↔idle
  (no per-frame withSpring). `transformOrigin:"center bottom"`.
- **Timeline v2**: spine/gutter rows, water passive marker, meal/workout expand-in-place (multi-open,
  keyed `e_{offset}_{id}`, "Full details →" today-only), day-swipe (elastic ends, slide-in on commit).
  Kept the offline sync-note + failed-dismiss the old card had.
- **⚠️ Worklet gotcha (caught ON the emulator, red-screen):** dock.ts pure helpers MUST carry `"worklet"` —
  they run inside the dock's `useAnimatedStyle`/gesture; without it Reanimated throws "Object is not a function"
  on the UI thread. This class of bug does NOT reproduce under Jest — the emulator pass is why it was caught.
- **R1 (day-swipe vs tab pager)** device-verified BOTH ways: timeline region → change day (stays on Today);
  top-cards region → change tab (Today→Trends, one tab, no session-10 last-tab regression); vertical drag on the
  timeline scrolls. `blocksExternalGesture` + shared-value live-state (no mid-gesture recreation, no setState).
- **CEO decision baked in**: workout tile/badge is now GREEN `#E7EDE1`/`#5F7A61` (movement = green) — reconciled
  app-wide (ripples to Trends chips + workout-detail badge); `entryPalette.workout.line` kept terracotta so
  WaveIllustration crests on detail screens are unchanged. **Flag for CEO** (§7 Q7 default that mattered).
- **Emulator (Pixel_10_Pro, Expo Go SDK 56, mock):** verified dock idle (matches screens/03), drag→day commit
  ("FRIDAY Jul 10"), Today↺ return, timeline rows (green workout tile), expand-in-place chips/items/Full details
  (matches screens/06), multi-open, R1 both ways. **NOT frozen in a screenshot:** the magnifier's live bulge +
  tooltip mid-drag (adb screencap lands on arbitrary frames) — gesture works end-to-end, math unit-tested.
- Gates: **tsc 0 · Jest 210/210 (41 suites, +2: dock, timelineData) · expo export OK**.
- **CEO Qs**: workout-green reconcile app-wide OK? · Full-details today-only OK? · past-day content shows empty on
  this emulator only because the persisted seed is anchored to an older date (query is the tested `entriesForDay`).

## Session 13 (2026-07-15) — APP-050 sheet-bounce fix SHIPPED + emulator-verified ✅
CEO greenlit the session-11 spec. Applied the exact 2-line behavioral fix to **`src/ui/useSheetDrag.ts`** only:
- **Entrance**: `withSpring(0,{damping:20,stiffness:210})` (ζ≈0.69, ~33px overshoot) →
  `withTiming(0,{duration:450, easing:Easing.bezier(.22,.9,.32,1)})` via a new exported
  `ENTRANCE_ANIM` const that reuses `motion.unfold` (verified = `{450,[.22,.9,.32,1]}` — no hardcoded values).
- **Cancelled-drag spring-back**: damping 18→30 (ζ≈1.01). Drag-follow + 260ms programmatic close untouched.
- **New test `src/ui/__tests__/useSheetDrag.test.ts`** (3 asserts): entrance is a 450ms timing descriptor,
  monotone-decelerate bezier (control y ≤ 1), no `damping`/`stiffness` keys. The Reanimated jest mock doesn't
  simulate spring overshoot (a frame test would false-negative) → used the spec's descriptor-assertion fallback.
- Gates: **tsc 0 · Jest 202/202 (39 suites, +3) · expo export iOS OK**.
- **Emulator (Pixel_10_Pro, Expo Go SDK 56, mock):** MacrosSheet entrance frame-burst = **clean monotone rise
  to rest, zero overshoot, byte-identical settled frames** (no bounce, no wobble). The childish bounce is gone.
  Recurring cold-boot ANRs (documented session-10 slow-JS emulator behavior, not an app regression); app reached
  a fully interactive Home repeatedly. Ledger: `Progress/APP-050-sheet-bounce-spec-Progress.md`.
- **⚠️ COMMIT HYGIENE — the working tree also holds uncommitted, in-progress HOME-V2 work that is NOT mine and
  NOT APP-050:** `src/tabs/home/` (DockDatePicker/DaySection/Timeline), `src/lib/haptics.ts`, and modified
  `src/tabs/Home.tsx`, `src/ui/tokens.ts`, `src/i18n/locales/en.json`, `package.json`/`package-lock.json`
  (expo-haptics). **The APP-050 commit must include ONLY `src/ui/useSheetDrag.ts` + `src/ui/__tests__/useSheetDrag.test.ts`.**
  Separately, that HOME-V2 `DockDatePicker.tsx` has a runtime `useAnimatedStyle` crash ("Object is not a function")
  surfaced on the emulator — belongs to whoever owns HOME-V2, unrelated to this fix.

## Session 12 (2026-07-15) — Home v2 spec (SPEC ONLY, no build) ✅
CEO asked for a full build-ready spec of **Home v2** (dock date picker + inline timeline)
before any code. Docs only — no src/, no simulator.
- **`docs/home-v2/IMPLEMENTATION-SPEC.md`** — the CEO-review deliverable: component tree→file
  map, §2 dock magnifier (Reanimated worklet math, vtTip spring, haptics-per-crossing, touch-down
  gesture), §3 timeline (day-swipe/expand/SQLite data), §4 tokens (16 exist / 17 differ / 39 new),
  §5 top-3 risks, §6 9-task build list + phasing (A timeline → B day-swipe → C dock → D tests),
  §7 11 CEO questions, §8 philosophy check. Companions: `docs/home-v2/{screens-analysis,
  handoff-extract,tokens-table}.md`.
- **Asana epic HOME-V2 `1216600225044885`** + subtasks HOME-V2-1..9 (all **Backlog**, Model: lines).
  **Gated** — don't start until CEO answers §7.
- New-file map: `src/tabs/home/{DockDatePicker,DaySection,Timeline}.tsx` + `dock.ts` (pure) +
  `src/lib/haptics.ts`; modified `src/tabs/Home.tsx`, `src/ui/tokens.ts`, en.json. Proposed dep:
  `expo-haptics` (linear-gradient recommended skipped).
- **Top-3 risks:** R1 day-swipe vs TabsPager (blocksExternalGesture; timeline region can't
  tab-switch — Trends-scrub precedent); R2 dock spring fidelity (device-tune vs screens/04,05);
  R3 onLayout-started tweens + no-setState-mid-gesture.
- **⚠ README cites screens 01-home-overview + 02-water-card-expanded that are NOT in the handoff**
  (CEO Q10).

## Session 11 (2026-07-15) — Sheet-bounce fix SPEC (CEO review gate, no code)
CEO regression report: sheet entrances bounce (session-10 `useSheetTransition` spring,
ζ≈0.69). Spec ONLY — `docs/reviews/2026-07-15-sheet-motion-fix-spec.md` (root cause,
all 10 affected sheets, exact fix = entrance → `withTiming` 450ms `motion.unfold`
bezier + spring-back damping 18→30, diff sketch, verification, risk). Ticket
**APP-050** (Backlog, gated on CEO approval). No src/ changes, no emulator this session.

## Session 10 (2026-07-15) — CEO app batch (10 items) + emulator verification ✅
CEO filed a 10-item device-test batch. Tickets **APP-040…049** created In progress
(DoD = store). Ledger: `Progress/APP-040-049-CEO-batch-Progress.md`. Contract types
regenerated to **v0.5.0** (`exercises[].muscles`) → `api:check` CLEAN (standing drift
cleared). Gates: **tsc 0 · Jest 199/199 (38 suites) · expo export OK**. New dep:
**expo-document-picker ~56.0.4** (SDK-56, the one justified add, PDF import).

- **Verified ON THE EMULATOR (Pixel_10_Pro, Expo Go SDK 56, mock mode):**
  - **#4 swipe→last (recurring, real fix):** `TabsPager.snapTarget` replaced the
    velocity-projected `round(index − v·0.25)` (which flung 2+ pages on a fast flick) with
    a ±1-page-from-start snap. Fast flick from Today lands on **Trends**, never the last
    tab. One swipe = one adjacent tab.
  - **#3 fluid close (real):** `SheetOverlay`+`useSheetTransition` unify open/drag/programmatic
    close on one `translateY`; caught the macros sheet **mid-slide** (handle at the edge,
    backdrop faded) — no snap. Migrated Capture/Checkin/Review sheets too (`useSheetDrag`→
    `useSheetTransition`; those 3 were the tsc-break the orchestrator reconciled).
  - **#5 scrub (real polish):** guide line follows the finger on the UI thread, readout
    tracks the day.
  - **#6 macros sheet:** ALREADY DONE (stale build) — opens "Macros today" (IMG-1).
  - **#8 BodyMap:** now ONE view + "⇄ See back/front" toggle (not front+back at once);
    tint regions correct.
  - **#9 preview→detail:** IMG-3 preview (date badge, "min · kcal · via SOURCE", chips,
    "Preview · drag down to close") → IMG-4 detail ("MUSCLES LIKELY WORKED", See back).
  - **#10 muscle→exercise:** chip AND avatar region select → selected-muscle panel + header
    + chip highlight. Exercise-highlight/role sub-panel is unit-tested (`muscleExercises`);
    couldn't be shown live because the emulator's persisted SQLite surfaced older
    exercise-less "leg day" captures.
- **Verified by tests/code (not driven live):** #1 PDF import (`planImport.ts` + test;
  client `requestUpload`/`putPresignedFile`, mock, PlanStep `importPdf`, onboarding wiring)
  and #2 voice import (mic on PlanStep describe via `getRecognizer`) — onboarding-gated,
  not re-driven to avoid re-onboarding on the emulator. #7 vacation End confirm
  (`ConfirmSheet`, both call sites) — `account.test` covers it; vacation was inactive.
- **⚠️ Self-inflicted emulator degradation:** a `wm size` experiment (to film the 260ms
  close) black-screened Expo Go and triggered repeated ANRs. Recovered with force-stop +
  relaunch; freed the idle 8081 Metro. **Not an app regression** — the app ran smoothly
  before and after.
- **Benign warnings (pre-existing, non-fatal):** Reanimated "Property 'transform' … may be
  overwritten by a layout animation"; expo-blur "dimezisBlurView … blurTarget not configured
  → fallback none" (Android blur → cream scrim).
- **CEO / backend:** PROD PDF parse against real Claude (`plan-pdf-model`) not exercised
  here (mock verified) — first real import will surface any model-id error; backend is
  verifying in parallel.

## Session 9 (2026-07-15) — Health integrations + real Android APK ✅
Milestone: Health Connect (Samsung + Google fitness data) + a sideloadable Android
dev-build APK (no Expo Go, no stores). Tickets created first per CEO: **APP-007-android**
(`…/1216590001991644`), **APP-038** (`…/1216604793549171`), **APP-039** (`…/1216589824648124`).
Ledgers: `Progress/APP-007-android-dev-build-Progress.md`, `Progress/APP-038-health-connect-Progress.md`.
ADRs **0004** (HC supersedes Google Fit) + **0005** (Android CNG dev build).

- **APP-039 verdict (ADR-0004):** ONE integration — Android Health Connect — covers
  Samsung + Google fitness data. **Google Fit is a dead end** (its APIs are deprecated;
  no new sign-ups since 2024-05-01, sunset end-2026; Google points to Health Connect).
  Samsung Health syncs into Health Connect since Oct 2022. Did NOT build a Google Fit client.
- **APP-038 (HC read, device-local):** new stub-seam `src/health/healthConnect.ts` (same
  pattern as voice/notifier): `HealthReader` iface + `stubHealthReader` (Expo Go/iOS/jest,
  honest absence) + real `react-native-health-connect` reader (active energy/steps/sessions
  for today). Pure `mapHealthToday` unit-tested. kv snapshot store — **NEVER the outbox**
  (backend **ADR-0016** confirms HC data is device-local; EntrySource is server-set to `user`,
  no health ingestion contract in v0). Feeds the Energy card **spent** (`healthActiveKcalToday`)
  + a "N steps · M workouts · from Health Connect" readout. Integrations screen: the
  `healthConnect` toggle is the ONE real switch (connect→permission→read; off→clear); others
  stay honest UI-only. **New dep `react-native-health-connect@^3.5.3`** (native + plugin).
- **APP-007-android (CNG APK):** `expo prebuild` (android/ gitignored) + `./gradlew
  :app:assembleRelease`, debug-keystore signed. **APK boots + navigates + Home renders +
  HC real path crash-free — all emulator-verified** (Pixel_10_Pro, host GPU).
  **For CEO's Google OAuth client:** package `com.llmagal.vita`, SHA-1
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. APK at
  `android/app/build/outputs/apk/release/app-release.apk` → `adb install -r`. Prod-backed
  build: `VITA_API_BASE_URL=https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1 ./gradlew :app:assembleRelease`.
- **Native config in `plugins/withHealthConnect.js`** (CNG-safe, idempotent): HC read
  permissions + `<queries>` + minSdk 26 (app module forced — gesture-handler floors 26) +
  **`MainActivity.onCreate` permission-delegate registration** (the library's Expo plugin
  omits it → the permission request crashed with `UninitializedPropertyAccessException`;
  found + fixed on the emulator).
- **⚠️ prebuild rewrites `package.json` `android`/`ios` scripts to `expo run:*` each run** —
  reverted to `expo start --*` in the committed file (we don't commit android/; CNG). Use
  `npm start` for Expo Go. Also `expo-system-ui` warning on prebuild is benign (light-only).
- Gates: **tsc 0 · Jest 179/179 (36 suites, +8) · expo export iOS OK · APK boots**. New dep:
  only `react-native-health-connect`. `api:check` drift unchanged (backend's `exercises[].muscles`).
- **Pending CEO:** (a) create the Google Android OAuth client from the package+SHA-1 above;
  (b) real HC data verification on the **Samsung phone** (emulator has HC but no data provider,
  and the permission grant can't be completed via automation). APP-007/APP-038 stay In progress
  (DoD = in production; sideload works, store release is F-LAST).

## Session 8 (2026-07-15) — CEO feel-pass batch (9 prototype-drift items) ✅
CEO verdict: "O feel está muito melhor" + PDF export confirmed great. Filed a 9-item batch and un-gated
**`expo-blur`** (the one approved new dep). All 9 landed. Full per-item detail + verification in
`Progress/APP-CEO-BUGS-Progress.md` §session-8. Gates: **tsc 0 · Jest 172/172 (35 suites, +4) · expo export
iOS OK · expo install --check up to date** (expo-blur `~56.0.3`, SDK 56 preserved).

- **New shared primitives (reuse these):** `src/ui/sheetPresence.ts` (`useSheetPresence`/`useAnySheetOpen`
  — app-wide "a sheet is open" signal; the pill hides under any sheet), `src/ui/SheetBackdrop.tsx` (blurred
  backdrop via expo-blur, light tint + cream scrim fallback), `src/ui/BackButton.tsx` (42px round chevron,
  the ONE back button — swept everywhere).
- **Changed primitives:** `Card` now renders `Animated.View` (drop-in; pass `layout` to get a height tween —
  Home water/energy expanders do). Sheets (SheetOverlay + Capture/Check-in/Review) now ride SheetBackdrop.
- **New sheets:** `src/tabs/MacrosSheet.tsx` (Home macros → full sheet), `src/capture/PhotoSheet.tsx`
  ("Add from a photo": camera vs library). `photo.ts` `pickPhoto(source)` gained a camera path.
- **Plan-digest habit:** `HabitKind` += `"digest"` (notification-only, excluded from check-ins); notifier
  sends the meal's macros + example foods via new pure `src/habits/digest.ts planDigestBody`.
- **Home header:** 4 icons (trends/habits/integrations/account) replaced the single ☺ button.
- **⚠️ Fragile paths untouched:** TabsPager gesture, useSheetDrag worklets — no changes. Item 9 (swipe order)
  was **already** Today→Trends→Habits in source (`TAB_ROUTES` + `tabs.test.ts`); left as-is, flagged for a
  device pass (do NOT boot the emulator without CEO authorization).
- **Needs device/Expo-Go visual confirm (can't test under jest):** (a) expo-blur actually blurs on the CEO's
  phone — else the cream scrim still dims (acceptable fallback); (b) the pill slides away cleanly under every
  sheet; (c) swipe order matches the menu on the latest build (item 9).
- **`api:check` drift** = backend's parallel `exercises[].muscles` (already at HEAD, per-exercise tinting is
  next round) — not this batch; `types.gen.ts` intentionally not regenerated.

## Session 7 (2026-07-15) — APP-037 hygiene sweep ✅
**CEO un-gated APP-037.** Surgical ponytail sweep — the codebase was already clean
(sessions 4–6 kept it tidy), so this was small deliberate cuts + the missing README,
not a demolition. Ledger: `Progress/APP-037-hygiene-sweep-Progress.md`. Gates: tsc 0 ·
**Jest 168/168 (34 suites, unchanged)** · `expo export` iOS OK. No new deps, no
behavior change, product philosophy intact.
- **What changed (all real, all small):** dropped a stale `v0.3.0` header pin in
  `api/client.ts`; deduped the vacation range predicate (`isVacationActive` now reuses
  `vacationExcluder`); extracted a `CountBanner` in `tabs/Home.tsx` (~40 dup lines
  gone, flex:1 row + worklets untouched); removed 2 unused imports (`pdf.ts`,
  `onboarding.tsx`) and a dead const `WEEKDAYS` (`tabs/Habits.tsx`).
- **What was deliberately left alone:** all gesture/worklet paths (TabsPager pan,
  SheetOverlay/useSheetDrag, useStartOnLayout, scrub-vs-pager, PDF export); the
  voice/OIDC/notifier **stubs** (load-bearing seams for APP-007); i18n keys (dynamic
  lookups); no file moves (RN structure already idiomatic — CEO directive).
- **New: `services/vita-app/README.md`** — what/how-to-run/tests + **3 Mermaid
  diagrams** (architecture, offline/outbox sync w/ needsReview + poison-pill taxonomy,
  navigation/screen map).
- Scans confirmed clean: no dead files, no dead i18n keys, no swallowed catches, no
  stray console, no commented-out code, no genuinely-dead exports.

## Session 6 (2026-07-14/15) — Fable fidelity backlog + emulator-verified fixes ✅
**All 3 remaining CEO bugs (#3/#4/#6) fixed and emulator-verified; full Fable fidelity backlog
implemented.** Commits `2bb753f..bfc4e48`; tsc 0 / Jest 168 (34 suites). Full narrative in
`Progress/APP-CEO-BUGS-Progress.md` §session-6 (passes 1–4). What the next session needs to know:

- **New shared primitives (use these, don't re-invent):** `src/ui/PressScale.tsx` (scale-on-press),
  `src/ui/SheetOverlay.tsx` (THE bottom-sheet chrome: backdrop + rise + worklet drag-dismiss +
  optional keyboard lift — every sheet now rides it), `src/ui/useSheetDrag.ts`, `src/ui/Chevron.tsx`
  (rotating disclosure, `flip` variant), animated `Bar`/`Toggle`, `src/ui/MorphBlob.tsx`
  (+`MorphContainer`), `src/trends/parts.tsx` `GrowBar`, `src/ui/useStartOnLayout.ts`.
- **Three device-only pitfalls discovered (respect them in future work):**
  1. **Never setState mid-gesture** — mounting a pager neighbor from the pan's `onBegin` recreated
     the gesture and reset its translation (the "swipe sometimes dead" bug). Pre-mount from
     deferred effects (`src/nav/TabsPager.tsx`).
  2. **Mount tweens must start from `onLayout`, not bare `useEffect`** — effect-scheduled
     `withTiming` races view attachment on busy cold boots (use `useStartOnLayout`). Animated
     %-height on an absolutely-positioned child never applies (use px). SVG `animatedProps`
     freeze if the owner re-renders mid-tween (memo the component) and can drop the tween
     entirely (pin final state with a timeout).
  3. **Trends scrub vs pager:** pager publishes its gesture via `.withRef(tabsPagerRef)`
     (`src/nav/pagerRef.ts` — leaf module, import cycle); ScrubOverlay mounts ONLY on an open
     card and `.blocksExternalGesture(pager)`.
- **PDF export final recipe** (`src/export/pdf.ts`): print-cache is unreadable by FileProvider AND
  the File API → `printToFileAsync({base64:true})` → `File.write(base64)` in `Paths.document` →
  `Sharing.shareAsync`. Emulator-verified (share sheet opens).
- **Open (CEO-gated):** B12 blur backdrops (`expo-blur` new dep) · per-exercise muscle tinting
  (needs `exercises[].muscles` from backend parse — contract change). Fidelity backlog reference:
  `docs/reviews/2026-07-14-fable-fidelity-audit.md`.
- **CEO phone pass pending** — subjective feel only; every functional bug is device-verified.

## CEO live-test bug batch (2026-07-14, session 5) — see `Progress/APP-CEO-BUGS-Progress.md`
8 of 11 CEO-reported bugs fixed + pushed (`163e8c4..8f04847`); the swipe-nav worklet crash (top
priority) is device-verified. **Remaining, need on-device verification (CEO tests on phone — do
NOT boot the emulator):** #6 Trends scrub (pager gesture ref via Context — risks nav regression),
#3 sheet drag-to-dismiss fluidity, #4 export PDF (silent `catch{}` hides the failure). Root
causes + ready-made recipes for all three are in the ledger.

## Dev paste-token sign-in (2026-07-14) — Expo Go real-backend unblock ✅

Lets the CEO finish magic-link sign-in in Expo Go against the real backend by pasting the token
(the `vita://` scheme only routes in a dev build, not Expo Go). Detail:
`Progress/APP-DEV-PASTE-TOKEN-Progress.md`.
- **`__DEV__`-guarded** paste block at the bottom of `IdleCard` in `app/auth.tsx` — compiled out of
  release builds (verified: absent from `expo export` prod bundle).
- New helper `tokenFromPaste()` (`src/auth/useMagicLink.ts`): everything after the last `token=`
  (else the trimmed string) → handles full `vita://…?token=X` link, `exp://…?token=X`, and a raw
  `token=X` log line, all → `X`. Runs the **same** `signInWithMagicLink → verifyMagicLink → session`
  path as the deep link; failure reuses the `auth.invalidLink` calm notice.
- One i18n key `auth.pasteTokenDev`. Test: `test.each` over the 3 paste shapes asserts
  `verifyMagicLink("abc123")`.
- Gates: `tsc` 0 · **Jest 161/161 (32 suites), +3** · `api:check` 0 drift · `expo export` OK.

## Offline-capture review banner (2026-07-14) — CEO Round 12 #2 ✅

Resolves audit-2 §5 + finding 1.8 (and Q2). Offline captures still auto-add on reconnect
(durability) but are now flagged `needsReview` and get their skipped confirm/adjust/discard
affordance back via a Home banner + review stack sheet. Detail: `Progress/APP-OFFLINE-REVIEW-Progress.md`.
- **Flag**: `entries.needsReview` column (`src/db/db.ts`, guarded ALTER for old dbs);
  `addLocalEntry(entry, needsReview=false)`. `interpretPending` (`src/db/outbox.ts`) sets it;
  the online `CaptureContext.confirm` path does not.
- **Banner**: `home.tsx` `countNeedsReview()` → "N offline captures added — tap to review"
  (`home.offlineReview*`), between the check-in banner and the hero, hidden at 0. Opens `openReview()`.
  **Home two-column water/macros `flex:1` row untouched** (verified).
- **Review sheet**: `src/review/ReviewSheet.tsx` (new) — mirrors `CheckinSheet` (overlay,
  drag-dismiss, step-through-queue); entry summary reuses the capture **`DraftCard`** (now exported).
  Per entry **Keep** (`clearReview`), **Adjust** (`deleteEntry` + `capture.promptAdjust(sourcePhrase)`,
  new context method), **Discard** (`deleteEntry`). Last one cleared → sheet closes, banner gone.
  Mounted in `(main)/_layout`.
- **Failed-card discard (Q2)**: `home.tsx` terminal `failed` timeline card now has a **Dismiss**
  action (`deleteEntry` + `logChanged`). No retry infra.
- ponytail: `deleteEntry` is local-only (no delete endpoint in the contract; SQLite is the display
  source). **Open Q for CEO**: make Discard authoritative server-side (needs a backend delete/void op)?
- Gates: `tsc` 0 · **Jest 158/158 (32 suites), +4** · `api:check` 0 no drift · `expo export` iOS OK.

## Review-fix batch #2 (2026-07-14) — Fable audit #2 app-side correctness ✅

Fixed 8 findings from `docs/reviews/2026-07-14-fable-audit-2.md` at the shared roots
(outbox poison taxonomy + kv hydrate). Full detail: `Progress/APP-AUDIT2-FIXES-Progress.md`.
- **1.1 HIGH** last-7 chart no longer paints today's spent on all 7 days / overflows: per-day
  spent via new `last7EnergySeries`/`energyChartMax` (`src/energy/manual.ts`); Home rewired.
- **1.2 HIGH** parked-offline **photo** with a purged cache uri no longer stalls the drain forever:
  `interpretPending` pre-flights `FileSystem.getInfoAsync` → missing file throws `PoisonError`
  (dropped, drain continues); `persistForQueue` copies the JPEG to `documentDirectory` on park.
  New dep **`expo-file-system ~56.0.8`** (SDK 56, lazy-required, no plugin).
- **1.3 MED** check-in 409 re-answer now reconciles via PATCH (`reconcileCheckin409`) instead of
  dropping → the new answer lands; no silent desync.
- **1.4 MED** offline plan/program/vacation edits survive the next hydrate via a **`dirty` flag**
  in kv (`isDirty/setDirty/clearDirty`); dirty → re-push + keep local, never hydrate over it.
- **1.5 LOW/MED** `isPoison(err, op)` drops 403/404 for `update` ops (no infinite backoff stall).
- **1.6 LOW** update-op + reconcile PATCH now send `{detail, occurredAt}`.
- **1.8 LOW** poison-dropped ops go to a terminal `failed` state; Home shows "couldn't be saved"
  (`home.notSaved`) instead of an eternal "waiting to sync". (NOT the full offline-review UX — that
  stays a pending CEO product decision.)
- **2.2/2.4 docs** `habits.ts` header comment corrected (check-in results DO ship habitId/name/kind, encrypted).
- **NOT changed**: offline auto-log-vs-confirm behavior (pending CEO call); 1.7 backend AAD (BE-028).
- Gates: `tsc` 0 · **Jest 154/154 (32 suites), +10** · `api:check` 0 no drift · `expo install --check`
  up to date · `expo export` iOS OK. Home two-column `flex:1` layout intact. Each HIGH/MED test
  verified to fail before its fix.

## Current state (Phase 2 — session 14 done 2026-07-14: slice 8 tech debt & polish ✅ APP-033/034/035)

- **Slice 8 complete** (`docs/backlog-local-100.md` slice-8 debt table). Progress: `Progress/APP-033/034/035-Progress.md`.
- **APP-033 Offline interpretation + reconnect drain**: new `pending_parse` table + a **third outbox op `interpret`** (audit 3.2 op column now has a second real use). `src/db/entries.ts` `enqueueInterpretation`/`getPending`/`deletePending`. `CaptureContext` splits failure: reached-but-failing server (`ApiError`) keeps the retry UI; **network failure parks the raw capture** (text phrase, or photo uri+caption) and shows `capture.offlineQueued` — nothing lost offline. `src/db/outbox.ts` rewritten as a **snapshot-loop** so an `interpret` op parses raw input into entries and sends those follow-up creates in the SAME pass; **poison-pill preserved** (4xx dropped incl. its pending row; network/5xx back off + stop). `src/db/reconnect.ts` `startReconnectDrain()` subscribes to NetInfo (lazy-required, off the jest path) and drains on disconnected→connected; mounted once in `(main)/_layout` via hook-safe `useEffect`. **New dep `@react-native-community/netinfo@12.0.1`** (Expo Go SDK 56 OK). +4 outbox tests (enqueue, 422-drop, network-backoff, ordering).
- **APP-034 Maestro E2E**: two flows in `app/services/vita-app/.maestro/` — `onboarding-capture.yaml` (sign-in→6-step onboarding→capture→confirm→timeline) and `auth-deeplink.yaml` (magic-link deep link). Text/label-driven, no testIDs. Runner doc `app/Doc/e2e-maestro.md`. **Not bundled** (plain YAML, `grep dist/` empty), Maestro **not** an npm dep — gates don't need it.
- **APP-035 Fidelity**: `WaveIllustration` crest now **draws on** (`strokeDashoffset 420→0`, 1.1s, matches prototype `vtDraw`) via AnimatedPath — reused everywhere; new `delay` prop staggers timeline crests (`100 + index*90`). Vacation + check-ins banners gain `entering={FadeInDown}` / `exiting={FadeOut}` (prototype `vtIn`). **No new deps** (reanimated + svg already in). **Home two-column `flex:1` layout untouched** (verified).
- Gates: `tsc` exit 0 · **Jest 144/144 (31 suites)**, +4 · `api:check` exit 0, no drift · `expo export` iOS OK · `expo install --check` up to date, SDK 56, +1 dep (netinfo).
- ponytail: interpret auto-logs parsed drafts on reconnect (no deferred re-confirm queue); queue only on true network failure (5xx keeps retry UI); NetInfo listener untested (drain fully tested); one-time entrance/draw motion only (skipped `vtBreath`/`vtBlob` idles).

## Current state (Phase 2 — session 13 done 2026-07-14: slice 7 F9/F10/F11/F12 ✅ APP-029/030/031/032)

- **Slice 7 complete** (`docs/backlog-local-100.md` F9–F12, decisions D1/D2/D8). All four walkable in Expo Go, mock mode. Progress: `Progress/APP-029/030/031/032-Progress.md`.
- **APP-029 Account & Integrations**: new `app/(main)/account.tsx` (profile expand → name/units **apply everywhere via PATCH /me**; Your-setup deep-links to plan/program/integrations/habits; master check-in-reminder toggle drives the APP-026 Notifier; sign out) + `app/(main)/integrations.tsx` (**honest UI-only toggles**, 6 sources, "Connect a health source", never fabricates). `src/db/settings.ts` gained `setName`/`setUnits` (PATCH mirror), `notificationsEnabled`, `integrationEnabled` helpers. New `src/ui/Toggle.tsx`. Home header gained the **account entry-point button** (only new nav; pill still has Today/Trends/Habits).
- **APP-030 Vacation**: `src/db/vacation.ts` — local config (offline-first), **only the ranges persist** via `PUT /me/vacations` (replace-on-write, D1; server never reads — BE-025), `syncVacation()` hydrates on Home mount. **ONE state-driven accent token** `src/ui/accent.ts` (`useAccent()`), flipped to `colors.vacationAccent` on start/end; the **capture pill** (mic + active nav) subscribes → app visibly shifts to sea tone. `src/vacation/VacationSheet.tsx` (date range validated, keep-check-ins toggle, trip habit typed **or** by mic). **Home sea-tone banner** when active. **Notification pausing** via one gate `notificationsPaused()` in the notifier (master-off OR on-vacation-and-not-kept). **Trends hide-days**: `trends.tsx` now feeds `vacationExcluder(vacationRanges())` — the real ranges into slice-6's wired hook (no aggregation change).
- **APP-031 Export PDF (on-device, D2)**: `src/export/pdf.ts` pure `buildExportHtml` (per-audience sections, **estimates labeled**, user text **HTML-escaped**) + `exportPdf` reads **last 30 days from SQLite** → `expo-print` → `expo-sharing`. `src/export/ExportSheet.tsx` (audience → toggleable content chips → Prepare PDF). **Nothing leaves the device until the user picks a share target.** New deps `expo-print@~56.0.4`, `expo-sharing@~56.0.21` (SDK-56, `expo-sharing` plugin added).
- **APP-032 Energy (D8)**: `src/energy/manual.ts` — "spent" is now the **sum of logged workout kcal** (Home, labeled estimate; replaced hardcoded 0) + a **manual add** (numeric field on the energy card, or say "burned 300" to the pill via a new `mockParse` branch) written as a **workout entry with kcal + no exercises** through the existing outbox — no new endpoint/shape.
- **Vacation ranges flow**: sheet → `saveVacation` → kv + `PUT /me/vacations` (fire-and-forget) + accent + notif reschedule; relaunch → `syncVacation` `GET` → kv; `trends.tsx` `vacationRanges()` → `vacationExcluder` → per-day exclusion. **Nothing leaves the device in export until shared** (only path is `Sharing.shareAsync` after local render).
- Gates: `tsc` clean · **Jest 140/140 (31 suites)**, +18 (settings 4, vacation 5, export 4, manual 3, account 2) · `api:check` **exit 0, no drift** (vacation types already committed; no regen) · `expo export` iOS OK · `expo install --check` up to date, SDK 56, **+2 deps** (expo-print, expo-sharing).
- **Home two-column layout untouched** (`flex:1`, no `height:"100%"`).
- ponytail: accent reactivity on the always-present pill + Home banner (full-app is a one-line-per-screen swap, ceiling noted in `accent.ts`); notifications/keep-checkins modeled as single booleans; date entry validated text (no picker dep); trip-habit mic reuses the stub recognizer.

## Current state (Phase 2 — session 12 done 2026-07-14: slice 6 F8 Trends ✅ APP-027/028)

- **Slice 6 complete** (`docs/backlog-local-100.md` F8, **D4** client-side-over-SQLite). Both tabs walkable in Expo Go, mock mode. Progress: `Progress/APP-027-Progress.md`, `Progress/APP-028-Progress.md`.
- **New module `src/trends/`**: `aggregate.ts` (all windowing/bucketing math — pure, DB-free, unit-tested), `scrub.tsx` (scrub-by-drag reusing the Slider gesture pattern — `indexFromX` + `<ScrubOverlay>`, no new deps), `parts.tsx` (`TrendCard` collapsible+scrub-readout, `linePath`, `SectionLabel`), `FoodTab.tsx`, `ActivityTab.tsx`.
- **APP-027 Food tab**: W/F/M window switch; calories **bars↔curve** toggle, consumed-vs-spent, macro balance, water (units-aware), meal-time dot plot. Scrub reads the day under the finger; non-active bars + vacation days dim. Estimates labeled. `spentKcal` = logged workout kcal (D8, honest 0 until logged).
- **APP-028 Activity tab**: muscles heatmap = **two `BodyMap` primitives reused** (front/back, `showToggle=false`, fed `muscleStats.intensity`); ranked muscle chips w/ counts; active/aerobic minutes (honest — from logged workouts, "connect a health source" for more); workout heatmap squares → session list → **preview sheet** (Modal, mirrors workout detail, "Open this workout" deep-links).
- **Vacation-day filter hook wired end-to-end** (D1): `vacationExcluder(ranges)` predicate threaded from `trends.tsx` through every aggregation fn. Empty list today; **slice-7/APP-030 just swaps in the persisted ranges** — no aggregation change needed.
- **Host screen** `app/(main)/trends.tsx` replaces the stub (W/F/M + Food/Activity `Segment`s, range label). Reached via the pill's Trends button. **Home layout untouched.**
- **Seed extended** (`src/db/seed.ts`): ~a month of deterministic history (meals/water/workouts) so W/F/M all show data. No randomness (test-stable).
- Gates: `tsc` clean · **Jest 122/122 (26 suites)**, +16 (aggregate math 13, trends screen 3) · `api:check` **exit 0, no drift** · `expo export` iOS OK · `expo install --check` up to date, **no new deps**, SDK 56 preserved.
- ponytail: scrub always-draggable (readout on touch) vs prototype tap-then-drag; muscle chips display-only (no per-muscle exercise sheet); squares read-only (session list is the tap target); curve = single consumed-kcal polyline.

## Current state (Phase 2 — session 11 done 2026-07-14: slice 4 F6/F7 Habits & check-ins + notifications ✅ APP-024/025/026)

- **Slice 4 complete** (`docs/backlog-local-100.md` F6/F7, **D1**). Progress: `Progress/APP-024/025/026-Progress.md`.
- **Step 0 regen**: `types.gen.ts` regenerated from the committed contract — **no diff** (the final `checkin`
  entry type + `CheckinDetail` and loosened Idempotency-Key were already in from slice 3's regen). `api:check`
  clean before and after.
- **APP-024**: device-local habits domain `src/db/habits.ts` (CRUD; `days:boolean[7]` index 0=Sun, kind
  plain|plan, optional `planMealName`) + new `habits` table. `app/(main)/habits.tsx` rewritten: Today | Manage
  tabs, new-habit form (dual input), habit rows with enable toggle + 14-day dot strip + expand (day chips/time/
  remove). No streaks, no scores.
- **APP-025**: `src/habits/checkins.ts` — check-in answers persist via the **existing outbox** as `checkin`
  entries, id = **`habitId:date`** (doubles as Idempotency-Key; one per habit per day). Re-answer of a synced
  day → `update` outbox op → **PATCH /entries/{id}** (new `patchEntry` on client + mock). Local SQLite is the
  display source for dots. Plan check-in **Yes auto-logs the plan meal**; **Not quite opens capture**. Stack
  sheet `src/habits/CheckinSheet.tsx` (drag-to-dismiss, mounted in `(main)/_layout`), reused inline in Today.
  Home **"N waiting" banner** opens the sheet — **Home water|macros row left intact** (`flex:1`).
- **APP-026**: `src/habits/notifier.ts` — `Notifier` interface + expo-notifications impl (lazy require),
  `plannedNotifications` (pure weekday expansion), `refreshNotifications`/`ensureNotificationPermission` wired
  to habit CRUD. New dep `expo-notifications ~56.0.20` (SDK-56, plugin added). **Interactive lock-screen Yes/No
  = category registered best-effort; response→answer wiring deferred to APP-007** (needs a dev build to verify),
  in-app stack is the working path. `src/db/notify.ts` does NOT overlap (log-change signal) — nothing folded.
- **Fixed in passing**: the three fire-and-forget `drainOutbox(...)` sites (answerCheckin, home quick-add,
  capture confirm) gained `.catch(() => {})` — a late background drain was leaking as a cross-suite unhandled
  rejection under the new suites.
- Gates: `tsc` clean · **Jest 106/106 (24 suites)**, +15 · `api:check` **exit 0 clean (no diff on regen)** ·
  `expo export` iOS OK · `expo install --check` up to date, SDK 56, +1 dep (expo-notifications).
- ponytail: voice-add-a-habit skipped (pill mic logs entries, not habit defs); plan-digest decorative card
  skipped; interactive notification actions best-effort (dev-build verification is APP-007).

## Current state (Phase 2 — CEO live-bugfix pass done 2026-07-14: Home layout + sheet dismiss ✅)

- **Two CEO-reported bugs fixed and verified on a real running app** (Android emulator,
  Expo Go 56, mock data — before→after screenshots). Details + evidence paths in
  `Progress/APP-CEO-BUGFIX-Progress.md`.
- **Bug 1 (HIGH) — Home layout blowout.** `app/(main)/home.tsx` water card had
  `height: "100%"` inside a heightless `Pressable` in a `ScrollView` → percentage height
  resolved against the viewport and stretched the water column full-screen, floating macros
  and pushing energy/plan/timeline below the fold. Fix: dropped `height:"100%"`, used
  `flex: 1`; default stretch alignment gives equal-height WATER | MACROS columns.
- **Bug 2 (MED) — confirm sheet drag-to-dismiss.** Added a gesture-handler `Gesture.Pan()`
  to `src/capture/CaptureSheet.tsx` (no new deps): sheet follows the finger down,
  `activeOffsetY(10)` keeps taps working, release past threshold (`>120px`/`>800px/s`) calls
  `capture.close()` else springs back. Threshold is the pure/tested `src/capture/sheet.ts`
  `shouldDismiss`. **Gotcha fixed:** the decision must run on the JS thread via `runOnJS` —
  calling the plain JS helper inside the `.onEnd` worklet crashed the app to the launcher.
- **Blue floating gear:** not ours. No gear/cog/fab in source; the grey gear renders at a
  fixed screen position across onboarding/auth/home → device/OS overlay, not Vita UI.
- Gates: `tsc` 0 · **Jest 91/91 (21 suites, +4)** · `expo export` iOS OK. No new app deps;
  `package.json` unchanged (see Progress note re: `package-lock.json` if it shows touched).

## Current state (Phase 2 — session 10 done 2026-07-14: slice 3 F4/F5 Plan + program ✅ APP-021/022/023)

- **Slice 3 complete** (`docs/backlog-local-100.md` F4/F5, **D5**). Plan/program are persisted,
  editable, and read from the backend surface. Details in `Progress/APP-021/022/023-Progress.md`.
- **APP-021**: onboarding steps 3–4 hit the **REAL parse endpoints** and POST the confirmed draft
  (`savePlan`/`saveProgram`). Home reads the **persisted** plan/program (new `SetupRow`s → `/plan`, `/program`),
  hydrating the kv cache from `GET /plan|/program` on mount (404/offline keeps cache). Client-side mock
  read-back gone (`summarize()`, `settings.plan/program` removed). New: `src/db/plan.ts` (offline-first
  cache + save/update/sync), `src/plan/compute.ts` (pure recompute).
- **APP-022**: `app/(main)/plan.tsx` — eating plan with **Edit mode, any field editable** (inline text +
  portion slider **+ numeric**, dual input), **live local recompute**, Save = whole-plan **PUT /v1/plan**
  (full-doc replace, no patch). New primitives: `src/ui/Slider.tsx` (gesture-handler, **no native dep**),
  `src/ui/EditableText.tsx`, `src/plan/editor.tsx` (`EditHeader`/`BackButton`).
- **APP-023**: `app/(main)/program.tsx` — same Edit mode, **reuses** the APP-022 components; numeric
  sets/reps/load; Save = **PUT /v1/program**.
- **Step 0 regen**: `types.gen.ts` regenerated from the committed contract — additive `checkin` entry type +
  `CheckinDetail` and `/me/vacations` + `VacationRange` (BE-024/BE-025) came in. Forced one fix: Home
  **excludes `checkin`** from its timeline (D1; checkins belong to Habits, slice 4). Unused by app code otherwise.
- Gates: `tsc` clean · **Jest 87/87 (20 suites)**, +7 (compute 4, plan-screen 2, program-screen 1; onboarding
  updated) · `api:check` **exit 0 clean after regen** · `expo export` iOS OK · `expo install --check` up to date,
  SDK 56, no new deps.
- ponytail: plan/program POST/PUT are fire-and-forget (mirror `patchMe`); no outbox for plans yet.
  minItems:1 on meals/items (and days/exercises) can 400 a real PUT if a user adds-then-saves an empty
  meal/day — happy path fine, guard later. Micro chips display-only.

---
# App Team — Next Session (prior sessions)

## Prior state (Phase 2 — session 9 done 2026-07-14: slice 5 F3 Photo capture ✅ APP-020)

- **APP-020 built** (mock mode; BE-018 not live yet). Pill camera → `expo-image-picker` (library) → **downscale to 1568px / JPEG q0.8** (D3) → **multipart `POST /parse/photo`** → draft with **quantity steppers** → existing confirm/outbox path adds a meal (plate) or workout (whiteboard). Calm **decline/error** states + **"type instead"** fallback everywhere (permission denied, pick error, parse 422/413). Reuses the CaptureContext state machine — no parallel stack. See `Progress/APP-020-Progress.md`.
- New files: `src/capture/photo.ts` (pick+downscale, pure `downscaleSize`/`downscale`, calm outcomes), `src/capture/quantity.ts` (pure `stepItem`/`mealTotals`, exactly-reversible scaling). Mock: `mockPhotoParse` (canned plate; gym-caption → whiteboard). Client: `Api.parsePhoto` + FormData support in `request()` (no JSON content-type on multipart).
- **BE-018 handshake**: app posts `image` (file part, `photo.jpg`, `image/jpeg`), optional `caption`, optional `capturedAt` — no JSON, fetch sets the boundary. BE-018 reads field **`image`**. Details in the Progress file.
- New deps (Expo Go SDK 56 OK): `expo-image-picker@56.0.20`, `expo-image-manipulator@56.0.21`. `app.config.ts` gained `NSPhotoLibraryUsageDescription` + `expo-image-picker` plugin (inert in Expo Go).
- Gates: `tsc` clean · **Jest 80/80 (17 suites)**, +16 · `api:check` **clean, no drift** · `expo export` iOS OK · `expo install --check` up to date, SDK 56 preserved.
- ponytail: library pick (not live camera) — one-line swap to `launchCameraAsync` later; steppers meal-only.

---
# App Team — Next Session (prior sessions)

## Prior state (Phase 2 — session 8 done 2026-07-14: slice 2 F2 Workout ✅ APP-018 + APP-019)

- **Contract types regenerated to v0.4.0** (BE-017 app-side follow-up): `src/api/types.gen.ts` now matches the committed contract, `api:check` clean. NOTE: the contract also gained **`/plan`, `/plan/history`, `/program`, `/program/history` + `PlanVersion`/`ProgramVersion`** (backend F4 work, still labelled version 0.4.0) — regenerating pulled those additive types in; they're unused by app code today, harmless, and will serve F4/APP tickets later. `Muscle` = `NonNullable<WorkoutDetail["muscles"]>[number]` (11-enum) is authoritative and now mirrored at runtime by `ALL_MUSCLES` in BodyMap.
- **APP-018 built**: workout confirm card now renders i18n muscle chips + an exercises list (title/duration/kcal-estimate were already there); the confirm→entry path is the existing generic outbox flow. **Timeline workout cards navigate** (`/${kind}/${id}` for every kind) — last inert-card debt cleared. See `Progress/APP-018-Progress.md`.
- **APP-019 built**: new `app/(main)/workout/[id].tsx` (source badge, muscle map, exercises w/ kg→lb, 30-day history strip → RN-Modal preview sheet). **New reusable `BodyMap` SVG primitive** (`src/ui/BodyMap.tsx`) — front/back toggle, `highlighted: Partial<Record<Muscle,number>>` intensity map, pure `resolveHighlights`/`bodyRegions` exported for tests + APP-028 reuse. Seed gained 2 past workouts; `entriesInRange` added to `src/db/entries.ts`. See `Progress/APP-019-Progress.md`.
- **APP-028 (F8 Trends) can plan on BodyMap**: pass a normalized per-muscle intensity map + `showToggle`/`side` to drive the muscle heatmap; prop surface documented in `Progress/APP-019-Progress.md`.
- Gates: `tsc` clean · **Jest 64/64 (14 suites)**, +10 (BodyMap 5, workout 3, plus existing) · `api:check` clean · `expo export` iOS OK. No new deps, SDK 56 preserved.

---
# App Team — Next Session (prior sessions)

## Review-fix batch (2026-07-14) — Fable audit app-side findings ✅
Fixed 5 findings from `docs/reviews/2026-07-14-fable-audit.md` (see `Progress/APP-REVIEW-FIXES-Progress.md`):
- **1.1 HIGH** `src/db/entries.ts` — `addLocalEntry` now normalizes `occurredAt` to UTC `…Z` on write, so `entriesForDay`'s string range-query stops dropping offset-bearing (`+01:00`) timestamps near day boundaries. New regression test `src/db/__tests__/entries.test.ts`.
- **1.2 HIGH** `src/db/outbox.ts` — poison-pill fix: 400/409/422 `ApiError` is dropped and the drain continues; network/5xx still back off + stop. New test in `outbox.test.ts`.
- **2.1 MED** `home.tsx` — energy in/out bars scale vs `max(consumed, spent)`, no hardcoded 2500-kcal target.
- **2.2 MED** `home.tsx` — "Last 7 days" now queries real per-day meal kcal via `entriesForDay`; spent stays honestly 0 until health sync (no invented history).
- **2.5 LOW** `src/capture/CaptureSheet.tsx` — `MacroBox` renders "—" for null/undefined macros instead of "0 g".
- Gates: `tsc` clean · **Jest 56/56 (12 suites)**, +2 · `expo export` iOS OK · both new tests verified to fail pre-fix.
- **`api:check` drift is pre-existing, not this batch**: contract advanced to v0.4.0 (BE-017 `from`/`to`/`type` filters) but `types.gen.ts` not regenerated. Belongs to BE-017's app-side follow-up (backend agent editing contract live) — do NOT regen here.

## Current state (Phase 2 — session 7 done 2026-07-14: APP-017 Water complete, slice 1 ✅)

- **APP-017 built** (slice 1 of `docs/backlog-local-100.md`). Water is now a complete, navigable feature. New `src/lib/units.ts` `formatVolume(ml, units, t)` (metric ml/L, imperial oz via 29.5735; i18n-ready unit words `common.ml/l/oz`). Home Water card: units-aware figure, expanded rows show **amount · method · time** and are tappable → `/water/<id>`. Timeline water cards **now navigate** (per-kind href; workout still inert for APP-018/019) — clears the "water card doesn't navigate" debt. New read-only detail screen `app/(main)/water/[id].tsx` mirroring meal-detail (hero + "That day's water" log with current entry highlighted + day total + wave). Quick-add untouched (outbox). i18n `waterDetail.*`. No new deps, no contract/backend change, SDK 56 preserved. Gates: `tsc` clean · **Jest 54/54 (11 suites)**, +3 · `api:check` clean · `expo export` iOS OK. See `Progress/APP-017-Progress.md`.
- "method" in the ticket = the entry's existing `inputMethod` — `WaterDetail` stays `{ amountMl }`, no contract need.

## Prior state (Phase 2 — session 6 done 2026-07-14: APP-INTEGRATION local E2E vs REAL backend ✅)

- **App ↔ real Kotlin backend proven end-to-end locally** (real Postgres, real auth/entries/timeline/me). No prod, no deploy. The mock stays the default for tests/CI; real mode is a dev toggle via `VITA_API_BASE_URL`.
- **Recipe** (full detail in `Progress/APP-INTEGRATION-local-e2e-Progress.md`): backend = `cd backend/services/vita-api && docker compose up -d && ./gradlew bootRun` (health 200 on :8080; magic-link token printed to console by `LogMailer`). App = `VITA_API_BASE_URL=http://localhost:8080/v1 npx expo start`. **Base URL must include `/v1`** (client paths are relative; `/health` is unversioned). iOS sim `localhost`, Android emu `10.0.2.2`, physical Expo Go `<Mac-LAN-IP>`.
- **Verified all three flows** via curl AND via the real app client (`createHttpApi` + `types.gen.ts`): (a) magic-link request→verify→session; (b) parse/text→confirm→POST /entries (Idempotency-Key → 201, replay 200 same id) → timeline reflects it with server-computed totals (275 kcal), persisted in real Postgres; (c) GET/PATCH /me. New `npm run integration:smoke` harness (`scripts/integration-smoke.ts`) re-runs it.
- **No contract drift** — generated types (v0.3.0) matched real responses exactly. Behavioural notes (not bugs): base URL needs `/v1`; app sends `occurredAt` with local offset, backend returns UTC `Z` (same instant); default name = email local-part until set; no CORS needed (native fetch).
- **Cost guard**: compose ships Postgres only (no WireMock). Did exactly ONE real Haiku parse call as the smoke check, no loop; client smoke defaults to a canned golden draft (`RUN_PARSE=1` to opt into a paid call).
- Gates green: `tsc` clean · **Jest 51/51 (10 suites, mock default)** · `expo install --check` up to date · no new deps (tsx already a dev dep) · SDK 56 preserved. Files touched (app): `scripts/integration-smoke.ts` (new), `package.json` (+script), `tsconfig.json` (`exclude: ["scripts"]`). No `src/` change, no backend change.

## Prior state (Phase 2 — session 5 done 2026-07-13: APP-008 auth + magic link ✅ OIDC native stubbed)

- **APP-008 built** (In progress on Asana). Passwordless sign-in faithful to the prototype: `app/auth.tsx` (provider consent "nothing else" + email magic link "No passwords — ever"). Deep link `vita://auth?token=…` handled cold + warm (`src/auth/useMagicLink.ts`); token exchanged via `src/auth/session.ts` (single source of truth, **expo-secure-store**, single-flight refresh, sign-out, survives restart). API client gained the 5 auth methods + **Bearer injection + 401 silent-refresh** (hooks injected in `src/api/index.ts` via lazy thunks to dodge the session⇄api cycle). Auth gate: `app/index.tsx` (signed-out → `/auth`), `(main)/_layout.tsx` bounces to `/auth` on sign-out, root `_layout.tsx` reads the session before gating. React state via `useSyncExternalStore` (`useAuth`/`useAuthReady`), no provider. i18n `auth.*`. `tsc` clean · **Jest 51/51 (10 suites)**, +12 · `expo install --check` up to date (only new dep expo-secure-store ~56.0.4, SDK 56 preserved) · `expo export` iOS OK · `api:check` green (types.gen.ts regenerated to contract 0.3.0). See `Progress/APP-008-auth-magic-link-Progress.md`.
- **Google/Apple native sign-in is stubbed** (`src/auth/oidc.ts` `getOidcIdToken`) — same pattern as APP-012. Native OIDC needs a dev build (**APP-007**, CEO store accounts). Mock mode returns a fake id token so the consent→session demo flows in Expo Go; a real API base URL throws `OidcUnavailable` → screen shows "use email for now". Swap one function at APP-007, zero UI change.
- **Expo Go demo**: first screen is Sign in. Email → "Send link" → "Check your inbox" → **"Open the link · demo"** re-enters via the real `vita://auth` deep link → session → onboarding → Home. Or tap Google/Apple → consent → Accept → session.

## Prior state (Phase 2 — session 4 done 2026-07-13: APP-012 voice capture ✅ recognition stubbed)

- **APP-012 hold-to-talk built** (In progress on Asana). Press-and-hold the pill's mic → live-transcript overlay → release-to-send routes the final text through the **existing APP-011 parse→confirm path** (no parallel stack). Quick tap still toggles the text field. Slide up while holding → "Release to cancel". Calm permission/denied/unavailable/error states with a **Type instead** fallback to text. New files: `src/capture/speech.ts` (`SpeechRecognizer` interface + `stubRecognizer` + `getRecognizer`/`setRecognizer`), `src/capture/useVoiceCapture.ts` (state machine), `src/capture/VoiceOverlay.tsx`. Mic gesture = gesture-handler `Pan` (runOnJS) on the pill. i18n `capture.voice.*`. Mic/speech permission strings pre-declared in `app.config.ts` (inert in Expo Go). `tsc` clean · **Jest 39/39 (8 suites)**, +14 · `expo install --check` up to date (no new deps, SDK 56 preserved) · `expo export` iOS OK. See `Progress/APP-012-voice-capture-Progress.md` + **ADR-0003**.
- **Real recognition does NOT run in Expo Go SDK 56 — by design.** `expo-speech-recognition@56.0.1` is a native module + config plugin (verified from tarball) → needs a dev-client build, not in the Expo Go binary. Per the ticket stop-condition it was NOT installed. Recognition is stubbed behind the interface; the real engine drops in at **APP-007** (dev build) via `setRecognizer(real)` with zero UI changes. **Blocker: APP-007 (CEO Apple/Play accounts).**

## Prior state (Phase 2 — session 3b done 2026-07-13: APP-014 meal detail ✅)

- **APP-014 meal detail built** (In progress on Asana; DoD = tester build). New route `app/(main)/meal/[id].tsx`, read-only over SQLite/`getEntry`, faithful to the prototype: hero + estimate tag, source-phrase quote, item breakdown, **macro donut** (new `src/ui/Donut.tsx` primitive), micronutrients vs FDA daily reference (aggregated by name across items), footer. Timeline **meal** cards now `router.push('/meal/<id>')`; water/workout cards don't navigate (their detail screens are later tickets). Seed meal gained `micros` so the screen is full in Expo Go. i18n `mealDetail.*`. Exported `MealItem`/`Micro` from `src/api/client.ts`. `tsc` clean · **Jest 25/25 (7 suites)** · `expo export` iOS OK · SDK-56 guard green. See `Progress/APP-014-meal-detail-Progress.md`.

## Prior state (session 3 — SDK 56 pin so store Expo Go opens M1)

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

1. **APP-008 native OIDC** — deferred to APP-007 dev build: implement `getOidcIdToken` in `src/auth/oidc.ts` (@react-native-google-signin + expo-apple-authentication), keep the `/auth/oidc` exchange + consent UI as-is. A Maestro deep-link flow (`vita://auth?token=…`) where the simulator permits. `types.gen.ts` now tracks contract **0.3.0** (plan/program parse-import types available for the onboarding-import ticket).
2. **APP-012 real recognition** — deferred to APP-007 dev build: `npm i expo-speech-recognition`, add its config plugin, implement `SpeechRecognizer`, `setRecognizer(real)`; then a Maestro flow where the simulator permits. UI is done.
3. **Workout detail** (interactive muscle map) + **water detail** — timeline workout/water cards don't navigate yet; `Donut` primitive now exists to reuse.
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
