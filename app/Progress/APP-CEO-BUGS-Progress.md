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

## Notes
- The grey/blue floating **gear is a device/OS overlay** (Expo Go dev-menu bubble), NOT app UI — it sits over the Home account button and intercepts taps; drag it aside.
- Emulator (`Pixel_10_Pro`) was left running by an earlier agent; the orchestrator's Metro on :8082 was stopped. Per the CEO, do NOT boot the emulator — they verify on their phone.
- All fixes keep `tsc` 0 / Jest 168 green and preserve the product philosophy + the Home `flex:1` layout.
