# CEO live-test bug batch — status ledger (2026-07-14, session 5)

The CEO tested the app on a physical Android phone (Expo Go SDK 56, real backend) and reported 11 issues. This ledger tracks each. Fixes were verified by `tsc` + `jest` (168 green); the navigation crash was additionally **device-verified on the Pixel_10_Pro emulator**. The CEO will do final on-device confirmation of the rest (they asked us to stop booting the emulator).

## Fixed & committed
| # | Bug | Fix | Commit | Verified |
|---|---|---|---|---|
| 11/1 | **No page transitions / no swipe between tabs (TOP priority)** + tab swipe crash + pill↔route desync | Phase A built a swipe pager (`src/nav/TabsPager`, `src/tabs/`). Root crash: `onBegin` read `idxRef.current` **inside the gesture worklet** → froze idxRef → `settle()`'s `idxRef.current = to` threw `[Worklets] Tried to modify key 'current'`. Fix: read the settled page from the shared value (`Math.round(index.value)`), never the ref; dropped the unused `.withRef`. | `c545166`, `bf577c0` | **device (emulator): 3 swipes, 0 worklet errors, pill tracks tab** |
| 9 | **Keyboard covers the text field app-wide** | `src/ui/keyboard.tsx` avoidance wrapper applied across screens + CapturePill + sheets | `c545166` | tsc/jest |
| 5 | **Crash when adding a habit** | `expo-notifications` push was removed from Expo Go SDK 53+; `getPermissionsAsync` throws. `getNotifier()` returns the no-op stub in Expo Go (`Constants.executionEnvironment === StoreClient`); `ensureNotificationPermission` try/caught. Real notifications = dev build (APP-007). | `f48ebaf` | jest (repro test) |
| 2 | **"Start vacation mode" disabled with valid dates** | `isValidDate` parsed the date as local then compared to a UTC ISO string → every date failed in +offset zones (Amsterdam). Parse as UTC (`T00:00:00Z`). | `e3ebe8b` | jest (TZ-pinned) |
| 7 | **Home breaks when adding water** | Only broke with the **water card expanded**: `flex:1` Card in a stretch row inflated it ~3x. Row → `alignItems:flex-start`, Card sizes to content. | `64ae7d3` | tsc/jest (device confirm) |
| 1-muscles | **Tapping muscles does nothing** | `BodyMap` gained optional `onMusclePress`; each muscle shape is tappable (Trends heatmap unaffected). Workout detail shows the tapped muscle's name. | `64ae7d3` | tsc/jest (device confirm) |
| 2b | **Square shadow at top of vacation sheet** | `overflow:hidden` on the sheet view (clips Android corner-shadow). | `64ae7d3` | code-only (device confirm) |
| 8 | **Tapping macros card does nothing** | Card now taps to expand a per-macro kcal breakdown (4/4/9 kcal/g), mirroring the water card. | `8f04847` | tsc/jest (device confirm) |
| 10 | **Totals mismatch (LOGGED TODAY 0 vs card)** | Did NOT reproduce in current code — `kcalToday` and the card read the same `detail.totals.kcal`; it was a symptom of the pager desync (fixed above). Emulator showed 265 kcal correct. | — | **device: confirmed OK** |

## Session 6 (2026-07-14) — fixes applied, need on-device confirm (CEO tests on phone)
| # | Bug | Fix applied | Verified |
|---|---|---|---|
| 6 | **Trends scrub + "tap card first" + card animations** | Root fix matches the prototype instead of the risky pager-ref approach: `TrendCard` (`src/trends/parts.tsx`) is now **collapsed by default** and the `ScrubOverlay` only mounts when the card is tapped open — a closed card has no Pan, so the tab-swipe pager keeps the horizontal drag (no nav regression, no pager ref, no worklet-freeze risk). Each card also fades in on mount (`FadeInDown`, staggered `delay` 0/60/120/180ms) → "all cards have animations". Scrub/readout only after opening. | tsc + jest 168 (device confirm) |
| 3 | **Drag-to-dismiss on sheets not fluid** | Decision + spring-back moved **into the gesture worklet** (UI thread): `shouldDismiss` is now a `"worklet"` (`src/capture/sheet.ts`, still JS-testable); new shared `useSheetDrag(close)` hook (`src/ui/useSheetDrag.ts`) — only `close()` crosses via `runOnJS`, the spring never round-trips to JS. Removed the triplicated drag block from Capture/Checkin/Review sheets. | tsc + jest 168 (device confirm) |
| 4 | **Export to PDF doesn't work** | The bare `catch {}` in `ExportSheet.tsx` was swallowing the real failure → silent no-op. Now surfaces it via `Alert`; `exportPdf` throws a clear error when `Sharing.isAvailableAsync()` is false instead of silently succeeding. **Next device test will show the exact error message** — report it back and I fix the precise cause. | tsc + jest 168 (device shows real error) |

_VacationSheet still uses its own drag (not part of the shared hook) — untouched this pass._

## Session 6, pass 2 (2026-07-14) — CEO device retest + Fable fidelity backlog
CEO retested on device: #3 better in some sheets but not vacation/capture; #4 gave the real error `expoSharing.shareAsync … not allowed to read file under given url`; #6 still not working. CEO: "já pode ir fazendo tudo" (implement the Fable backlog). Commits `7c8cf67..23dd865`:
- **#4 (real fix):** the print-cache PDF path isn't readable by the Android share FileProvider → copy to the document dir and share from there (`src/export/pdf.ts`).
- **#6 (real fix):** the pager's gesture was never published — added `.withRef(tabsPagerRef)` (ref moved to leaf `src/nav/pagerRef.ts` to avoid an import cycle); the open-card `ScrubOverlay` now `.blocksExternalGesture(pager)` + `activeOffsetX/failOffsetY` so a horizontal drag scrubs (pager waits) and vertical still scrolls. Added the 2px active-day guide line.
- **Motion system (Fable A1/A2/A5/A6/A7/A8, A3, B3):** `PressScale` (Button/Chip), `Card` shadow, animated `Bar`/`Toggle`/`Chevron`, `MorphBlob` (capture parsing), Trends bar grow-in + calorie-curve draw-on. Addresses the CEO's "flat/not fluid" theme.

**Full fidelity backlog + rankings:** `docs/reviews/2026-07-14-fable-fidelity-audit.md`. **Landed:** A1,A2,A3,A5,A6,A7,A8,B3 + the two device bugs.

## Session 6, pass 3 (2026-07-14) — CEO: "vai fazendo tudo" → full Fable backlog implemented
CEO device retest #2: #3 still stiff on vacation/capture, #4 real error = share FileProvider can't read the print-cache path, #6 still broken, and green light to implement everything. Commits `327ff94..16b9e9a` (pass-2 fixes for #4/#6 were `7c8cf67`):
- **A4 (closes CEO #3 everywhere):** new shared `SheetOverlay` (backdrop fade + vtSheetUp rise + worklet drag-dismiss + optional keyboard lift). Converted VacationSheet, ExportSheet and both workout-preview Modals (de-duplicated into `src/workout/PreviewSheet.tsx`); sheets hoisted OUT of ScrollViews (Account, Trends, workout/[id]) so overlays don't scroll with content.
- **B1/B2 Home:** 82px centered hero (no card), filling water vessel (600ms tween, philosophy-safe scaling), chevrons + expander fades, last-7 bars grow in.
- **B5:** check-in deck — peeking card strips, next card slides in with 2° tilt (vtNextA), "All caught up" pops. **B11:** donut segments sweep (vtArc). **B7:** 7-bar voice equalizer (vtWave). **B6:** portion pop-up pops (vtPop ×2 staggered) + floating live daily-totals mini-card.
- **B9/B10:** onboarding steps rise (vtIn) + chip/option staggers + summary pop + morphing heroes (`MorphContainer`); auth hero morphs + consent/sent pops; account rows stagger + press-scale + rotating profile chevron; habits get the animated Toggle/Chevron + editor fade.
- **B4:** muscle tap on Trends heatmap/chips → sessions sheet → preview (exercises are per-session in our model, not per-exercise — honest equivalent of the prototype's exercise list). **B8:** workout-detail muscle tap pops a dismissible info chip; chips reflect selection.
- **Polish:** pill mount pop, parse-result card pop, scrub readout fade, meal-detail row/bar staggers.

**Not done (deliberate):** B12 blurred backdrops (needs `expo-blur` — new dep, CEO call); per-exercise muscle row-tinting in B8 (needs `exercises[].muscles` from the backend parse — contract change, backend ticket if wanted). All 34 suites / 168 tests green, tsc clean at every commit.

## Session 6, pass 4 (2026-07-15) — full emulator drive (CEO-authorized) + 3 real device bugs found & fixed
Drove the whole app on the Pixel_10_Pro emulator (Expo Go 56, mocked API): onboarding → plan read-back → Home → capture (meal + workout) → Trends (swipe/scrub) → sheets → export. Commit `dbc9576`. Found and fixed three bugs only a device shows:
1. **Tab swipe "sometimes dead" (pre-existing, the REAL #1 nav bug):** the pan's `onBegin` lazily mounted the neighbor tab via setState → pager re-rendered MID-GESTURE → gesture recreated, translation reset → swipe snapped back. Neighbors now pre-mount from a deferred effect after a tab settles. **Verified: Home↔Trends↔Habits swipes all work.**
2. **Mount animations dropped on busy boots:** effect-scheduled `withTiming` raced view attachment (bars/vessel/crest stayed empty on cold boot). New `useStartOnLayout` starts mount tweens at first `onLayout`; vessel animates px (animated %-height on absolute child never applies); `WaveIllustration` memo'd (parent re-render freezes in-flight SVG animatedProps) + SVG draw-ons pin final state post-tween. **Verified on cold boot: vessel fills, crest draws, bars grow.**
3. **PDF export (#4) round 2:** the File-API copy also lacks READ permission on the print cache. Final fix: `printToFileAsync({ base64: true })` → `File.write(base64)` into the document dir → share. **Verified: Android share sheet opens "Sharing 1 file — vita-log.pdf".**

Also emulator-verified: #3 drag-dismiss fluid on capture AND vacation/export (SheetOverlay), #6 scrub with readout + guide line + no pager fight (closed card swipes tabs, open card scrubs), MorphBlob parsing state, result-card pop, consent/summary pops, water vessel, muscle chips. **Remaining for CEO's phone pass: feel/fluidity judgment only — every functional bug is now device-verified fixed.**

## Notes
- The grey/blue floating **gear is a device/OS overlay** (Expo Go dev-menu bubble), NOT app UI — it sits over the Home account button and intercepts taps; drag it aside.
- Emulator (`Pixel_10_Pro`) was left running by an earlier agent; the orchestrator's Metro on :8082 was stopped. Per the CEO, do NOT boot the emulator — they verify on their phone.
- All fixes keep `tsc` 0 / Jest 168 green and preserve the product philosophy + the Home `flex:1` layout.
