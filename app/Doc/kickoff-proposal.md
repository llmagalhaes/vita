# App Team — Kickoff Proposal (Phase 0)

> From zero to production for the complete Vita prototype scope (26 labeled screens/sheets in `docs/prototype/vita-prototype.dc.html`). Author: App Team Lead.

## 1. Stack recommendation

**Recommendation: React Native with Expo (SDK 53+), New Architecture, with react-native-reanimated + react-native-skia + react-native-gesture-handler as the animation/graphics core.**

The CEO's criteria, in order:

### Criterion 1 — UI fluidity

| | React Native / Expo | Flutter | Kotlin Multiplatform + Compose |
|---|---|---|---|
| Rendering | Native views + Fabric; Reanimated/Skia run on the UI thread, so gestures and animations never block on JS | Own raster pipeline (Impeller); consistently 60/120fps, arguably the best raw fluidity | Compose Multiplatform on iOS still renders through a Skia canvas layer; iOS fluidity/polish is the least mature of the three |
| Verdict | Excellent (with the UI-thread libs, which we mandate) | Excellent | Good on Android, still catching up on iOS |

Honest note: on raw, out-of-the-box frame consistency Flutter wins. With Reanimated worklets + Skia, RN matches it in practice for this app's workloads, and keeps truly native scroll physics, text input and accessibility — which Flutter emulates.

### Criterion 2 — Animation fidelity to the prototype

The prototype is an HTML/CSS/SVG artifact: 97 inline SVGs (organic blobs, waves, body maps), 17 keyframe families, `cubic-bezier(.2,.8,.3,1)` spring-ish easings, sheet up/out transitions, and heavy pointer-drag interactions (scrubbable charts, portion sliders, check-in card stack, hold-to-talk).

- **RN/Expo**: react-native-skia renders SVG-path-based art directly (the prototype's SVG paths port nearly 1:1), Reanimated gives real springs and gesture-driven scrubbing on the UI thread, and the ecosystem has first-class bottom-sheet, blur, and haptics primitives. The mental model (declarative components + CSS-like styling) is the closest of the three to the prototype source, which matters when AI is transcribing 26 screens of HTML/CSS into app code — lowest translation loss.
- **Flutter**: fully capable (CustomPainter, implicit/explicit animations), but SVG support is via conversion (vector_graphics) and the prototype's CSS idioms translate less directly. Cupertino sheets/transitions are imitations of iOS, not iOS.
- **KMP/Compose**: Compose animation APIs are good, but the multiplatform SVG/canvas tooling and sheet/gesture ecosystem on iOS is the thinnest; we would hand-build the most.

### Criterion 3 — Future-proofing

- **RN/Expo**: backed by Meta + Expo; OTA updates (EAS Update) let us ship fixes without store review; the largest third-party ecosystem for the capabilities we need next (voice, health, notifications, widgets/Live Activities via config plugins); trivially extensible with native modules when a v2 feature demands it. AI models also have the deepest training corpus for React/RN, which compounds the "all code is AI-written" premise: faster, more reliable generation.
- **Flutter**: healthy, but Dart-only ecosystem is smaller for health/voice/notification edge cases; no OTA equivalent blessed by stores.
- **KMP/Compose**: strategically attractive next to a Kotlin backend (shared models), but that benefit is small here — contracts live in OpenAPI (`docs/contracts/`) and codegen gives both sides types anyway. iOS story is the biggest long-term risk.

### Decision

**React Native + Expo.** It is at worst a close second on each criterion and first on the two that dominate for Vita: fidelity to a CSS/SVG prototype and future-proofing (ecosystem + OTA + AI-generation reliability). Flutter would be the pick if criterion 1 alone decided; KMP is not competitive on iOS maturity for a prototype this animation-heavy. This will be recorded as **ADR-001** in Phase 1.

Core libraries (all mainstream, Expo-compatible): Expo Router (navigation), Reanimated 3 (animations/gestures on UI thread), Gesture Handler, react-native-skia (organic SVG art, charts, body map), @gorhom/bottom-sheet (sheets), Expo AV/Speech + native speech APIs (voice), Expo Camera, Expo Notifications, react-native-health / Health Connect libraries.

## 2. App architecture

- **Language/tooling**: TypeScript strict; Expo prebuild (we own `ios/`/`android/` via config plugins only); pnpm workspace inside `app/services/`.
- **State management**: TanStack Query for all server state (fetching, caching, retries) + Zustand for the small amount of client-only state (capture bar state, theme, sheet coordination). No Redux — the app is server-state-dominated.
- **Offline-first (the log must survive bad connectivity)**:
  - Local SQLite (expo-sqlite) is the source of truth for the log. Every confirmed entry writes locally first, always succeeds instantly.
  - An **outbox queue**: mutations append to a persisted queue, a sync worker drains it when connectivity returns (exponential backoff, idempotency keys so the backend can dedupe — this is a contract requirement, see Dependencies).
  - Reads render from SQLite; TanStack Query hydrates/refreshes from the API and reconciles by server id + updatedAt (last-write-wins is sufficient: single user, single device is the v1 reality; conflict UX deferred).
  - AI parsing (voice/photo → estimate) requires the network by nature; offline capture stores the raw phrase/photo in the outbox as a "pending interpretation" entry, visible in the timeline as unparsed, parsed when back online.
- **Navigation**: Expo Router (typed file-based routes). Stack: auth → onboarding → tabs-less main shell (the prototype has no tab bar; the capture pill hosts Today/Trends/Habits shortcuts). Sheets/popups (muscle exercises, workout preview, portion adjust, macros, export, vacation setup, check-in stack) are modal routes or bottom-sheet components, not screens.
- **Design system layer**: a `@vita/ui` package inside the workspace — tokens file generated from the brief (bg `#EDE5D6`, surface `#F7F2E9`, card `#FFFDF7`, ink `#4A4238`, muted `#8A7E70`, greens, sun, macro colors), Nunito 200–800 via expo-font, radius/spacing/motion scales (the two prototype cubic-beziers become named spring configs), and the primitive components (Card, Chip, Bar, Donut, WaveIllustration, EstimateTag, CaptureBar).
- **Theming**: accent is a token resolved through React context: default `#C4704E`, user options `#8CA58A` `#C98A3F` `#D6926B`, and **vacation mode swaps the whole accent to `#3E8FA3`** plus a "calm" motion scale (longer, softer springs) — one provider, every component reads tokens, no per-screen theming code. Light-only (the prototype defines no dark palette — question for the CEO).

## 3. Platform capabilities plan

- **Voice capture/transcription**: on-device live transcription for the "live transcript" UX (iOS SFSpeechRecognizer / Android SpeechRecognizer via a maintained RN wrapper, e.g. @react-native-voice or expo-speech-recognition); the final phrase text goes to the backend parse endpoint. Raw audio upload only as a fallback if device transcription quality proves insufficient (backend would need a transcription endpoint — flagged in Dependencies as optional).
- **Camera**: expo-camera + image picker; photo compressed client-side, uploaded to the backend recognition endpoint; steppers/confirm UI is pure app.
- **Push + actionable lock-screen notifications**: Expo Notifications with **notification categories/actions** — check-in notifications carry Yes/No actions answerable from the lock screen without opening the app (iOS UNNotificationAction, Android action buttons); the response posts through the outbox so it works on flaky connections. Plan digest (12:30) and habit check-ins are locally scheduled where possible (habit schedule is known client-side), with server push as the wake-up fallback. Requires APNs/FCM setup (DevOps dependency).
- **Apple Health / Health Connect (v1's only integrations)**: device-side read of energy-burned/workouts (react-native-health on iOS, Health Connect JetPack via RN wrapper on Android), user-toggled per source per the Integrations screen. The app reads locally for the Energy card and syncs a **daily summarized subset** (spent kcal per day, workout sessions metadata) up to the backend so Trends works cross-device and server-side; exact payload to be agreed in `docs/contracts/` with backend.

## 4. QA automation strategy

- **Component/unit**: Jest + React Native Testing Library for every screen and design-system primitive; pure logic (outbox, sync reconciliation, estimate formatting, habit scheduling) as plain unit tests. These run per-ticket; nothing reaches Done without them (per DoD).
- **E2E**: **Maestro** — YAML flows, resilient to animation timing, runs on EAS/CI simulators, and is the least flaky option for a gesture-heavy app. Smoke suite (sign-in → onboarding → capture → confirm → timeline) runs on every merge; full regression suite per wave. Detox rejected: higher maintenance for AI-authored flows.
- **Visual fidelity**: screenshot tests on design-system primitives and key screens (Maestro screenshots + review); fidelity to the prototype is an explicit acceptance criterion on UI tickets.
- **Contract tests**: generated TypeScript client from OpenAPI in `docs/contracts/`; MSW mocks derived from the same spec so component tests never invent API shapes.

## 5. Delivery waves (zero → App Store / Play Store, complete prototype scope)

Each wave ends integrated against real backend endpoints in staging. Epics only; tickets come in Phase 1.

- **Wave 0 — Foundations**: Expo app skeleton + CI (EAS builds via DevOps); design-system package (tokens, Nunito, primitives, motion); navigation shell; offline storage + outbox; OpenAPI client generation; QA harness (Jest/RNTL, Maestro smoke).
- **Wave 1 — Identity & onboarding**: passwordless sign-in (Google/Apple + magic link, consent step); 6-step onboarding (units, keep-track choices, eating-plan import/describe, training-program import/describe, connect apps, all-set) with voice answers on every step.
- **Wave 2 — Capture & the log (the core)**: capture bar (both chrome variants; hold-to-talk), voice → live transcript → parse → confirmation card → confirm/adjust; text capture; photo capture (plate + whiteboard flows); Home/Today (water, macros, energy, plan row, cycle chip, check-ins banner, timeline); meal detail; offline pending-interpretation flow.
- **Wave 3 — Plans, habits & notifications**: eating plan screen (portion sliders, live totals, macros popup); habits Today/Manage (+ new habit form, plan-linked check-ins); check-in card stack; push + actionable lock-screen check-ins; plan digest.
- **Wave 4 — Movement & trends**: workout detail (interactive front/back body map, exercises, 30-day history, preview sheet, muscle exercises sheet); Trends (Food + Activity tabs, all charts scrubbable, W/F/M periods, muscle heatmap); Apple Health / Health Connect read + sync-up.
- **Wave 5 — Account, modes & export**: account screen (profile, setup, notification toggles); integrations screen; vacation mode (setup sheet, sea-tone theme, notification pausing, trip habits, hide-from-trends); export sheet + per-audience PDF flow (backend renders the PDF).
- **Wave 6 — Production hardening & store release**: performance passes (frame profiling on low-end Android), accessibility pass (dual-input audit, VoiceOver/TalkBack), full Maestro regression, store assets/privacy manifests/data-safety forms, beta (TestFlight/Play internal) → production rollout.

## 6. Dependencies on other teams

**Backend (all via OpenAPI specs in `docs/contracts/` before we implement):**
1. Auth: Google/Apple sign-in exchange + email magic link, token refresh.
2. Capture parsing: phrase → structured meal/water/workout with estimates; photo → items (plate) / routine (whiteboard). (Optional: audio → transcript fallback endpoint.)
3. Log CRUD with **idempotency keys** and `updatedAt` on every entity — required by the offline outbox.
4. Eating plan / training program import (PDF/text → structured plan + summary) and plan read/update (portions).
5. Habits + check-ins (schedules, responses, plan-linked auto-log of "Yes").
6. Trends aggregates (or agreement that the app computes from synced raw log — needs a decision together).
7. Health-data sync-up endpoint (daily energy/workout summaries from device health platforms).
8. Push: device token registration + check-in/digest push payload schema (actionable categories).
9. Export: request → PDF generation with per-audience content options.
10. User settings: units, accent, notification prefs, vacation state (server-persisted so a reinstall restores them).

**DevOps:**
1. EAS (Expo Application Services) account/billing or self-hosted equivalent for iOS/Android builds in CI.
2. Apple Developer Program + Google Play Console accounts, certificates/provisioning, App Store Connect API keys.
3. APNs key + FCM project for push.
4. CI pipeline for app checks (lint, tests, Maestro on emulator) and staging/production build lanes; secrets management for the above.

## 7. Questions for the CEO

1. **EAS budget**: OK to use Expo Application Services (paid) for builds/OTA updates, or must builds be self-hosted on our AWS CI?
2. **Dark mode**: the prototype defines only the cream/light palette. Confirm v1 is light-only.
3. **Tablets**: phone-only for v1? The prototype is phone-shaped; supporting tablets adds layout work.
4. **Minimum OS versions**: proposal — iOS 16+, Android 10+ (Health Connect effectively needs modern Android). Confirm.
5. **Localization**: English-only for v1? (All copy is English in the prototype.)
6. **Cycle chip**: Flo is v2, yet Home shows a cycle chip "via integration". Should v1 read cycle data from Apple Health/Health Connect where available, or hide the chip until v2?
7. **Capture bar chrome**: the prototype has v1 (bar) and v2 (pill with hold-to-talk + shortcuts). Ship v2 only, or both behind a setting?
8. **Voice privacy**: on-device transcription means audio never leaves the phone (only text does). Confirm this is the desired privacy posture vs. server-side transcription (potentially better quality).
9. **Trends computation**: app-side from the synced log vs. backend aggregates endpoint — any product preference (affects offline Trends availability)?
