# APP-142 (R19) — OS-native presentation for the centred pops

Ticket: `docs/v4.3/PLAN.md` §R19. Two surfaces the CEO still calls stuttery after two
custom rounds (R18-A parked the measured entrance): the Macros "recorded" pop and the
Day timeline's PortionPop. Both now open as a **react-native-screens transparent modal
screen** — the OS animates them.

## What the platform actually supports (verified in `node_modules`, not from memory)

| Claim | Evidence |
|---|---|
| `presentation: "transparentModal"` is a valid expo-router / native-stack option | `expo-router/build/react-navigation/native-stack/types.d.ts:614` (`presentation?: Exclude<ScreenProps['stackPresentation'],'push'> \| 'card'`), documented at `:605` as "the previous screen will stay so that the content below can still be seen" |
| `animation: "fade"` is valid and maps to a real Android animation | `types.d.ts:582` (`animation?: ScreenProps['stackAnimation']`) → `ScreenViewManager.kt:140` `"fade" -> StackAnimation.FADE` → `utils/FragmentTransactionKt.kt:25-28` `setCustomAnimations(R.anim.rns_fade_in, rns_fade_out, …)` |
| A translucent screen keeps the one below mounted **and drawn** | `Screen.kt:302-310` `isTranslucent()` is true for `TRANSPARENT_MODAL`; `ScreenStack.kt:161-164` computes `visibleBottom` with `dropWhile { it.isTranslucent() }` |
| It is a **screen**, not a window (so RNGH still works) | On Android it is a `ScreenStackFragment` inside the same `ScreenStack` view — which lives inside the root `GestureHandlerRootView`. This is the whole reason the session-21 ban on RN `Modal` (Reanimated+RNGH deadlock → ANR) does not apply. |

## The architectural constraint that decided the file layout

`(main)/_layout.tsx` renders `<PanelShell />` **after** its `<Stack>`, i.e. the three
panels draw ON TOP of every `(main)` screen. A transparent modal declared under
`(main)` would therefore open *behind* the panels. So the route is **root-level**
(`app/pop.tsx`, declared in `app/_layout.tsx`), where it renders above the whole
`(main)` screen.

That flips the second half of the problem: `PanelShell` hides itself on any non-panel
route (`display:none`), so pushing `/pop` made the panels vanish and the pop opened
over bare canvas. One-line fix — the shell keeps drawing (and keeps its status-bar
style) while `pathname === POP_ROUTE`; it already takes no touches off-panel, and
`PanelTabs` still unmounts, which is what we want under a pop.

## Mechanism

`src/ui/popScreen.tsx` is a `popHost`-shaped store: the owner pushes its card node on
every render, `/pop` renders it. Route params were not an option — the pops carry live
callbacks (`onChangeQty`, `onSkip`, `onClose`) and plan objects, and the state lives in
the owner (`MealNode`). Two rules the store exists to enforce, both covered by
`src/ui/__tests__/popScreen.test.tsx`:

1. **id-owned entry.** A timeline renders one `PopOverlay` per meal; the four closed
   ones must not be able to clear the open one's card.
2. **`close` is a REF, and the screen's unmount fires it.** Android hardware back and
   the iOS swipe dismiss the screen without touching the backdrop, so `visible` would
   stay `true` forever. And it must be the *current* close: the stale closure from the
   open render would re-apply the portion write and re-toast it.

`isPopScreenOpen()` guards the other direction — a screen dismissed from the inside is
already gone, and a second `router.back()` would take the panel with it.

The entry is deliberately **not** cleared when `visible` goes false: the card has to
keep drawing through the OS fade-out.

## Decisions

- **Blur: dropped on Android for these two pops, kept on iOS.** The modal screen renders
  inside `AppBlurTarget` (the root Stack is its child), and an Android BlurView inside
  its own blur target is an hwui infinite recursion → RenderThread SIGSEGV (sessions 23
  and 24). So the modal backdrop passes `inline` — Android keeps the `light` scrim
  `rgba(247,242,233,.45)` and drops the 13px radius; iOS has no target mechanism and
  keeps the real material. Never ship a recursion risk. Plausibly a net win anyway: the
  dimezis blur re-blurs the whole app tree every frame and is a prime suspect for the
  stutter itself. **Eyeball on device**: if the scrim alone reads too thin on the
  Samsung, raise the `light` recipe's alpha — do not re-add the blur.
- **`SheetBackdrop` gets `style={{opacity:1}}`** so its default `FadeIn` does not run a
  second, JS fade underneath the OS one. That double fade is exactly what R19 removes.
- **Opt-in, not a sweep.** `PopOverlay` keeps both presentations behind one API
  (`native` prop → `NativePop`, otherwise the untouched `JsPop`). Water, weight and the
  `/plan` screen's own portion pop stay on the JS chrome — nobody has complained about
  them and leaving them alone costs nothing. `PopOverlay` / `popHost` are unchanged for
  those consumers.

## Gesture verdict

The PortionPop slider (RNGH `Pan` + Reanimated shared value) is **expected to work and
was not reverted**: the modal is a screen inside the same `GestureHandlerRootView`, not
a separate window — the exact distinction that made RN `Modal` fatal in session 21 and
that the app's other pushed screens (which all carry gestures) already prove. Jest
drives the pop end-to-end through the new route store (`timeline.test.tsx` opens it,
presses "Didn't have it today", asserts the record write). **Not yet driven on a
device — flag for the emulator pass**: open a meal, drag the slider, confirm the qty
readout tracks the finger and the daily-totals card updates. If it does not, revert
`MealNode`'s `native` prop only (one word) and ship Macros native alone.

## Files

- `src/ui/popScreen.tsx` (new) — store + `PopScreenContent` + `POP_ROUTE`
- `app/pop.tsx` (new) — the route
- `app/_layout.tsx` — `<Stack.Screen name="pop">` with `transparentModal` / `fade` /
  transparent `contentStyle`
- `src/ui/PopOverlay.tsx` — `native` prop, `NativePop`; old body renamed `JsPop`, unchanged
- `src/ui/index.ts` — export `popScreen`
- `src/nav/PanelShell.tsx` — keep the panels drawn under `/pop`
- `src/day/overview/MacrosSheet.tsx`, `src/day/timeline/MealNode.tsx` — `native`
- `src/ui/__tests__/popScreen.test.tsx` (new), `src/day/timeline/__tests__/timeline.test.tsx`
  (drives the pop through `PopScreenContent`; router mock gains `back`)
- doc refresh in `src/day/overview/MacrosCard.tsx`, `src/day/timeline/MealNode.tsx`

## Gates

`npx tsc --noEmit` → **0**. `npx jest` → **82 suites, 671 passed, 1 skipped, 0 failed**
(whole app, siblings' in-flight work included).
