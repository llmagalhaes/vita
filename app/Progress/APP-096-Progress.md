# APP-096 — Three-panel shell + panel tabs + edge-swipe

Session 22 (v4 round, wave 1). Builder: Opus. Spec: `docs/v4/app-plan.md` §3 APP-096,
`docs/v4/README.md` §1 (Structure + Panel tabs), prototype `Vita Prototype v4.dc.html`
lines 118–126 (tab bar + pan surface), 1481–1487 (`panTabs` / `tabsBg` / `darkTop`),
1577–1586 (`panX` / `panPD` / `panPM` / `panPU` / `hintOn`), 328 (swipe hint).

## What shipped

**`src/nav/panelPan.ts`** (new) — every gesture decision as a pure, worklet-safe function,
so the file that ate swipes twice is testable without a renderer:
`PANEL_ROUTES = ["/trends","/day","/library"]` (Day = index 1) · `panelIndex(pathname)` ·
`canStartPan(panel,x,width)` (EDGE 34 on **both** edges, Day only — prototype `x<=34||x>=356`) ·
`shouldEngage(dx)` (|dx| ≥ 8) · `isVerticalVeto(dx,dy)` (|dy|>12 && |dy|>1.1·|dx|) ·
`rubberBand(panel,dx,width)` (1:1 inside, ÷3.5 past either end, generalised from the
prototype's hardcoded 390/−780) · `commitTarget(panel,dx)` (|dx| ≥ 90, **no velocity term**,
at most one panel per gesture, clamped). Thresholds all read from `tokens.panelGesture`
(APP-093) — no number is retyped.

**`src/nav/PanelShell.tsx`** (new, replaces `TabsPager`) — the three panels co-mounted in one
`width×3` row, `translateX` on a shared value.
- **All three panels are always mounted.** There is no `mounted` state to grow, so the
  session-6 "mid-gesture remount eats the swipe" failure mode cannot happen. Documented in
  the file header with the upgrade path (defer *inside* TrendsPanel, never remount the slot).
- No `setState` runs during a drag: `armed / engaged / dead / panel / tx` are all shared
  values; the only JS hop is `runOnJS(settle)` on commit (router.replace + `setNavSwiped`).
- Snap = `withTiming(450ms, bezier(.22,.9,.32,1))` (`motion.panelSnap`); during the drag the
  value is assigned directly = the prototype's `transition:none`.
- Edge test uses `e.absoluteX`, **not** `e.x`: the detector sits on the translated 3×width
  row, whose local x is offset by the current panel.
- `.enabled(onPanel && !sheetOpen)` — the pan is fully off while any sheet/pop is up
  (`ui/sheetPresence`), and off entirely on push routes (account, plan-setup, details).
- `.withRef(tabsPagerRef)` keeps `scrub.tsx`, `DockDatePicker.tsx` and `Timeline.tsx`
  working with **zero edits** (`blocksExternalGesture` chain intact).
- Route stays the source of truth (deep links, `router.replace`); a route change animates
  with the same timing, guarded by `idxRef` so a gesture-driven change doesn't double-animate.
- Android back on Trends/Library → Day. Status-bar ink follows the scene
  (`<StatusBar style={dark ? "light" : "dark"} />`).

**`src/nav/PanelTabs.tsx`** (new) — frosted segmented control, `position:absolute top:48
zIndex:50`, centred. Container r20 / padding 3 / border / `shadowPanelTabs`; chips r16,
6×13, 9.5/800 uppercase ls 1.2, active chip `#FFFDF7` + `shadowTab`, active ink = accent,
idle `#8A7E70`; **dark-scene variant** (`rgba(40,34,28,.30)` container, `rgba(255,253,247,.20)`
chip, `#F7F0E4` / `rgba(247,240,228,.65)` inks) when the Day panel is on the evening scene.
Chip bg + ink tween 300 ms (`transition:all .3s`) via `interpolateColor`; the idle colour is a
transparent copy of the active fill so the tween never passes through grey. Tap →
`settle(i)` = the same timing path as a commit, never the drag path.
Also exports **`SwipeHint`** (`◂ SWIPE FROM AN EDGE · TRENDS — LIBRARY ▸`, 9/800 ls 1.2
`#B7AB9C`, `FadeOut` on retire) reusing the existing `nav.swiped` kv, rendered inside the Day
panel so it scrolls with the content exactly like the prototype.

**Android blur ladder** (per the CEO directive): the translucent fill is the shipped default
on Android (`const ANDROID_BLUR = false` — one switch at the top of `PanelTabs.tsx`); flipping
it to `true` routes Android through `BlurView` with `experimentalBlurMethod="dimezisBlurView"`
+ `blurReductionFactor={1}`. iOS always uses `BlurView` (intensity 14 = the CSS blur px, the
convention `SheetBackdrop` already uses).

**`src/ui/scene.ts`** (new, stub) — `sceneFor(hour)` (<12 morning · <18 afternoon · else
evening), `useSceneName()`, `isDarkScene(scene)`. The panel tabs and the status bar need the
dark-scene flag before the scenic header exists; APP-097 owns the header and may refine it.

**Placeholders (ownership handed on)** — `src/day/DayPanel.tsx` (APP-097/098),
`src/trends/TrendsPanel.tsx` (APP-099), `src/library/LibraryPanel.tsx` (APP-103). Each is a
`ScrollView` with the prototype's padding (`88 / 20 / 150` Day, `88 / 20 / 120` the others)
and a title; DayPanel renders `<SwipeHint />` with a note to keep it.

**Routes** — new `app/(main)/day.tsx`, rewritten `trends.tsx`, new `library.tsx` (null
placeholders that keep the URL alive). `home / today / habits / integrations / workout` now
`<Redirect href="/day" />` so the ~15 not-yet-rewritten `router.replace` call sites still land
somewhere real; **APP-108 deletes them and their call sites**. `app/index.tsx` and
`app/auth.tsx` go straight to `/day` (one less redirect hop on cold start);
`app/onboarding.tsx` still goes via `/home` on purpose — APP-105 rebuilds it and two tests
assert that string.

**`app/(main)/_layout.tsx`** — `<TabsPager/><NavDots/>` → `<PanelShell/>`; `Stack.Screen`
list re-ordered to trends/day/library (+ the legacy redirects, `animation:"none"`).

**Deleted** — `src/nav/TabsPager.tsx`, `src/nav/NavDots.tsx`, `src/nav/__tests__/tabs.test.ts`.

**`src/ui/tokens.ts`** — one addition: `shadowPanelTabs` (`0 8px 22px rgba(50,38,26,.12)`,
the container shadow the prototype has at line 119 and README §2 omits).
**`src/i18n/locales/en.json`** — `nav.panels.{trends,day,library}`, `nav.swipeHint`,
`trends.subtitle`.

## Gates

- `npx tsc --noEmit` → **0** (whole tree, with the shell swap and all legacy screens still
  compiling).
- `npx jest src/nav` → **21/21** (`panelPan.test.ts` 19 + `panelShell.test.tsx` 2).
- `npx jest` (full) → **367/367, 61 suites** (was 365/60 before this ticket; net +2 suites
  new, −1 deleted, +21 −13 tests).

Gesture-helper coverage (the acceptance list): `shouldEngage` at 7.9/8/−8 · `isVerticalVeto`
at dy 12 vs 12.1 and the strict 1.1 ratio (dy 22 vs 22.1 against dx 20) · `canStartPan` at
x 34 vs 34.1 and width−34 vs width−34.1, plus mid-screen false on Day / true on Trends+Library ·
`rubberBand` 1:1 inside, 35→10 past each end, and the partially-past case · `commitTarget`
at exactly 90 (no commit) vs 90.1 (commit), never two panels, clamped at both ends.

## Needs device verification (D1)

1. **Edge-swipe on the Samsung**: from the left edge of Day → Trends, right edge → Library;
   commit vs spring-back around the 90 px line; the ÷3.5 rubber-band at the two ends.
2. **Day content scroll with a finger starting mid-screen** must be untouched, and a
   mid-screen horizontal drag on Day must do nothing (dock/charts own it).
3. **Arbitration**: the dock date picker and (once APP-099 lands) the Trends scrub must win
   their horizontal drags — `blocksExternalGesture(tabsPagerRef)` now points at this pan.
4. **No pan while a sheet is open** (open the capture sheet, try to swipe).
5. **Panel tabs on Android**: is the translucent fill acceptable, or is
   `ANDROID_BLUR = true` (dimezisBlurView) visibly better and fast enough? CEO call.
   Note expo-blur 56 also mentions a `BlurTargetView` host for Android blur — if the flag
   produces nothing on device, that is the next thing to try.
6. **Dark-scene variant** after 18:00 on the Day panel (tabs + status-bar ink flip).
7. **Swipe hint** disappears after the first swipe and stays gone across restarts.

## Deviations / notes

- **Middle tab label is "TODAY", not "DAY"** — the prototype renders
  `['Trends','Today','Library']` (line 1481) and the CEO asked for maximum mockup fidelity.
  The route and every internal name are `day`. One i18n string (`nav.panels.day`) if the
  lead wants "DAY".
- **Vertical veto is enforced twice**: natively via `activeOffsetX([-8,8])` +
  `failOffsetY([-12,12])` (the proven v3 arbitration shape, needed so the vertical scroll
  keeps working) *and* via the exact `isVerticalVeto` rule inside `onUpdate`. The native
  `failOffsetY` is slightly stricter than the prototype on a rare fast diagonal
  (|dy| > 12 with |dx| large): the prototype would pan, we fail to the scroll.
- The **old v3 screens are no longer mounted anywhere** (Home, Today, Habits, Integrations,
  WorkoutHub) — they still compile and their tests still pass; APP-108 deletes them.
  Until then the v3 `CapturePill` still renders its old 3-shortcut nav row over the shell
  (APP-104 rebuilds it) — expected noise on a device pass, not a bug in this ticket.
- `pagerRef.ts` untouched (symbol name kept, as required); only its meaning changed.
