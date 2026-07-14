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

## Remaining — need on-device diagnosis/verification (deferred to next session; the CEO tests on their phone)
| # | Bug | Diagnosis / ready-made fix recipe | Risk |
|---|---|---|---|
| 6 | **Trends "drag the chart" (scrub) broken** | `src/trends/scrub.tsx`'s Pan never wins over the tab pager, whose `activeOffsetX(±14)` steals the horizontal drag. Proper fix: pager exposes its gesture via a **React Context ref** (a `useRef`, NOT the module-level `tabsPagerRef` — that plain object crashes when frozen by worklet serialization); scrub consumes it and `.blocksExternalGesture(pagerRef)`. **Must be device-verified** — re-adding a pager gesture ref risks reintroducing the swipe crash just fixed. | HIGH (could regress nav) |
| 3 | **Drag-to-dismiss on sheets not fluid** | Each sheet's `.onEnd` does the decision via `runOnJS(onDragEnd)` (JS round-trip → jank). Recipe: add `"worklet";` inside `shouldDismiss` (`src/capture/sheet.ts`, stays testable), decide inline in `.onEnd` — `withSpring(0)` to spring back in the worklet, only `close()` crosses via `runOnJS`. A shared `useSheetDrag(close)` hook removes the triplication across CaptureSheet/CheckinSheet/ReviewSheet; VacationSheet needs its own finger-follow drag calling `cancel()`. Fluidity is subjective → device-verify. | MED (isolated to sheets) |
| 4 | **Export to PDF doesn't work** | `src/export/pdf.ts` uses `expo-print` + `expo-sharing` (both Expo Go 56-supported). `ExportSheet.tsx` swallows the error in a bare `catch {}` → silent no-op. Next step: surface the actual error (toast/log) on a device run to see the real failure (`printToFileAsync` throw? `Sharing.isAvailableAsync()` false?), then fix. | LOW (needs device to see failure) |

## Notes
- The grey/blue floating **gear is a device/OS overlay** (Expo Go dev-menu bubble), NOT app UI — it sits over the Home account button and intercepts taps; drag it aside.
- Emulator (`Pixel_10_Pro`) was left running by an earlier agent; the orchestrator's Metro on :8082 was stopped. Per the CEO, do NOT boot the emulator — they verify on their phone.
- All fixes keep `tsc` 0 / Jest 168 green and preserve the product philosophy + the Home `flex:1` layout.
