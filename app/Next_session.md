# App Team — Next Session

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
