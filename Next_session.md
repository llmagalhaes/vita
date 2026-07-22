# Orchestrator — Next Session

> Read `CLAUDE.md` first (bootstrap + non-negotiables). This file is the orchestrator's state: what just happened, what to do next, without re-reading the whole history. Team-level detail lives in `backend|app|devops/Next_session.md`.

## Where we are (2026-07-22, session 18c — MEAL/WORKOUT PLAN DEPLOYED TO PROD + fresh APK)

**Deploy round DONE (CEO go).** Image `vita-api:b56e2f5` (Dockerfile.runtime over host bootJar; scratch context bypasses `.dockerignore` excluding `build/`; buildx needs `cliPluginsExtraDirs` when using the scoped DOCKER_CONFIG workaround). **Terraform reconciled per OPS-024** — modules/ecs gained `public_base_url` (env `PUBLIC_BASE_URL` ← apigw invoke URL), `app_image_tag` default → `b56e2f5`; plan was exactly task-def replace + service update; **task-def vita:8**, services-stable, `/health` 200 (health path is `/health`, NOT `/v1/health`). **V008 applied on boot** ("Successfully applied 1 migration … v008"). **Live probes ALL green:** POST /plan → ids `it-1/it-2` + exact bounds (egg `{0,4,1}`, ml `{0,400,50}`); PUT /plan/portions 200+echo; unknown id 422; reset-on-reimport; history frozen; **real Claude parse returned per-item microsPerUnit + portion**; cost line live: `parse plan=eating outcome=ok inputTokens=1424 outputTokens=723` (Logs Insights-queryable). **Fresh APK built** (113 MB, 2026-07-22 21:12, prod URL verified inside; carries APP-074 + the whole meal-plan round). BE-041 + OPS-024 commented Done-state on Asana. Leftovers: 2 probe accounts in prod DB (`vita-probe*-20260722@example.com` — DELETE /me is 405, deletion endpoint shape differs; DB disposable per A2); rollback rehearsal §6.2 skipped (A2 voids it); 18b review minors still open below. **CEO: install the APK clean (`adb uninstall com.llmagal.vita`) → Eating Plan (tap item → slider/exact field, live totals+micros), Workout detail (muscle map opacities/pulse), then sweep boards.**

## Where we were (2026-07-22, session 18b — build round; superseded by 18c above)

**Build round EXECUTED and committed** (`b56e2f5` backend, `689058e` app): 2 Opus builders per amended specs + Fable lead adversarial reviews + 1 critical fixed (Home plan-row kcal ignored the portion overlay — spec-named call site, caught by the app lead). Gates orchestrator-verified: **backend `check` 202 green (+45)** · **app tsc 0 · Jest 250/250 (47 suites, +9) · api:check clean vs v0.6.0 · expo export OK**. BE-037..040 + APP-075..081 all built; tickets commented, In progress (DoD=prod/store).

**Review minors recorded as follow-ups (non-blocking, fold into a future round):**
- BE: `{"it-1": null}` body → NPE→500 (contract says 400; one-line guard in PlanService.putPortions) · program docs get NO item ids (deliberate ponytail cut, D-8 overlay is eating-only) · parse-text-cases.json got pretty-printed (diff noise only).
- APP: mock `updatePlan` doesn't assign ids/prune overlay like the real backend (mock-only drift) · `pushPlan` discards the PUT response so edit-added items stay id-less until next sync · BodyMap opacity changes snap instead of the 300ms tween · portions drain has a narrow lost-update race (setPortion between drain read and row delete) · 2 spec-required component tests skipped (muscle-map chip→banner wiring, history row render).

**NEXT: deploy round (needs CEO go — prod-facing):** BE-041 (arm64 image build/push, hand tag+digest to devops) → OPS-024 (⚠ **Terraform reconcile**: TF is 3 releases behind prod — vita:7/be035 via CLI clones, TF holds `909262c` and lacks `PUBLIC_BASE_URL`; OPS-024 re-converges via `terraform apply -var app_image_tag=…`, CLI clones forbidden; V008 migration rides the image, destructive OK per A2) → live probes (GET /plan portions, PUT /plan/portions, parse INFO line in CloudWatch) → **fresh APK** (bake `VITA_API_BASE_URL`, install clean) — carries session-17 APP-074 too.

## Where we were (2026-07-22, session 18 — spec round; superseded by 18b above)

**The meal-plan/workout-plan feature (CEO: central feature, backend-persisted) is fully specified, amended, and ticketed; the build was launched and then intentionally halted (CEO token budget) with partial code REVERTED — the tree is clean, specs are the truth, next session starts the build.**

- **Design approved + specs (commits `b2cf3a2`, `7310a95`, this one):** `docs/meal-plan-handover/` holds DESIGN-SPEC.md (CEO architecture decisions), backend-spec.md + app-spec.md + devops-spec.md (build-ready, CEO amendments BAKED IN — the specs are the only truth), the design handoff (visual source of truth), and **build-workflow.js** (the 4-phase build workflow: Amend→Build→Review→Fix).
- **14 Asana tickets filed:** BE-036..041 (backend) · APP-075..081 (app) · OPS-024 (devops). Extremely detailed (formulas, shapes, files, acceptance criteria, Model: lines). Cross-team verified (2 criticals fixed, 6 minors fixed).
- **CEO decisions ALL collected (baked into specs as A1–A9):** portions overlay separate + **PLAINTEXT (no crypto)** · **no legacy/backfill** (pre-prod; destructive migrations OK, may drop/recreate DB) · workout/program data no crypto this round · handoff nutrition table = EXAMPLE only (everything computed; fixtures compute from test data) · doc edit touches only the edited item's override · numeric field stays · Edit button stays · iOS captures-only OK · muscleRoles opacity rule stands.
- **Amend phase EXECUTED + committed:** contract bumped to **v0.6.0** (`docs/contracts/vita-api-v0.yaml`: PlanItem id/microsPerUnit/portion, GET /plan optional portions, PUT /plan/portions, Exercise.muscleRoles) + **ADR-0017** + both team specs amended (§11 questions all answered). **BE-036 is effectively DONE** (contract+ADR shipped; comment on ticket may be pending).
- **Build phase was ~minutes in when halted:** partial edits to 6 files (app client/mock/types.gen/tokens, backend PlanDtos + new Muscles.kt) **reverted to keep main clean** — gates were never run on them. Progress ledgers kept (`backend/Progress/BE-036…`, `BE-037-041…`, `app/Progress/APP-075-081…`) — they record what the builders had started.
- **NEXT SESSION — resume recipe:** re-launch the build from `docs/meal-plan-handover/build-workflow.js` but **SKIP the Amend phase** (already applied+committed) — trim the script to Build→Review→Fix, or just tell 2 Opus builders (backend BE-037..040, app APP-075..081, parallel, disjoint folders) to execute their amended specs, then Fable leads review, orchestrator verifies gates + commits. Then the **deploy round**: BE-041 (image build/push) + OPS-024 (⚠ Terraform is 3 releases behind live prod — task-def vita:7 via CLI clones, TF still has image `909262c` and no PUBLIC_BASE_URL; a naive apply ROLLS PROD BACK. OPS-024's spec covers the reconcile; deploy goes through Terraform, CLI clones forbidden) + fresh APK.
- Notable spec-round findings: handoff prose "~1,880 kcal" contradicts its own table (1,756.2 — moot now, table is example data); program parse NEVER extracted `muscles` despite contract v0.5.0 (BE-040 closes it).

## Where we are (2026-07-22, session 17 — APP-074 built)

**APP-074 (sent-state address visibility) built + committed (`60d0613`).** Investigation finding: trim-on-submit, the address display, and "Use another address" ALL pre-dated the gmail.coml incident — the actual gap was prominence (12.5px caption inline). Fix: submitted address alone on its own line, body-size + bold (`app/auth.tsx` SentCard, 4-line diff). Gates: tsc 0 · Jest 223/223. Rides the next APK build — the CEO's session-16 APK does NOT have it. Asana ticket commented. **All other session-16b CEO checks still pending** (click email link → BE-035 Done, scan QR → BE-034 Done, HC toggle, icon, metric-only). Standing: SES production access + domain/DKIM before real users.

## Where we are (2026-07-21, session 16 — CEO feedback round: QR email + HC fix + metric-only + integrations cleanup + app icon)

**5 tickets from CEO feedback, 2 parallel Opus 4.8 leads.** Commits `0d296f4` (backend) + `a1f5519` (app), pushed. Gates orchestrator-verified: backend `check` 155 green · app tsc 0 · Jest 223/223 (44 suites) · icon + prod URL verified inside the APK via aapt2 badging.

- **BE-035 (16b) — clickable magic-link, DEPLOYED (task-def vita:7, image `be035`).** CEO couldn't click the link: email clients only auto-link http(s); vita:// anchors are dead text. Fix (implements old OPS-016): public `GET /v1/auth/link?token=…` → 302 to `vita://auth?token=…` + minimal HTML fallback (tappable anchor); token = opaque pass-through (not verified/consumed/logged). Email/QR/plain-text all now carry the https URL (one-line change in MagicLinkService — the mailer embeds `link` verbatim everywhere). New `PUBLIC_BASE_URL` env (defaults to the API-GW URL; SSM move = devops nicety later). Contract additive (`GET /auth/link`), check 157 green, live-verified (302, encoding round-trip, fresh send no-fallback). Gotchas recorded: KDoc containing `/*` (e.g. `/v1/auth/**`) opens a Kotlin nested comment and breaks detekt; docker `credsStore: desktop` hangs non-interactively → scoped `DOCKER_CONFIG` workaround. **Prod incident triage same day:** "backend broken, no email" = CEO's device submitted `…@gmail.coml` (typo) → SES denied (unverified identity outside scoped policy) → fail-safe logged the link as designed; correct-address sends healthy. → APP-074 filed (confirmation state shows the submitted address; trim on submit).
- **BE-034 — QR code in the magic-link email, DEPLOYED (task-def vita:6, image `be034`).** SesMailer → SendRawEmail, multipart/related MIME: text/plain (raw link fallback) + text/html (`<img src="cid:qr">`) + inline 360px PNG. QR via zxing-core + JDK ImageIO (`Qr.kt`); +angus-mail for MIME. Test decodes the embedded QR back to the link. BE-033 fail-safe unchanged. Live: /health 200, magic-link 202, SES path confirmed via logs. **CEO to confirm: scan the QR from a desktop email → opens vita://auth on the phone → BE-034 Done.** Known pre-existing flake noted: PhotoParseFlowTest 413-over-5MB (racy transport RST, unrelated).
- **APP-070 — HC false "not available" on recent Samsung fixed**: detection now handles Health Connect as an Android 14+/One UI SYSTEM MODULE (was only finding the standalone Play Store app); states: available→permissions, sync-off→"Samsung Health → Settings → Health Connect → sync ON" guidance (Galaxy Watch path), absent→install link. Device verification = CEO-only (emulator has no HC provider).
- **APP-071 — metric only**: unit choice removed from onboarding + account, persisted prefs default to metric, dead code/i18n pruned (touched units.ts, pdf export, trends, water/workout detail).
- **APP-072 — integrations platform-gated**: Android shows Health Connect only; Apple Health iOS-only; stubs removed (integrations screen + onboarding).
- **APP-073 — app icon**: new mark in token palette, source SVG in `assets/icon-src/`, wired icon + adaptiveIcon (foreground/monochrome) in app.config.ts; confirmed in APK badging at all densities.
- **Fresh prod APK built** (108 MB, 2026-07-21 16:02, prod URL verified inside). Install clean: `adb uninstall com.llmagal.vita` first.
- **Agent-ops note (recurring):** the app lead's completion-wait pattern ended turns while gradle ran; poller didn't wake it — orchestrator verified the build + gates directly and committed. Same watchdog theme as session 15; keep long builds in background WITH the orchestrator watching the artifact path as backup.
- **CEO next:** install APK clean → check new icon, Integrations (only Health Connect visible), no unit choice, HC toggle now working with Samsung Health sync guidance (Galaxy Watch data lands after Samsung Health→HC sync ON); scan the email QR → BE-034 Done. Standing: SES production access + domain/DKIM before real users.

## Where we are (2026-07-20, session 15 — REAL VOICE (on-device STT) + REAL EMAIL (SES) shipped)

**Two CEO decisions executed in one parallel round (3 Opus 4.8 leads): voice option A (on-device STT, audio never leaves the device) and real magic-link email via SES.** Claude API accepts no audio — interpretation was already Claude via `/parse/text`; STT is sound→text only, on device.

- **APP-069 (app) — real voice STT.** `expo-speech-recognition@56.0.1` (pinned, SDK-56 line) behind the existing recognizer seam in `src/capture/speech.ts`: real engine in standalone builds, stub in Expo Go/jest, honest `unavailableRecognizer` if the module can't load. Partials → existing equalizer; final transcript → capture → `/parse/text`; device locale (pt-BR) via zero-dep `deviceLocale()`; RECORD_AUDIO via config plugin + runtime request; denied/no-speech/error → "type instead". +5 tests (event mapping). Gates: tsc 0 · Jest 221/221 (44 suites) · expo export OK. **Fresh APK built** (113 MB, prod URL verified inside, native module + RECORD_AUDIO confirmed in the APK). Emulators have no recognition service (they correctly hit "type instead") — real transcription is CEO-device-only. Optional knob: pin a fixed STT language instead of device locale (one-liner).
- **OPS-023 (devops, Done-pending-click → identity now VERIFIED) — SES infra.** New `modules/ses` (email identity `lucasmagalhaes2007@gmail.com` — no domain/DKIM yet), task-role `ses:SendEmail/SendRawEmail` scoped to the identity ARN, SSM `/vita/prod/mail-from` (real value, not placeholder), task-def env `MAIL_FROM_ADDRESS` (rev vita:4), service recycled, /health 200. OPS-012 closed as duplicate. SES **sandbox** (200/day, verified recipients only — fine for CEO self-testing).
- **BE-033 (backend) — SES mailer, deployed live.** `SesMailer` behind the existing Mailer seam (established @Profile("aws") adapter pattern; `software.amazon.awssdk:ses` off the existing 2.30.0 BOM). Selection: blank/`REPLACE_ME_IN_CONSOLE`/non-aws → `LogMailer`; real address → `SesMailer`. **Fail-safe: SES throw → warn + LogMailer, /auth never 500s** (CloudWatch recipe stays the escape hatch). +6 tests → `./gradlew check` 154 green. Image `vita-api:be033` (digest `fe41e069…`), task-def **vita:5**, rollout COMPLETED, /health 200. Live probe: magic-link request → 202, **no** LogMailer line + no WARN in logs ⇒ SesMailer selected and send didn't throw. `Dockerfile.runtime` is an uncommitted temp build helper (runtime-only image over host-built bootJar; full in-container gradle build times out here).
- **Agent-ops note:** long Docker builds killed the backend agent twice via the 600s stream watchdog — future long builds should run in background with periodic visible polling.
- **CEO next:** (1) confirm the sign-in email landed in the inbox → BE-033 Done; (2) install the new APK clean (`adb uninstall com.llmagal.vita`) → hold mic, say "comi um pão de queijo e café com leite" → parsed draft with real kcal; (3) later (pre-real-users): SES production access + real domain/DKIM (new devops ticket when called).

## Where we are (2026-07-20, session 14 — CEO device-test round: 11 app bugs + 1 infra bug fixed)

**The CEO tested the prod APK on his phone and filed 11 issues; all root-caused and fixed in one session** (2 parallel Opus 4.8 app team leads in worktrees + 1 devops lead). Tickets APP-058..068 + OPS-022 created; commits `94ac52a` (devops) → `2e40857` (app functional) → `270928c` (app visual). Gates on the merged tree: **tsc 0 · Jest 216/216 (43 suites) · expo export OK**.

- **APP-061 (P0, "kcal sempre 0" + "waiting to sync") — two distinct root causes, both fixed.** (1) Real `/parse/text` returns item-level kcal but NO `totals` (server recomputes on write); every Home surface read `totals.kcal ?? 0`. The in-process mock computed totals inline — which is why mock mode always looked right. Fix: `fillDraftTotals()` at the API boundary (`src/api/client.ts`), one chokepoint for parseText/parsePhoto/offline-interpret; +3 regression tests against the exact prod reply. (2) "waiting to sync" = boot-order bug: `app/_layout.tsx` drained the outbox before `loadSession()` resolved → 401 → silent backoff. Fixed + backoff now named in `adb logcat` (`src/db/outbox.ts`).
- **APP-058 (voice) — real STT never existed**: `src/capture/speech.ts` hardcoded the stub (canned phrase → fabricated meal on device). Now real builds show the honest "voice isn't available — type instead" state. **CEO decision open: build real native STT (new dep + rebuild) or ship the fallback.**
- **APP-060 (PDF import) — was an INFRA defect, fixed live (OPS-022 Done):** presigned S3 PUT got 403 because `vita-ecs-task` lacked `kms:GenerateDataKey/Encrypt/Decrypt` on the storage CMK `075c7c59-…` (SSE-KMS). Terraform policy-only diff (1 change), applied, end-to-end verified vs live prod (PUT 200, object lands; +Decrypt because `S3FileStore.read()` GETs it back for parse). App now surfaces real upload errors.
- **APP-059 (Health Connect)** — wiring correct; failure was silent UX. Toggle now awaits `connectHealthConnect()`, reverts on failure, toasts Samsung Health→HC guidance. Real-data verification remains CEO/Samsung-only.
- **Visual batch APP-062..068 (all 7, 6 emulator-verified):** water card explosion root-caused (`flexShrink` starvation → per-char wrap; prototype DOES have in-card history — kept, layout fixed); Macros blur: Android `blurReductionFactor` default 4 was dividing the blur → set 1 + intensity 40 + prototype scrim (CEO must confirm on device); stack transitions `slide_from_right→fade_from_bottom` (prototype grammar = fade+rise; pager/sheets untouched); shadow sweep (Export CTAs `shadowCta`, CountBanner, CheckinQuestion); dock tooltip raised `bottom 26→52` + overflow visible (device drag check pending); nav pill deeper shadow; Home header reduced to a single Account icon (only non-orphaned destination).
- **Fresh prod APK rebuilt this session** (prod URL baked; same recipe/rules as session 12 — install clean: `adb uninstall com.llmagal.vita` first).
- **CEO next:** install the new APK clean → re-test the 11 items (esp. kcal on a real meal, macros blur, water card, transitions); decide **real STT vs honest fallback (APP-058)**; Health Connect toggle on the Samsung; the older pendências stand (Google Android OAuth client, Apple bundle id, S3 30d expiry, F-LAST).

## Where we are (2026-07-16, session 12 — prototype-fidelity pass EXECUTED + device-verified)

**Fable specced the prototype-details work (from the CEO's fidelity verdict + a frame-by-frame read of the prototype recording), then Opus executed it.** Spec: `docs/reviews/2026-07-15-prototype-details-spec.md`. Commits `5e11c84` (spec) → `cf43985` (code), pushed, tree clean.

- **APP-051 Macros = centered pop-up — DONE + device-verified.** The CEO's thrice-flagged bug: was a bottom sheet (`SheetOverlay`), now a centered card scaling in over a blurred backdrop. Built reusable **`src/ui/PopOverlay.tsx`** (mirrors SheetOverlay: SheetBackdrop + sheetPresence + vtPop timing, no drag); `MacrosSheet` + the eating-plan portion pop-up both use it (plan.tsx's ad-hoc `popIn`/`Modal` deleted). Emulator screenshot confirms it's centered.
- **APP-052 Trends entry-replay — DONE + device-verified (screen-recorded).** Root cause was right: TabsPager pre-mounts Trends → GrowBar animated once offscreen. Fix = **focus epoch** off the settled `usePathname()` (`TrendsReplayContext`, `src/trends/parts.tsx`) that re-keys `TrendCard` → fade + bar-grow replay on every entry. NO pager surgery, no mid-gesture setState. Stagger corrected to `barDelay(i,n)` = 55ms(7d)/16ms(15-30d); paired bars share the day delay; grow 550ms. Recorded the grow firing on swipe-in.
- **APP-053 Check-in deck — dark scrim + deep deck shadow + opaque peek strips (`#F1E8D7`/`#F8F0E1`).** Code done; NOT driven on device (mock demo had "nothing to check in today" — needs a pending check-in to see it). The deck was already centered with advance/pop from session 6; this pass upgraded the scrim/shadow only.
- **APP-054 shadows — DONE + verified** (accent CTA shadow visible on the auth "Accept & continue"). New tokens `shadowCta(color)/shadowSoft/shadowDark/shadowPop/shadowDeck`; Button primary + Toggle knob now cast shadows (were flat).
- **APP-055 toast — DONE.** Promoted to a module store `src/ui/toast.ts` + one `ToastHost` (converged the old capture-only `CaptureToast`); wired habit-removed, vacation start + end. `showToast(...)` callable anywhere.
- **APP-056 press-scale** — Button CTA .98, water quick-add .94. (Light pass; more surfaces optional.)
- **APP-057 (choreography diff-pass) — NOT done** (P2; most already landed sessions 6-8, deferred).
- Gates: **tsc 0 · Jest 211 pass** (+2 new: toast timer, `barDelay`). The 1 "failure" is a **pre-existing midnight date-boundary flake** in `vacation.test.ts` — proven on the pristine tree via stash, unrelated to this work (worth a separate fix: the test uses wall-clock `new Date()` across a day boundary).
- **Fresh prod APK built (2026-07-16 09:12).** `app/services/vita-app/android/app/build/outputs/apk/release/app-release.apk` (113 MB, v0.1.0). `VITA_API_BASE_URL=https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1` baked — **verified** inside the APK (`assets/app.config` → `"apiBaseUrl":"…/v1"`, so `isMockApi=false`, real prod backend, NOT mock). Rebuild cmd: `ANDROID_HOME=~/Library/Android/sdk VITA_API_BASE_URL=<url> ./gradlew :app:assembleRelease` from `android/`. Install clean: `adb uninstall com.llmagal.vita && adb install -r <apk>` (clean uninstall avoids stale seeded mock rows — session-10 footgun).
- **Prod magic-link sign-in** (SES not built → link is in CloudWatch): after tapping "Send link" in the app, `aws logs filter-log-events --log-group-name /ecs/vita --region eu-west-1 --start-time $(($(date +%s000) - 600000)) --filter-pattern '"vita://auth"' --query 'events[-1].message' --output text` → open the returned `vita://auth?token=…` on the phone (standalone APK honors the scheme), or paste the token into the dev field.
- **CEO next:** install the prod APK clean + on-device feel pass (Macros pop, Trends sweep, shadows, toast); trigger a check-in to see the deck's dark scrim. Asana: create APP-051..056 (Done=store). +deps: none.
- **Dev-server note:** during verification the Metro on :8081 was flipped to mock and then **restored** to the LAN backend (`http://192.168.1.209:8080/v1`); an emulator + Expo Go were left running against it.

## Where we are (2026-07-15, session 11 — sheet-bounce fix + Home v2 built + specs)

**Fixed the "childish bounce" and built Home v2 (replaces v1), both emulator-verified.** Commits `01afa71` (specs) → `2afab62` (bounce) → `92266b8` (Home v2), pushed, tree clean. Fresh prod APK built (108 MB, prod URL baked, 20:41).

- **Specs first (CEO-reviewed, then greenlit "manda ver"):** `docs/reviews/2026-07-15-sheet-motion-fix-spec.md` (bounce) + `docs/home-v2/IMPLEMENTATION-SPEC.md` (+ `handoff-extract.md`, `tokens-table.md`, `screens-analysis.md`, and the design `handoff/`). Produced by **Fable** team leads + sub-agents, no simulator, per CEO.
- **APP-050 sheet bounce — FIXED.** Root cause: `useSheetTransition` (`src/ui/useSheetDrag.ts`) animated every sheet ENTRANCE with `withSpring(damping:20,stiffness:210)` = ζ≈0.69, ~33px overshoot. Fix: entrance → `withTiming` via the `motion.unfold` token (450ms, bezier .22/.9/.32/1 = prototype vtSheetUp, zero overshoot); cancelled-drag spring-back → `damping:30` (ζ≈1.01). Drag + 260ms programmatic close untouched. Emulator-verified monotonic rise, no bounce.
- **HOME-V2 — BUILT, replaces v1** (CEO decisions: replace v1 · follow-handoff colors · menu pill already done). New `src/tabs/home/{dock.ts,DockDatePicker,DaySection,Timeline,timelineData}` + `src/lib/haptics.ts` (+dep `expo-haptics ~56.0.3`); `Home.tsx` day-aware; `TimelineCard` retired. Dock magnifier (Gaussian worklet — `"worklet"` fix cured a UI-thread TypeError caught only on device), inline expand-in-place timeline, green workout tile. **R1 (timeline day-swipe vs TabsPager) device-verified both ways** (`blocksExternalGesture` + activeOffsetX/failOffsetY; no mid-gesture setState; session-10 snapTarget intact). No backend/contract change.
- Gates (orchestrator-verified): tsc 0 · Jest **210/210 (41 suites)** · expo export OK. Asana: APP-050 In progress; epic **HOME-V2** + subtasks 1–9 In progress (DoD=store).

**CEO to decide (non-blocking):**
1. **Install the new prod APK clean** (`adb uninstall com.llmagal.vita` first) — test the dock magnifier *feel* + Home v2 on device (emulator can't freeze the magnifier mid-drag; past days show empty on emulator only — its SQLite seed is date-anchored, real logs will populate).
2. **Workout green went app-wide** (Trends chips + workout-detail badge) per the handoff — keep, or restrict to Home only? (WaveIllustration crest left terracotta.) One-touch tweak either way.
3. Bounce entrance duration knob is `motion.unfold.durationMs` (320–450 band) if 450ms ever feels slow.
- Pending from before: Google Android OAuth client (pkg `com.llmagal.vita`, SHA-1 in session-9 block) · Apple Developer → `apple-client-config` · S3 uploads 30d-expiry decision · F-LAST store deploy (gated).

## Where we are (2026-07-15, session 10 — mock-APK bug fixed + big feel-pass batch APP-040..049)

**Caught + fixed a real footgun, then shipped a 10-item CEO feel-pass batch.** Commits `0734b08`→`5c6974a`, pushed, tree clean. Prod-backed APK rebuilt (108 MB, prod URL baked).

- **Mock-APK bug (root-caused):** the session-9 `assembleRelease` was built WITHOUT `VITA_API_BASE_URL` → `apiBaseUrl=""` → `isMockApi=true` → in-process mock API + `seedDemoDataOnce()` demo rows. That was the CEO's "dado estranho". Fix = rebuild with the env var. **All prod APKs MUST bake `VITA_API_BASE_URL`**; the CEO must install clean (`adb uninstall com.llmagal.vita` first) or seeded mock rows persist. Open recommendation: make release fail-loud if the URL is empty (not yet done).
- **App batch APP-040..049 (all 10, emulator-verified where it counts):** PDF import (`expo-document-picker`→`/uploads`→presigned S3 PUT→parse) + voice import mic; **app-wide fluid close** (`useSheetTransition` — save slides out like drag-dismiss); **swipe fix** (`snapTarget` ±1 page/gesture — was `velocity*0.25` jumping to last tab; emulator-verified); chart scrub on UI thread; **BodyMap single-view + "⇄ See back" toggle** (was front+back at once) + tinting fix; workout history → preview(IMG-3)→detail(IMG-4); tap-muscle→exercise highlight (`exercises[].muscles`, types regen to v0.5.0, api:check clean); vacation End confirm (`ConfirmSheet`); macros sheet was already correct (stale build). tsc 0 / Jest 199 (38 suites) / expo export OK. +1 dep `expo-document-picker ~56.0.4`.
- **Backend BE-032:** live-verified `claude-sonnet-4-6` (plan-pdf/photo model) is REAL + correct against the Anthropic API — PDF/photo import won't 4xx on model id. Docs only, no redeploy. Google Web client id is live in prod SSM (task recycled).

**Not driven live (CEO to confirm on real device):** real PDF parse against prod Claude (mock path verified; app is contract-correct); muscle→exercise highlight (emulator's stale SQLite had exercise-less workouts; logic unit-tested, selection UI live-verified). **CEO next:** install the new prod APK clean; Google Android OAuth client (pkg `com.llmagal.vita`, SHA-1 in session-9 block); Apple Developer → `apple-client-config`; S3 uploads 30d-expiry decision.

## Where we are (2026-07-15, session 9 — real Android APK + Health Connect + Google login configured)

**The app now runs as a real sideloadable Android APK (no Expo Go) and reads Samsung/Google health data via Health Connect. Google sign-in is configured server-side in prod.** Commits `85539ce` + `2af6ff1`, pushed, tree clean.

- **APP-007-android (APK, ADR-0005):** CNG `expo prebuild` (`android/` gitignored) + `assembleRelease` (debug-keystore signed). **Emulator-verified standalone**: auth → onboarding → Home → Integrations, `vita://` scheme + real expo-notifications branch working. APK at `app/services/vita-app/android/app/build/outputs/apk/release/app-release.apk` (108 MB); install `adb install -r`. Prod-backed build: `VITA_API_BASE_URL=https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/v1 ./gradlew :app:assembleRelease`.
- **APP-038 Health Connect (ADR-0004):** `react-native-health-connect@3.5.3` behind the stub seam (real in dev build, stub in Expo Go). Reads today's active energy/steps/sessions → **kv snapshot, SQLite-only, never the outbox** (matches backend **ADR-0016**: backend builds NOTHING for health data, device-local by design; flip path documented). Feeds Energy card, estimates labeled. Fixed a native crash in the lib (missing `HealthConnectPermissionDelegate` — `plugins/withHealthConnect.js`).
- **APP-039 / Google Fit verdict:** NOT built — Fit APIs deprecated (no new sign-ups since 2024-05, sunset end-2026); **Health Connect covers Samsung Health + Google data**. Ticket Done.
- **Google login:** CEO's Web client id set in SSM `google-client-config`; ECS task recycled, rollout COMPLETED, `/health` 200 → Google OIDC genuinely configured in prod. **BE-030** sentinel fix (Apple placeholder → clean 503) rides the next image. Backend `./gradlew check` 148 green; app tsc 0 / Jest 179 (36 suites).
- Asana: APP-007-android + APP-038 In progress (DoD=prod/store), APP-039 Done, BE-030/031 created; boards current.

**CEO next actions:** (1) create the **Google Android OAuth client**: package `com.llmagal.vita`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`; (2) install the APK on the Samsung phone, enable Samsung Health → Health Connect sync, toggle Health Connect in Vita (emulator has no health data provider — real-data verification is CEO-only); (3) Apple Developer account → bundle id into SSM `apple-client-config`. Pending previous: S3 uploads 30d expiry decision; F-LAST store deploy (gated).

## Where we are (2026-07-15, session 8 — BACKEND LIVE IN PROD + BE-007 OIDC + feel-pass)

**The backend is LIVE in production and the CEO's feel-pass batch shipped.** Prod: API GW `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/` (`/health` 200), ECS task-def `vita:3` running image `909262c`, RDS Postgres 16.13, hitting **real Claude**. ~$19/mo (RDS free tier) → ~$34/mo after. Commits `881834f`→`746441a`, all pushed, tree clean.

- **Prod deploy (BE-004 + OPS-014/021):** arm64 image built from committed state, pushed to ECR `vita-api`. Devops un-park fixed two never-exercised things: task-def env contract (`SPRING_PROFILES_ACTIVE=aws`, DB_PASSWORD/DEK/HMAC secret mappings) and Cloud Map **A→SRV** (A-records gave the task IP but no port → apigw 500). Magic-link in prod → CloudWatch `/ecs/vita` (SES unbuilt): `aws logs filter-log-events --log-group-name /ecs/vita --region eu-west-1 --start-time $(($(date +%s000) - 600000)) --filter-pattern '"vita://auth"' --query 'events[-1].message' --output text`.
- **BE-007 OIDC (Google/Apple `/auth/oidc`):** built to contract, NimbusJwtDecoder (no new dep), per-provider JWKS cache, iss/aud/exp/nonce, find-or-create on (provider,subject) + email-link, shared `UserAccounts` converges magic-link+OIDC crypto. Fails closed. Deployed (V007 migration applied). Env `GOOGLE_/APPLE_OIDC_AUDIENCE` ← SSM `google-/apple-client-config` wired → CEO's client ids picked up on next task start, **no redeploy**. ADR-0015.
- **BE-029:** contract v0.5.0 `exercises[].muscles` (additive); app per-exercise tinting deferred to next round.
- **App feel-pass (session-8, 9 items):** tab bar hides under sheets, `expo-blur` backdrops, prototype card expand, Home 4-icon header, macros full sheet, camera Add-from-photo sheet, plan-digest habit, larger BackButton. tsc 0 / Jest 172 (35 suites). `expo-blur` added (CEO-approved). Swipe order was already correct in source — if wrong on device it's a stale build.
- **Boards → Done (DoD=in prod):** backend 25 tickets, devops OPS-001/003/005/008/009/011/020 (+prior). Kept open: BE-003 (no CI, CEO), F-LAST (store deploy). **Notion prod doc** written under DevOps page.

**Follow-ups / CEO decisions (none blocking):**
1. **Enable Google/Apple login:** CEO creates Google Cloud OAuth **Web** client id → SSM `google-client-config`; Apple App ID bundle-id → SSM `apple-client-config`. Android/iOS platform client ids + real device login need the **APP-007 dev build** (→ Apple Developer $99/yr, Google Play $25 — start now, verification takes days). Backend returns 401 until set (safe/fail-closed).
2. **OIDC 503-vs-401 (cosmetic):** placeholder SSM value isn't blank, so endpoint returns 401 not the clean "not configured" 503. One-line backend fix (treat sentinel/`REPLACE_ME_IN_CONSOLE` as blank) — fold into the next backend image; not worth a redeploy alone. Safe as-is (forged/real tokens can't carry that aud).
3. **S3 uploads 30-day expiry:** user photos deleted after 30d — intended for "a quiet log"? One-line tfvar to change, needs CEO OK.
4. **App device pass:** confirm blur/pill-slide/card-expand/swipe-order on the latest build.

## Where we are (2026-07-15, session 7 — hygiene sweep BE-028 + APP-037 DONE)

**The CEO un-gated the hygiene sweep this session; both teams executed it in parallel (Opus team leads) while the CEO runs the phone feel-pass.** Commits `41bddce` (app) + `1e301b8` (backend); both gates re-verified by the orchestrator before commit.

- **Backend (BE-028)** — packages reorganized **layer-first** per explicit CEO call: `controller/<feature>`, `service/<feature>`, `repository/<feature>`, `model/<feature>`, `config` (**ADR-0014 supersedes ADR-0012**; no `utils`/`exceptions` — no genuine occupant). 51 files moved, zero logic change. Audit-2 1.7 closed: `CryptoService` AAD now binds `"$userId:$table.column"` via `AadContext` (+1 test) — **breaks pre-existing local dev rows; drop volume/re-seed** (no prod data). Ponytail: shared `model/Nutrition.kt` dedupe, dead `extractToolOutput` deleted. README rewritten w/ 3 Mermaid diagrams. `./gradlew check` **123 green** + detekt/ktlint; LocalStack adapters 6/6. Deliberately NOT done: Jackson 2→3 convergence in `ClaudeClient` (documented debt, not shortest-diff-green). Ledger: `backend/Progress/BE-028-hygiene-sweep-Progress.md`.
- **App (APP-037)** — codebase was already clean; surgical pass only: `CountBanner` extraction (~40 lines of duplicated banner JSX), `vacationExcluder` reuse, 2 dead imports + 1 dead const, stale `v0.3.0` client pin dropped. **No file moves** (RN layout already idiomatic), **gesture/worklet paths untouched**, APP-007 seams kept, no i18n deletion (dynamic keys). New `app/services/vita-app/README.md` w/ 3 Mermaid diagrams (architecture, offline/outbox + poison-pill, navigation). tsc 0 / Jest **168 green (34 suites)** / expo export OK. Ledger: `app/Progress/APP-037-hygiene-sweep-Progress.md`.
- Asana BE-028 + APP-037 → In progress (Done = production, F-LAST-gated); Notion Backend + Mobile pages updated by the leads.

**Next session:** CEO phone feel-pass verdict (session-6 item, still pending) → iterate audit P2 leftovers if short. CEO-gated unchanged: `expo-blur` backdrops · per-exercise muscles (BE contract) · F-LAST deploy. Anyone with a live local DB must re-seed (AAD change).

## Where we are (2026-07-15, session 6 — Fable fidelity backlog + emulator-verified bug fixes)

**The CEO's 3 remaining live-test bugs (#3/#4/#6) are FIXED and emulator-verified, and the full Fable prototype-fidelity backlog is implemented.** Session ran in 4 passes, all committed + working tree clean (`2bb753f..bfc4e48`, 16 commits). tsc 0 / Jest **168 green (34 suites)** at every commit. Ledger with everything: **`app/Progress/APP-CEO-BUGS-Progress.md`** (sessions 6.1–6.4 appended).

1. **Fable fidelity audit** (CEO asked for it): a Fable subagent compared prototype vs app screen-by-screen → **`docs/reviews/2026-07-14-fable-fidelity-audit.md`** (verdict: "structurally faithful, motionally flat"; 20 ranked tasks).
2. **Backlog implemented** (CEO: "vai fazendo tudo"): motion system (`PressScale`, animated `Bar`/`Toggle`/`Chevron`, `Card` shadow, `GrowBar`, `MorphBlob`/`MorphContainer`, `SheetOverlay` + worklet `useSheetDrag`), Home hero 82px + filling water vessel, check-in deck, donut sweep, voice equalizer, portion pop-up + floating totals, onboarding/auth/account/habits staggers + pops, muscle-sessions sheet on Trends heatmap (B4), workout muscle chip pop (B8), calorie-curve draw-on + scrub guide line.
3. **Emulator drive (CEO-authorized this session)** found + fixed 3 real device bugs:
   - **Tab swipe "sometimes dead" (pre-existing root cause):** lazy-mounting a neighbor tab from the pan's `onBegin` setState re-rendered the pager MID-GESTURE → gesture reset → swipe snapped back. Neighbors now pre-mount from a deferred effect. Verified Home↔Trends↔Habits.
   - **Mount animations dropped on busy boots:** new `src/ui/useStartOnLayout.ts` (mount tweens start at first `onLayout`); vessel animates px not %; `WaveIllustration` memo'd; SVG draw-ons pin final state post-tween. Verified on cold boot.
   - **#4 PDF export (2 rounds):** print-cache path is unreadable by the share FileProvider AND the File API → final fix `printToFileAsync({base64:true})` → `File.write` into document dir → share. **Verified: Android share sheet opens "vita-log.pdf".**
   - Also verified on screen: #6 tap-to-open scrub w/ readout + guide line (closed card = tab swipe, open card = scrub), #3 drag-dismiss on capture/vacation/export, MorphBlob parsing, pops, vessel fill, muscle sheet.

**Next session:**
- **CEO phone pass** — only subjective feel remains (all functional bugs device-verified). If motion still feels short of the prototype, iterate from the audit's P2 leftovers.
- **Two CEO-gated items from the audit:** B12 blurred pop-up backdrops (needs `expo-blur`, new dep) · per-exercise muscle row-tinting (needs `exercises[].muscles` in the parse — backend contract change → BE ticket).
- Housekeeping not done this session: Asana/Notion not updated (repo is current); fold into next session close.
- Emulator + Metro (:8082) were torn down at session close.

## Where we are (2026-07-14, session 5 — CEO live-test bug-fix pass)

**The CEO test-drove the app on a physical Android phone (Expo Go SDK 56, real backend) and filed 11 bugs.** 8 are fixed + committed + pushed (commits `163e8c4..8f04847`); the **navigation swipe crash (the CEO's #1 priority)** was **device-verified on the emulator**. Full per-bug ledger with root causes + the remaining recipes: **`app/Progress/APP-CEO-BUGS-Progress.md`** (READ THIS FIRST for the bug work).

- **Fixed:** #1/#11 swipe-nav worklet crash + pill/route desync (real cause: `idxRef` read inside the gesture worklet in `TabsPager`) · #9 keyboard-covers-input (app-wide `src/ui/keyboard.tsx`) · #5 habit-add crash (guard `expo-notifications` behind Expo Go detection — no-op stub; real notifs need dev build APP-007) · #2 vacation button (TZ-safe `isValidDate`) · #7 home-breaks-on-water (row `alignItems:flex-start`, water Card sizes to content) · #1-muscles tappable (BodyMap `onMusclePress`) · #8 macros-card tap expands kcal breakdown · #2b vacation square shadow (`overflow:hidden`) · #10 totals — confirmed already OK on device.
- **Remaining (need on-device verification — CEO tests on their phone; do NOT boot the emulator):** **#6** Trends scrub (needs pager gesture ref via React Context — risks regressing the just-fixed nav, verify carefully) · **#3** sheet drag-to-dismiss fluidity (worklet-ize `shouldDismiss`, decide inline; recipe in ledger) · **#4** export PDF (silent `catch{}` in `ExportSheet` hides the real failure — surface it on a device run first). Recipes + risk for each are in the ledger.
- **Local dev launcher:** `vita up | up mock | down | login | status | logs` (in `/opt/homebrew/bin`, source `scripts/vita`). Real-backend sign-in in Expo Go: `vita login` reprints the magic-link token as an `exp://` URL (the `vita://` scheme only works in a dev build). A `__DEV__`-only "paste token" field on the auth screen also works.

**The "Vita 100% local" feature backlog itself remains COMPLETE** (below). This session was live-QA fixes on top of it.

## Where we are (2026-07-14, session 4 closed — "Vita 100% local" backlog COMPLETE)

**Phase 2 — Implementation. The entire "Vita 100% local" backlog is built and green LOCALLY.** Contract at **v0.4.0** (additive over v0.3.0). All feature slices 1–8 shipped in one parallel-agent execution day (commits `0ae4310..5a35dfa`). AWS infra still applied but **parked at $0** (ECS off). **No production deploy** — CEO policy: local-first. Working tree clean, pushed to GitHub.

### DONE this session (all local, DoD = `check`/`tsc`/`jest`/`expo export` green)
- **Backend — `./gradlew check` 122 green + 6 LocalStack adapter tests.** BE-017 entries `from`/`to`/CSV `type`; BE-023 pinned model ids (+`photo-model`; `plan-pdf-model=claude-sonnet-4-6` verified valid, sonnet-5 deferred — needs `thinking:disabled`); BE-018 `/parse/photo` vision (multipart, image discarded, 413/415/422); BE-019/020 plan+program versioned (history≤5), editable (full-doc PUT + re-encrypt), per-user-DEK encrypted, cascade-shred; BE-024 `checkin` entry type (idempotency `habitId:date`, PATCH change-answer); BE-025 `/me/vacations` encrypted opaque ranges; BE-022 `@Scheduled` token cleanup (closes audit 2.3); BE-026/027 real S3/KMS adapters behind `@Profile("aws")`, LocalStack-tested (default check stays AWS-free). ADR-0011 ext, ADR-0013.
- **DevOps** — OPS-020 LocalStack (S3+KMS) profile-gated in backend compose; plain `docker compose up` stays Postgres-only.
- **App — Jest 158 green, 32 suites, Expo Go SDK 56.** Slices: water (APP-017) · workout + reusable BodyMap (APP-018/019) · plan/program persist + edit-mode screens (APP-021/022/023) · photo capture (APP-020) · habits + check-ins-via-outbox + local notifications (APP-024/025/026) · Trends Food/Activity client-side agg (APP-027/028) · Account/Integrations/Vacation/Export-PDF-on-device/Energy (APP-029/030/031/032) · offline interpretation + NetInfo reconnect + Maestro E2E + fidelity pass (APP-033/034/035).
- **Two Fable audits** — `docs/reviews/2026-07-14-fable-audit.md` (pre-session) and `docs/reviews/2026-07-14-fable-audit-2.md` (full session). **Both audits' fixes landed and re-verified:** app day-filter UTC, outbox poison-pill + taxonomy (dead-photo-URI, 404/403, checkin-409 PATCH-fallback), Home philosophy slips (no 2500-kcal target, no fabricated 7-day chart incl. the spent series), offline plan/vacation dirty-flag (edits survive hydrate), backend muscle mapping + numeric validation. Crypto envelope on every new encrypted surface verified per-user-DEK + cascade/shred.
- **CEO live-testing bugfix** (`1c6fe2c`): Home layout blowout (`height:"100%"`→`flex:1`) + confirm-sheet drag-to-dismiss (pan gesture, `runOnJS`). Verified live on Android emulator. (The blue floating gear the CEO saw is a device/OS overlay, NOT app UI.)
- **Offline-capture review banner** (`5a35dfa`, CEO Round 12): offline captures still auto-add on reconnect but are marked `needsReview` with an "N offline captures added — tap to review" banner + review sheet (Keep/Adjust/Discard); the `failed` timeline card got a Dismiss. Restores confirm-before-log affordance without losing durability.

### What's PARKED (CEO-gated — do NOT start autonomously)
1. **Hygiene sweep** — BE-028 + APP-037 (pre-release code cleanup). CEO calls this stage.
2. **F-LAST production deploy** — AWS deploy → Android vs AWS → iOS on iPhone vs AWS → Play Store → App Store. Needs CEO secrets (RDS pw, 7 SSM values, GitHub repo Variables) + Apple/Play accounts. Runbook in `docs/backlog-local-100.md` §F-LAST.

### Small follow-ups noted (non-blocking, not started)
- **Authoritative discard**: the offline-review Discard and the `failed`-card Dismiss are **local-only** (SQLite is the display source; trends are client-side per D4). A capture that synced before the user discards it leaves an orphan server row. A backend delete/void op would make Discard authoritative — build only if ever needed.
- **Audit-2 1.7 (backend, hygiene-sweep debt)**: `CryptoService` AAD binds userId only, not table/column — defense-in-depth; fold `"$userId:$table"` into BE-028.
- **Plan/program history UI**: backend serves `/plan/history` (≤5) but the app has no "previous plans" picker yet (APP-022 explicitly deferred it) — small follow-up ticket.

**Rules unchanged**: no GitHub CI/CD (local pre-merge checklists are the guardrail), no AWS applies (LocalStack for adapters), Terraform kept ready.

## Snapshot by team

### Backend — local, `./gradlew check` = 84 tests green
All In progress on Asana (Done = production, gated on BE-004 deploy). Packages all follow **controller→service→repository** (BE-016 refactor done, ADR-0012 supersedes ADR-0001).
- BE-005 crypto (AES-256-GCM per-user DEK, blind index, crypto-shred; KMS behind `KeyWrapper` seam)
- BE-006 magic link · BE-008 sessions (JWT + refresh rotation, family revoke)
- BE-009 profile `/me` · BE-010 account deletion (7d grace + Postgres job queue + crypto-shred job)
- BE-011 entries (idempotent write) · BE-012 timeline (keyset pagination, tz day filter)
- BE-013 parse/text (Claude, tool-forced, nothing persisted) · BE-014 AI guardrails (per-user quota 429, token/cost Micrometer metrics, eval fixtures)
- BE-015 plan/program parse + `POST /uploads` presigned (S3 behind `FileStore` seam)
- Local seams (LocalKeyWrapper, LocalFileStore, LogMailer) swap for real AWS at deploy.
- **Done (deploy) gated on BE-004**; real Claude for text confirmed working (`claude-haiku-4-5`).

### App — local, Jest 51 green, Expo SDK 56 (store-Expo-Go compatible)
FEATURE-COMPLETE except APP-007. All tickets done: onboarding (APP-009/010), Home (APP-013), capture text+voice (APP-011/012), meal detail (APP-014), auth+magic link (APP-008), SQLite+outbox (APP-005), generated API client (APP-006), design system (APP-003), i18n (APP-004), SDK pin (APP-016).
- Native OIDC (Google/Apple) and voice STT are **stubbed behind interfaces** — need a dev build (APP-007) to become real.
- **Run walkable (mocks):** `cd app/services/vita-app && npm install && npx expo start`.
- **Run against local backend (real E2E):** start backend (below), then `VITA_API_BASE_URL=http://<Mac-LAN-IP>:8080/v1 npx expo start` (base URL MUST include `/v1`; iOS sim = localhost, Android emu = 10.0.2.2). Unset the var → mock mode (test default).

### DevOps — AWS eu-west-1, all applied, parked at ~$6/mo idle
- Applied & running: VPC/subnets/SGs, 2 KMS CMKs, CloudTrail, GuardDuty, audit bucket, ECR `vita-api`, RDS `vita` (encrypted/private/force_ssl, 45d backups via AWS Backup vault), 7 SSM SecureStrings (placeholders), S3 uploads/exports, OIDC CI roles + PR/main/apply workflows.
- **API Gateway live**: `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/` (503, no backend).
- **ECS parked at `module.ecs.desired_count = 0` = Fargate $0.** RDS free-tier $0, left running.
- Done: OPS-002/003/005/006/007/008/011. In progress (applied, deferred verify): OPS-013/014. Backlog: OPS-012 (SES), OPS-015 (observability/AMP), OPS-016 (magic-link redirect), OPS-017 (quarterly RDS restore rehearsal).

## Proven this session (integration milestone)
The real app client drove the real local backend: magic-link sign-in → parse/text (1 real Haiku call) → confirm → `POST /entries` (idempotency 201/200-replay) → `GET /entries` timeline with server-computed totals, persisted in real Postgres → `GET/PATCH /me`. **Zero contract drift** — generated types (v0.3.0) matched real responses exactly. Recipe in `app/Progress/APP-INTEGRATION-local-e2e-Progress.md`; dev harness `npm run integration:smoke`.

## ⚠️ Follow-up to verify (non-blocking)
- **Claude PDF model id**: `application.yaml` `vita.ai.plan-pdf-model = claude-sonnet-4-6` looks wrong (current Sonnet is `claude-sonnet-5`). Verify via the claude-api reference before the first live PDF parse. The text model `claude-haiku-4-5` is confirmed working.

## Next actions — WAITING ON CEO DIRECTION (nothing autonomous left)
1. **Call a deploy milestone** → resume the chain: flip `module.ecs.desired_count`→1, backend builds+pushes the arm64 image (Dockerfile ready) to ECR (BE-004), Flyway migrate, verify `/health` through the API GW. **Requires the CEO's manual secrets first** — all listed in `devops/Next_session.md`:
   - RDS master password (console) + paste into `/vita/prod/db-credentials`
   - 7 SSM SecureString values (currently `REPLACE_ME_IN_CONSOLE`)
   - 3 GitHub repo Variables: `AWS_PLAN_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-plan`, `AWS_APPLY_ROLE_ARN=arn:aws:iam::201261380352:role/vita-ci-apply`, `AWS_REGION=eu-west-1`
2. **Create Apple Developer + Play Console accounts** → unblocks APP-007 (first real device build) and BE-007 (Google/Apple OIDC); turns stubbed native OIDC/voice real.
3. **BE-007** (OIDC sign-in) — blocked on #2. Only major backend ticket not yet built.
4. Verify the PDF model id (above) whenever the plan-import goes live.

## Operating rules quick-recall
- Orchestrator commits; **subagents never run git** (index races). Commit per team: `backend|app|devops|docs: <summary>`. Push uses `gh` HTTPS token (SSH key not in this env): `git push https://github.com/llmagalhaes/vita.git HEAD:main`.
- **Per-task model (Round 7)**: every Asana ticket carries `Model:` (Sonnet simple / Opus 4.8 complex / Fable heavy-orchestration). Team-lead agents pinned `model: opus` in `.claude/agents/`.
- Same-team parallel agents → use `isolation: worktree` (disjoint packages), then merge with a real `./gradlew check` before commit. Cross-team agents → disjoint folders, commit separately.
- Every architecture decision → ADR. Product doubts → CEO, never invented. Chat with CEO in PT-BR; repo in English.
- Anthropic key lives in `backend/services/vita-api/secrets.yaml` (gitignored). Never commit real secrets.

## Key artifacts
| What | Where |
|---|---|
| Decision log (newest first) | `docs/ceo-decisions.md` |
| Roadmap M0–M8 | `docs/roadmap.md` |
| API contract v0.3.0 | `docs/contracts/vita-api-v0.yaml` |
| Apply runbook / infra ids | `devops/Doc/apply-runbook.md`, `devops/Doc/bootstrap-ids.md` |
| CEO setup guide (accounts/secrets) | `docs/ceo-setup-guide.md` |
| ADRs | `backend/Doc/ADRs/` (0001–0012), `devops/Doc/ADRs/`, `app/Doc/ADRs/` (0001–0003) |
| Local-backend leftover | bootRun + docker-compose Postgres were left up during integration; stop with `docker compose down` in `backend/services/vita-api` + kill the bootRun. (Orchestrator tears these down at session close.) |
