# APP-CEO-BUGFIX — Two live bugs the CEO found (Home layout + sheet dismiss)

Handed by the orchestrator (no Asana ticket). Scope: `app/services/vita-app/` only.
Reproduced and verified on a real running app (Android emulator Pixel_10_Pro, Expo Go
56.0.4, SDK 56, mock data), before → after screenshots captured.

## Bug 1 — Home layout blowout (HIGH) ✅

**Root cause.** `app/(main)/home.tsx`, the water+macros row. The WATER `Card` had
`height: "100%"` while its parent `Pressable` (`flex: 1.05`) had no defined height. Inside a
`ScrollView`, a percentage height with no definite parent height resolves against the
scroll viewport, so the water card stretched to full-screen height. The row grew with it;
the MACROS card (`justifyContent: "center"`) floated its content to the bottom of the
over-tall column, and the ENERGY card + eating-plan row + timeline were pushed below the
fold. Exactly the CEO's screenshot.

**Fix.** Removed `height: "100%"` from the water `Card` and gave it `flex: 1` inside the
column `Pressable`. The row now sizes to content; React Native's default
`alignItems: "stretch"` already makes the two columns equal height (water matches the
taller macros card). One-line-class change, no new structure. Quick-add (+250 ml) and the
water expand/collapse are untouched.

- Before: `scratchpad/shot14.png` (water card full-height, macros floating, rest below fold).
- After: `scratchpad/shot15.png` (fast-refresh) and `shot18.png` (cold start) — compact
  two-column WATER | MACROS, ENERGY TODAY visible, timeline visible.

## Bug 2 — Confirm sheet won't drag down to dismiss (MEDIUM) ✅

**Root cause (feature was simply missing).** `src/capture/CaptureSheet.tsx`'s grabber pill
was decorative; only backdrop-tap and the buttons closed the sheet.

**Fix.** Added a `react-native-gesture-handler` `Gesture.Pan()` on the sheet (mirrors the
Slider/VoiceOverlay pattern — no new deps):
- `onUpdate` (UI-thread worklet) translates the sheet with the finger, down only
  (`Math.max(0, e.translationY)`), driving a Reanimated `useAnimatedStyle` transform.
- `activeOffsetY(10)` so only a clear downward drag is claimed — Adjust/Confirm taps,
  steppers and backdrop-tap still work.
- On release, past threshold → `capture.close()`; otherwise springs back with `withSpring`.
- Threshold factored into a pure, tested helper `src/capture/sheet.ts`:
  `shouldDismiss(translationY, velocityY)` = `> 120px` OR `> 800px/s`.

**Bug found and fixed mid-verification (important).** My first cut called the plain JS
`shouldDismiss(...)` *directly inside the `.onEnd` gesture worklet*. Gesture callbacks run
on the UI thread as worklets; calling a non-worklet function there throws on the UI thread
and **took the whole app down to the launcher** on release (reproduced twice:
`scratchpad/shot21.png`, `shot26.png`). Fix: route the decision to the JS thread —
`.onEnd((e) => runOnJS(onDragEnd)(e.translationY, e.velocityY))`, where `onDragEnd` (JS)
calls the tested `shouldDismiss` and sets `dragY`/`withSpring`/`capture.close()`. Same
pattern the Slider uses (`runOnJS(set)`).

- The sheet is persistently mounted in `app/(main)/_layout.tsx`, so on dismiss `dragY` is
  reset to 0 (otherwise it would reopen offset by the last drag).
- Before (crash on drag): `scratchpad/shot21.png` / `shot26.png` (app kicked to Android
  launcher).
- After (fixed): `scratchpad/shot28.png` (sheet up) → `shot30.png` (dragged down → sheet
  dismissed, **app still on Home, no crash**).

## The blue floating gear — NOT ours

Confirmed. No `gear`/`cog`/`fab`/`floating` component anywhere in `src/` or `app/`.
`home.tsx`'s header is only the greeting + date — yet an identical grey gear circle renders
at the *same fixed screen position* on onboarding, auth AND home. That fixed-position,
screen-independent placement is the signature of a device/OS overlay (screen-recorder /
accessibility / dev bubble), not app UI — it rendered grey on my emulator, blue on the
CEO's device. Did not add one.

## Files changed

- `app/services/vita-app/app/(main)/home.tsx` — removed `height: "100%"`, added `flex: 1`
  on the water card (+ a comment).
- `app/services/vita-app/src/capture/CaptureSheet.tsx` — Pan drag-to-dismiss (hooks above
  the idle early-return; JS-thread decision via `runOnJS`).
- `app/services/vita-app/src/capture/sheet.ts` — new pure `shouldDismiss` + thresholds.
- `app/services/vita-app/src/capture/__tests__/sheet.test.ts` — 4 tests for the threshold.

## Gates (final)

- `tsc --noEmit` → exit 0.
- `jest` → **91 passed / 91 (21 suites)**, +4 (sheet threshold). (The "worker failed to
  exit gracefully" line is a pre-existing teardown warning, not a failure.)
- `expo export --platform ios` → OK (`_expo/static/js/ios/entry-*.hbc 4.3MB`, exit 0).

## Notes for the orchestrator

- Verification ran on the Android emulator because there is no iOS runtime installed and
  react-native-web can't reproduce a native Yoga/ScrollView layout bug (and is blocked by
  expo-sqlite's SharedArrayBuffer requirement on web). Installed the SDK-matched
  **Expo Go 56.0.4** APK on the emulator (Expo's official GitHub release) to run the app.
- `package.json` is unchanged. `package-lock.json` may show as touched by an earlier
  `npm install --no-save react-dom react-native-web` (web-preview attempt, since removed);
  the concrete web-dep entries are gone and only inherent peer metadata remains. If the
  lock shows as modified at commit time, `git checkout -- package-lock.json` is safe — the
  app source diff is the only intended change.
