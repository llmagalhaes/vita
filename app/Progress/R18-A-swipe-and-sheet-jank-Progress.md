# R18-A — panel-swipe hitch + stuttery sheet entrance

CEO device feedback (real Samsung, release build), two perf items. Both were
investigated to a root cause before any edit; neither hypothesis handed to me
survived contact with the code, and the real causes are below.

---

## ITEM 1 — "leve travadinha" swiping the Day panel sideways, both directions

### Not the cause (checked, ruled out)

- **(a) `{onPanel ? <PanelTabs/> : null}` remounting the tabs on route change.**
  `onPanel = panelIndex(pathname) >= 0`. A swipe only ever moves between
  `/trends`, `/day`, `/library` — all three are panel routes, so `onPanel` stays
  `true` through the whole commit and `PanelTabs` never unmounts. The
  mount/unmount only fires on a push to a *non-panel* route (builders, account,
  plan-setup), which is exactly what it was added for. **Left alone.**
- **(b) setState / runOnJS during the gesture.** `onUpdate` is pure worklet
  (`isVerticalVeto` / `shouldEngage` / `rubberBand`), no `runOnJS`. The only
  `runOnJS` is `settle` in `onEnd`, after the pointer is gone.

### The actual cause — the settle frame, not the drag

The drag is genuinely UI-thread. The hitch is at the **commit**: `onEnd` starts a
300ms `withTiming` snap on the UI thread and, in the same breath, `runOnJS(settle)`
does `router.replace(...)`. RN mounts a React commit **on the UI thread**, so that
commit lands on top of the running tween. What that commit contained:

1. **All three panel trees re-rendered.** `TrendsPanel`/`DayPanel`/`LibraryPanel`
   were plain inline children of `PanelShell`'s render, so *any* `PanelShell`
   re-render ran a full render pass over the entire app.
2. **Trends remounted every chart.** `TrendsPanel` subscribes to `usePathname`
   itself; on settle its focus epoch bumps and re-keys `TrendCard` (APP-052, by
   design) — a full unmount+mount of all the charts, right into the tween.
3. `CapturePill` (also on `usePathname`) re-rendered, and the Stack swapped its
   route placeholder screen.
4. `setNavSwiped()` ran on **every** commit — `kvSet` is `db.runSync(...)`, a
   synchronous SQLite write, hint long since retired.

### Fix (`src/nav/PanelShell.tsx`)

1. The three panels are one `useMemo(..., [width])` element. `Animated.View` now
   gets the same child reference across shell re-renders, so React bails out of
   all three subtrees. This alone removes the bulk of every settle frame — and of
   every sheet-open/scene-tick re-render too.
2. **The URL commit is deferred past the snap** (`SNAP.duration`, 300ms). Nothing
   on screen waits for the URL: the row is already animating from shared values.
   A new `shown` state (written synchronously in `goto`) drives the tab chip and
   the status bar, so the highlight still tweens with the row exactly as before —
   only the address lags, invisibly. Tab taps ride the same path and get the same
   win.
3. `setNavSwiped()` moved into the deferred callback and gated on a `hintOwed`
   ref, so it is a swipe-only write off the animation frame.

Two correctness knock-ons the deferral forced, both handled:

- `pick` can no longer rely on the route→panel effect: tapping back to the panel
  the (stale) URL still points at would replace to the same href, change nothing,
  and leave the tab dead — the CEO-batch-#1 bug one layer down. `pick` now moves
  the row itself and writes `idxRef`, upholding the file's real invariant
  ("whoever writes `idxRef` must also move the row").
- The Android back handler had the same hazard (back pressed within 300ms of a
  swipe was a no-op); it goes through `pick` via a ref now.

The header comment in `PanelShell.tsx` records all of this, and the stale
"only the drag may pre-write `idxRef`" rule was rewritten to the rule that
actually holds.

---

## ITEM 2 — sheet/pop entrance "é possível ver as etapas da renderização"

### Root cause — the tween starts before the sheet exists

Flipping `visible` does not put a sheet on screen. It takes **three React commits
plus a native mount** first:

```
commit 1  visible=true → useSheetTransition effect → setRendered(true)
commit 2  SheetOverlay renders the node → usePortal effect → setPopNode → emit
commit 3  PopHost re-renders → the sheet body finally mounts natively → layout
```

The 450ms `withTiming(0)` was fired in **commit 1's effect**. So the sheet's first
visible frame was already mid-flight, and every heavy child (the exercise catalog,
the calendar grid, `HabitDetailSheet`) popped in as it mounted, on top of a running
animation — literally "the render stages".

Second, smaller bug in the same place: the entrance travelled `FALLBACK_HEIGHT`
(700px) on a first open regardless of the sheet's real height, so a short sheet sat
off-screen through the first third of the decelerate curve and then whipped in.

The backdrop was **not** racing (`SheetBackdrop` skips its `FadeIn` whenever a
driven `style` is passed, which both overlays do), and the animation was never on
the JS thread.

### Fix (`src/ui/useSheetDrag.ts`, `src/ui/PopOverlay.tsx`)

The entrance now starts from **`onSheetLayout`** (`onLayout` on the card, for
`PopOverlay`) instead of the effect: the sheet mounts parked off-screen at
`height.value`, all three commits and the native mount happen invisibly, and only
then does one clean, uninterrupted UI-thread slide run — from the **measured**
height, so the travel is exact.

Deliberately **not** done: deferring the children a frame
(`InteractionManager` / mounted-next-frame). It would put the mount back inside
the animation and hand the entrance a wrong height — strictly worse than mounting
everything first. Cost of the chosen fix is that a heavy sheet now waits its own
mount time before it starts moving; it trades latency for smoothness, which is
what the CEO asked for. No new library needed.

Both overlays handle "reopened before the close animation finished" (the subtree
never unmounted, so no layout event is coming): they detect it and rise
immediately. All three `useSheetTransition` consumers (`SheetOverlay`,
`CaptureSheet`, `ReviewSheet`) already wire `onSheetLayout`, so the chokepoint fix
covers all 13 `SheetOverlay` sheets, the capture sheet, the review sheet and both
centered pops with no call-site edits.

---

## Files

- `src/nav/PanelShell.tsx` — memoized panels, `goto`/`settle`/`pick`, `shown`,
  deferred URL, latched hint write, back handler through `pick`, header note.
- `src/ui/useSheetDrag.ts` — entrance moved to `onSheetLayout` (`rise()`).
- `src/ui/PopOverlay.tsx` — same, on the card's `onLayout`.
- `src/nav/__tests__/panelShell.test.tsx` — the tab-tap test now waits for the
  deferred replace and asserts the chip is *ahead* of the URL (the mock pathname
  never moves, so a highlighted Library chip proves it reads `shown`, not the route).

## Gates

`npx tsc --noEmit` → 0 · `npx jest` → 77 suites, **634 passed / 1 skipped**, 0 failed.
(The pre-existing "worker failed to exit gracefully" notice comes from
`src/capture`+`src/day`, not from anything here.)

## Not measured on device

Both fixes are reasoned from the code path, not from a trace. If a hitch remains
*during* the drag (as opposed to at the settle), the next suspect is `PanelTabs`'
`BlurView`: `blurReductionFactor={1}` means the dimezis blur re-captures the whole
`appBlurTarget` at full resolution every frame, and during a pan the entire target
redraws every frame. The knobs are `blurReductionFactor` and `ANDROID_BLUR` in
`PanelTabs.tsx` — both change the CEO-approved look, so neither was touched.
