# APP-050 — Sheet entrance bounce fix

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216599815880737
Status: **Done-locally (built + gated + emulator-verified). In progress on Asana — DoD = in production (store).**

## 2026-07-15 — spec session
- CEO reported: sheets bounce on entrance ("parece que está tudo quebrado") — regression
  from session-10 `useSheetTransition` (commit `5c6974a`, APP-042).
- Root cause confirmed: `src/ui/useSheetDrag.ts:39` entrance `withSpring(damping 20,
  stiffness 210)` → ζ = 0.69 (underdamped) → ~5% overshoot ≈ 33px visible bounce, on all
  10 sheets (one shared hook). Drag-dismiss + 260ms programmatic close are correct — keep.
- Spec written: **`docs/reviews/2026-07-15-sheet-motion-fix-spec.md`** — physics, full
  call-site enumeration (SheetOverlay + Capture/Checkin/Review standalone; 7 SheetOverlay
  riders), recommended fix (entrance → `withTiming` 450ms `motion.unfold` bezier =
  prototype vtSheetUp; spring-back damping 18→30, ζ≈1), diff sketch, verification plan
  (emulator pass + one new no-overshoot regression test), risk analysis.
- Team: Fable lead (physics/motion judgment) + 1 Sonnet Explore sub-agent (mechanical
  call-site/test enumeration). No emulator booted; no `src/` touched.
- Open CEO questions (in the spec): 450ms vs faster 360ms; ship the spring-back damping
  bump together or not.

## 2026-07-15 — implementation session (CEO greenlit; 450ms + spring-back bump)
CEO approved the exact fix. Applied surgically to `src/ui/useSheetDrag.ts` only.

**The two behavioral lines (before → after):**
- Entrance (was line 39):
  - before: `translateY.value = withSpring(0, { damping: 20, stiffness: 210 });`
  - after: `translateY.value = withTiming(0, { duration: ENTRANCE_ANIM.durationMs, easing: Easing.bezier(...ENTRANCE_ANIM.bezier) });`
    where `ENTRANCE_ANIM = { durationMs: motion.unfold.durationMs /*450*/, bezier: motion.unfold.bezier /*(.22,.9,.32,1)*/ }`.
    Verified `motion.unfold` in `tokens.ts` is exactly `{ durationMs: 450, bezier: [0.22,0.9,0.32,1] }` — reused the token, no hardcoded constants (spec §1/§3 confirmed).
- Cancelled-drag spring-back (was line 68):
  - before: `withSpring(0, { damping: 18, stiffness: 220 });`
  - after: `withSpring(0, { damping: 30, stiffness: 220 });` (ζ≈1.01, critically damped)
- Plus: doc-header comment updated ("spring-in on open" → "rises on open (prototype vtSheetUp: 450ms decelerate bezier, no overshoot)"), and a new exported `ENTRANCE_ANIM` const so the regression test can assert the entrance stays a timing curve, not a spring.
- Drag-follow path and the 260ms programmatic close (`CLOSE_MS`) untouched, as specified. Diff is confined to these lines (confirmed via `git diff` — no other src file touched by this ticket).

**Regression test (new): `src/ui/__tests__/useSheetDrag.test.ts`** (3 assertions).
- The Reanimated jest mock does NOT faithfully simulate spring overshoot, so a "translateY never < 0" frame test (spec §5.4 primary) would pass even on the buggy spring (false negative). Took the spec's own fallback: assert the exported `ENTRANCE_ANIM` descriptor — durationMs === 450 (=== motion.unfold, within the .32–.45s band), bezier control y-values ≤ 1 (monotone decelerate, no overshoot), and no `damping`/`stiffness` keys (locks it as a timing descriptor — a regression back to a spring fails the test). Honest and non-flaky; no code contortion.

**Gates (all green):**
- `npx tsc --noEmit` → exit 0.
- `npx jest` → **39 suites / 202 tests passed** (was 199; +3 new). Pre-existing benign `act()` warning in `app/auth.tsx` unchanged.
- `npx expo export --platform ios` → OK ("Exported: dist", 1 ios bundle).

**Emulator (Pixel_10_Pro, Expo Go SDK 56, mock mode) — entrance verified clean.**
- Opened Home macros card → MacrosSheet. On-device rapid `screencap` burst caught the entrance frame-by-frame:
  - frame b1: Home, no sheet (pre-open).
  - frame b2: sheet mid-rise — drag handle low on screen (still climbing).
  - frame b3: sheet at rest — handle at final position.
  - frames b4–b10: **byte-identical to b3** (perfectly static).
  - The handle moves **monotonically up** (b2 → b3) and stops hard at rest; it never rises above the rest position, and the settled frames are byte-identical with **zero oscillation**. The old underdamped spring would have produced an overshoot frame (~23px displayed) followed by several *different* damped-settle frames. This is the corrected `withTiming` decelerate: clean rise, no overshoot, no bounce. Frames saved in scratchpad (b1/b2/b3/b10).
- Close / drag-dismiss paths were **not changed** by this ticket (git diff confirms), so they retain the verified-good session-10 behavior; not independently re-driven this session (see below).

**⚠️ Working-tree note for the orchestrator (commit hygiene) — NOT part of APP-050:**
- The working tree contains **uncommitted, in-progress HOME-V2 work that is not mine**: `src/tabs/home/` (DockDatePicker, DaySection, Timeline), `src/lib/haptics.ts`, and modifications to `src/tabs/Home.tsx`, `src/ui/tokens.ts`, `src/i18n/locales/en.json`, `package.json`/`package-lock.json` (expo-haptics). My APP-050 change is confined to **only** `src/ui/useSheetDrag.ts` + `src/ui/__tests__/useSheetDrag.test.ts`. The APP-050 commit must include ONLY those two files.
- During the emulator session, after the macros-sheet entrance verification, tapping the sheet's close X surfaced a **red-box runtime crash in the HOME-V2 code**: `TypeError: Object is not a function at DockDatePicker … styleUpdater_reactNativeReanimated_useAnimatedStyle …` — a worklet bug in `src/tabs/home/DockDatePicker.tsx`'s `useAnimatedStyle`. It is unrelated to APP-050 (separate feature, separate file) and only surfaced because the partially-built HOME-V2 dock is wired into Home in the working tree. Gates pass because the HOME-V2 files compile/bundle/have no failing tests, but they have this runtime defect. Flagging for whoever owns HOME-V2; it blocked a clean re-drive of the sheet *close* path (Home underneath crashes).
- Emulator note: recurring cold-boot ANRs on this Pixel_10_Pro under the dev bundle (the documented session-10 slow-JS-thread behavior, not an app regression) — the app reached a fully-rendered interactive Home repeatedly between them.
