# APP-132 — keyboard + scroll pass over the two v4.2 builders

Session 24, wave 2. Polish only: no visual style, no copy, no new dependency.

## Verified, no change needed

- `KeyboardAvoider` wraps **both** routes already — it lives in `BuilderShell`
  (`src/build/parts.tsx`), which `app/(main)/build-plan.tsx` and
  `app/(main)/build-program.tsx` both render. `plan-setup.tsx` (the precedent named in
  app-plan §D risk 1) has **no `TextInput` at all** and therefore no avoider; the shell
  is already stricter than the pattern it was told to follow.
- `keyboardShouldPersistTaps="handled"` was already on the shell scroll view and on the
  `bwPick` catalog list — a unit chip / catalog row takes the first tap with the keyboard up.
- `PickExerciseSheet` already passes `lift` to `SheetOverlay` (checked, it is really there).
- `bwPick` stage 2 (title + one or two number fields + two buttons) is short and rides the
  lift — nothing is covered, no change.

## Fixed

1. **Scroll the focused field into view.** Nothing in the app did this before.
   `KeyboardAvoider` only *shrinks* the viewport (Android edge-to-edge here never gets
   `adjustResize`); a field the keyboard now covers does not move on its own.
   `BuilderShell` keeps a `ref` + a live scroll offset for its `ScrollView` and hands them
   down a context; `useFieldVisible()` measures the field against `Keyboard.metrics()?.screenY`
   — the keyboard's own top, so no window-height/nav-bar guessing — and scrolls the overlap
   plus 16px. No keyboard (hardware kb, tests) → no-op.
   Wired on: meal name, **meal time** (the 66px right-aligned numeric field flagged as the
   highest risk), add-food name, add-food quantity, the review-phase inline kcal editor (its
   own `autoFocus` fires it, so the row lifts itself), program name, day name, day-kcal line.
2. **`bwPick` list height.** `lift` slides the WHOLE sheet up, so the fixed 300px list pushed
   the search field off the **top** of the screen with the keyboard open. `maxHeight` is now
   `clamp(120, 0.78 × window − keyboard − 260, 300)` (260 ≈ handle, title, family cards,
   search, padding), using a new `useKeyboardHeightState()` in `src/ui/keyboard.tsx` — plain
   React state beside the existing SharedValue, for layout that has to shrink.
3. **Return keys**, only where trivially wireable: add-food name `next` + `blurOnSubmit={false}`
   → focuses quantity; meal / program / day name `done`; kcal editor `done` (it already saved
   on submit); `bwPick` search `search`. Numeric-only fields untouched — those keyboards have
   no return key.

## Files

`src/build/parts.tsx` · `src/build/food/MealsPhase.tsx` · `src/build/food/ReviewPhase.tsx` ·
`src/build/train/parts.tsx` · `src/workout/PickExerciseSheet.tsx` · `src/ui/keyboard.tsx`

## Gates

`npx tsc --noEmit` → 0 · `npx jest` → 75 suites, **584 passed / 1 skipped** (baseline held).

## Known ceilings (ponytail)

- `useFieldVisible` waits a flat **320ms** after focus rather than subscribing each field to
  keyboard events: focus fires before the keyboard frame exists. Raise it if a slow device
  ever measures too early.
- No unit test added: the logic is measure-and-scroll glue with no branch a jest render can
  exercise (host refs are null there, so it deliberately no-ops). The real check is the
  APP-133 emulator drive at a real device height — every field above, keyboard up.
