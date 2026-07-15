# CEO app batch (session 10, 2026-07-15) — APP-040…049

CEO filed a 10-item batch after device testing. Tickets APP-040…049 on the Vita
frontend board (all created In progress; DoD = store, so they stay In progress).
Contract types regenerated to v0.5.0 (`exercises[].muscles`) — `api:check` CLEAN,
the standing drift is cleared.

Gates after integration (orchestrator-reconciled): **tsc 0 · Jest 199/199 (38 suites)
· expo export OK**. New dep: **expo-document-picker ~56.0.4** (SDK-56, the one
justified add, for PDF import).

## Per-item

| # | Ticket | Real-fix vs stale | How verified | Files |
|---|---|---|---|---|
| 1 | APP-040 PDF import | REAL feature | unit test `planImport.test.ts` + code (onboarding-gated, not driven live to avoid re-onboarding on a fragile emulator) | `src/api/client.ts` (requestUpload + putPresignedFile), `src/api/mock.ts`, `src/onboarding/planImport.ts`, `src/onboarding/PlanStep.tsx`, `app/onboarding.tsx`, package.json (expo-document-picker) |
| 2 | APP-041 voice import | REAL feature | test + code (mic on PlanStep describe via getRecognizer) | `src/onboarding/PlanStep.tsx` (onMic/🎙) |
| 3 | APP-042 fluid close | REAL fix | **EMULATOR** — caught the macros sheet mid-slide: only its top handle at the screen edge, backdrop already faded, Home bright. Not a snap. | `src/ui/SheetOverlay.tsx`, `src/ui/useSheetDrag.ts` (`useSheetTransition`), `src/capture/sheet.ts` (`backdropOpacityAt`), `src/ui/SheetBackdrop.tsx`; migrated Capture/Checkin/Review sheets |
| 4 | APP-043 swipe→last | REAL fix (recurring) | **EMULATOR** — fast flick from Today lands on Trends (one tab), never jumps to Habits (last). One swipe = one adjacent tab. | `src/nav/TabsPager.tsx` (`snapTarget`, ±1 page from start), `tabs.test.ts` |
| 5 | APP-044 scrub polish | REAL polish | **EMULATOR** — guide line follows the finger, readout tracks day (Jul 11 → Jul 14 as finger moved), bars dim. | `src/trends/scrub.tsx` (UI-thread shared-value guide) |
| 6 | APP-045 macros sheet | ALREADY DONE (stale build) | **EMULATOR** — tapping macros card opens "Macros today" sheet (IMG-1: title, "from 1 meal", bars, FROM YOUR MEALS, estimates footer). No code change. | — |
| 7 | APP-046 vacation End confirm | REAL feature | unit test (`account.test.tsx`: tapping End shows confirm, doesn't end immediately) — not driven live (vacation inactive) | `src/ui/ConfirmSheet.tsx` (new), `app/(main)/account.tsx`, `src/tabs/Home.tsx` |
| 8 | APP-047 BodyMap single view | REAL fix | **EMULATOR** — Activity tab shows ONE figure + "⇄ See back/front" toggle + FRONT/BACK VIEW label (not two at once); quads/calves front, glutes/hamstrings/calves back tint correctly. | `src/ui/BodyMap.tsx`, `src/trends/ActivityTab.tsx` |
| 9 | APP-048 preview→detail | REAL feature | **EMULATOR** — session tap opens preview (IMG-3: "15 JUL" badge, "45 min · ~315 kcal · via TEXT", chips, "Preview · drag down to close") → detail (IMG-4: "MUSCLES LIKELY WORKED", See back, footer). | `src/workout/PreviewSheet.tsx`, `src/db/seed.ts` |
| 10 | APP-049 muscle→exercise | REAL feature | **EMULATOR** selection mechanism (chip AND avatar region select → panel + header + chip highlight); exercise-highlight/role sub-panel by unit test `muscleExercises.test.ts` (surfaced DB workout lacked per-exercise muscles) | `app/(main)/workout/[id].tsx`, `src/workout/muscleExercises.ts` (new) |

## Notes / caveats
- **Emulator degradation I induced**: a `wm size` resolution experiment (to try to
  catch the 260ms close animation) black-screened Expo Go and caused repeated ANRs.
  Recovered with a clean force-stop + relaunch. The app itself ran smoothly before and
  after; the ANRs were purely the resolution thrash + double-Metro host load (freed the
  idle 8081 Metro). Not an app regression.
- **Benign warnings** (both pre-existing, non-fatal): Reanimated *"Property 'transform'
  … may be overwritten by a layout animation"* (advisory), and expo-blur *"dimezisBlurView
  … blurTarget not configured → fallback none"* (Android blur falls back to the cream scrim).
- **Item 10 exercise-highlight** couldn't be shown live: the emulator's persisted SQLite
  carried older exercise-less "leg day 45 min" captures, so the surfaced workout had no
  `exercises[].muscles`. The mapping + fallback are unit-tested; the panel/selection are
  live-verified.
- **Items 1/2 live**: onboarding-gated; not driven on device to avoid another sign-out →
  ANR cascade on the already-fragile emulator. Code + `planImport.test.ts` cover them.

## For the CEO / other teams
- PROD PDF parse (`plan-pdf-model`) end-to-end against real Claude not exercised here
  (the mock path is verified). Backend is verifying the model id in parallel — if the
  prod parse 4xx/5xxs on the model, that surfaces on first real import.
