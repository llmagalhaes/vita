# Home v2 — Implementation Spec (build-ready)

> **Status: SPEC ONLY — no code written.** For CEO review before any build.
> Source of truth: `docs/home-v2/handoff/README.md` + `handoff/Vita Prototype v2.dc.html`
> (`homeV2On` template block) + `handoff/screens/*.png`.
> Companion docs: `docs/home-v2/screens-analysis.md` (per-screenshot analysis),
> `docs/home-v2/handoff-extract.md` (verbatim prototype math), `docs/home-v2/tokens-table.md`
> (full token delta vs `src/ui/tokens.ts`).
> All app paths below are relative to `app/services/vita-app/`.

## 0. What Home v2 is, as a delta against the current Home

The current `src/tabs/Home.tsx` already ships most of the v2 top section: greeting header
with the 4 round icon buttons, vacation/check-in/review banners, the 82px kcal hero with
the "estimates" chip, the Water+Macros row (water already in the primary slot), and the
expandable Energy card. **Those stay; the deltas are:**

| # | Delta | Size |
|---|---|---|
| 1 | **Dock date picker** — 10 dots, macOS-magnifier Gaussian drag, tooltip, haptics | NEW component (the hard piece) |
| 2 | **Timeline v2** — replaces today's wave-illustrated full-width cards with the spine/gutter row timeline: expand-in-place, water as passive marker, day-swipeable | REWRITE of the timeline section |
| 3 | **Home becomes day-aware** — `selectedDayOffset` (0–9) drives the timeline; date section header label + "Today ↺" return pill | MODIFY `Home.tsx` |
| 4 | Small chrome deltas (water card vessel/quick-add styling, section header) | MINOR |

Everything above the date section (hero, water, macros, energy, plan/program rows,
banners) **stays pinned to today** regardless of the selected day — only the timeline
browses history. (Confirmed against screenshot 05: past day loaded, top cards unchanged.)

## 1. Component tree → file map

```
Home (src/tabs/Home.tsx — MODIFIED)
├── Header row (greeting 21/700 + date 13 #8A7E70; 4× HeaderIcon 36px)   — exists, unchanged
├── VacationBanner / CountBanner (check-ins) / CountBanner (review)      — exists, unchanged
├── Kcal hero (82px extraLight, letterSpacing -2.5, estimates chip)      — exists, unchanged
├── Water card + Macros card row                                          — exists, minor polish
├── Energy card (expandable)                                              — exists, unchanged
├── [Cycle row — GATED OFF in v1, Flo is a v2 integration]                — not built
├── Date section header (label "Today"/"Yesterday"/weekday+date + "Today ↺" pill)
│                                            → src/tabs/home/DaySection.tsx (NEW, small)
├── DockDatePicker ⭐                        → src/tabs/home/DockDatePicker.tsx (NEW)
│     pure math (gaussian, index mapping)    → src/tabs/home/dock.ts (NEW, pure, tested)
└── Timeline v2                              → src/tabs/home/Timeline.tsx (NEW)
      ├── day summary line
      ├── TimelineRow (meal/workout tappable, water passive) — same file
      └── expand-in-place body (chips + item list + "Full details →")
Shared state: selectedDayOffset lives in Home.tsx (plain useState — day changes are
discrete commits, never mid-gesture setState; see §5 risk R1/R3).
Tokens: src/ui/tokens.ts (EXTENDED — see §4 / tokens-table.md)
i18n:   src/i18n/locales/en.json — new keys under home.* (see §6 task 1)
Haptics: src/lib/haptics.ts (NEW, ~10 lines — see §2.5)
```

Deleted/retired with the timeline rewrite: `TimelineCard` + its `WaveIllustration`
usage inside `Home.tsx` (the wave stays in `src/ui` — detail screens still use it).

## 2. Dock date picker ⭐ (the hardest piece)

Files: `src/tabs/home/DockDatePicker.tsx` (view + gesture) + `src/tabs/home/dock.ts`
(pure math, unit-tested). All continuous motion runs on the UI thread; React state
changes **only on release** (commit). Verbatim prototype math in
`handoff-extract.md §a`; verified exact against the HTML.

### 2.1 Geometry & state
- Row: `flexDirection:"row"`, `alignItems:"flex-end"`, `height:44`, `paddingHorizontal:6`.
  10 slots, each `flex:1`, column, `justifyContent:"flex-end"`, full height, `position:"relative"`.
- Dot: `7×7`, `borderRadius:3.5`, `transformOrigin:"center bottom"` (RN 0.74+/New Arch —
  we're on it; else compensate `translateY += (7/2)*(1-scale)`). `pointerEvents:"none"`.
- Shared values (UI thread): `fingerX: number|null` (px within row), `dragging: boolean`,
  `rowWidth: number` (from `onLayout`), `lastIdx: number` (haptic tracker).
- Derived on the UI thread: `slot = rowWidth/10`, `spread = slot*1.25`.
- Day mapping: dot `i` (left→right, 0..9) → `dayOffset = 9 - i` (0 = today, rightmost).
  Pure helpers in `dock.ts`: `offsetForIndex(i)=9-i`, `indexForOffset(off)=9-off`,
  `hoverIndex(x, slot)=clamp(round(x/slot - 0.5), 0, 9)`.

### 2.2 Per-dot Gaussian (each dot has its own `useAnimatedStyle`)
```
// worklet, per dot i, ci = (i+0.5)*slot
const x   = fingerX.value ?? idleFingerX;      // idleFingerX = selected dot center
const d   = Math.abs(x - ci);
const mag = Math.exp(-((d/spread)*(d/spread)));                 // e^-(d/spread)²
const isSel = !dragging.value && offsetForIndex(i) === selectedOffset;
const scale = dragging.value ? 1 + 1.15*mag : (isSel ? 1.85 : 1);   // peak ≈ 2.15×
const ty    = dragging.value ? -(13*mag) : 0;                   // lift, grows upward
const opacity = dragging.value ? 0.5 + 0.5*mag : (isSel ? 1 : 0.85);
// color: interpolateColor(dragging ? mag : (isSel?1:0), [0,1], [colors.dotIdle, accent])
//   prototype tints only above mag>0.14; interpolateColor from 0 is visually equivalent
return { transform:[{translateY: ty},{scale}], opacity, backgroundColor: color };
```
`accent` = `useAccent()` (already reacts to vacation mode). `dotIdle = #D9CFBD` (new token).

### 2.3 Drag vs release
- **During drag** (`dragging=true`): styles read `fingerX` every frame → 1:1 finger tracking,
  no transition (prototype `transition:none`). The idle 1.85× selected scale is **dropped** —
  all dots run pure Gaussian (handoff-extract §d).
- **On release** (`dragging=false`): each dot's style animates to its idle target with
  `withTiming(target, { duration: 550, easing: Easing.bezier(0.34,1.56,0.64,1) })` — the
  overshoot bezier reproduces the CSS spring `transform .55s cubic-bezier(.34,1.56,.64,1)`.
  Alternatively `withSpring({ damping:14, stiffness:180, mass:1 })`; **tune against
  `screens/04` + `05`** (tokens-table motion note). The selected dot settles at 1.85×, accent.
- Because scale/opacity/color are driven by `dragging` + `fingerX` inside each
  `useAnimatedStyle`, the release "spring back" is just the flag flip — **do not animate
  `fingerX`**.

### 2.4 Tooltip (`vtTip`)
- Rendered per dot, absolutely positioned: `left:"50%"`, `bottom:26`,
  `transform:[{translateX:"-50%"}, …]`, `backgroundColor:accent`, `color:#FFF9F1`,
  `fontFamily:extraBold`, `fontSize:10.5`, `letterSpacing:0.3`, `paddingH:9`, `paddingV:4`,
  `borderRadius:9`, `shadow.tooltip`. Downward triangle via a rotated 8px square or an
  SVG/`borderTop:5 solid accent` + 4px transparent sides.
- Text is **static per dot** = `dayDates[9-i]` ("Jul 5", …) → zero mid-gesture setState.
- Visible only on the hover dot: `visible = dragging && hoverIndex(fingerX,slot) === i`
  computed on the UI thread; drive an `opacity`/`scale` animated style.
- `vtTip` pop keyframes (verbatim): `0%{opacity:0, translateY:7, scale:.5} → 55%{opacity:1,
  translateY:-3, scale:1.08} → 100%{translateY:0, scale:1}`, `.32s cubic-bezier(.34,1.56,.64,1)`.
  Reanimated: on "became hover" set `scale` via `withSpring({damping:12,stiffness:220,mass:0.9})`
  from 0.5; `translateY` a short `withSequence(withTiming(-3,80), withTiming(0,120))`.
  Persistent `translateX(-50%)` stays in the base transform (README omits it — keep it).

### 2.5 Haptics (once per crossing)
- In the pan's `onUpdate` (worklet): `const idx = hoverIndex(x, slot); if (idx !== lastIdx.value)
  { lastIdx.value = idx; runOnJS(fireHaptic)(); }`. Reset `lastIdx = -1` on `onBegin` so the
  first dot also fires.
- `fireHaptic` = `Haptics.selectionAsync()` (**new dep `expo-haptics`**, ~1 line wrapper
  `src/lib/haptics.ts`, no-op via try/catch on unsupported platforms — mirrors the
  voice/notifier stub-seam pattern). `vibrate(7)` ≈ a light selection tick.

### 2.6 Gesture (owns the touch from touch-down — matches `touch-action:none`)
```ts
const dockPan = Gesture.Pan()
  .manualActivation(true)
  .onTouchesDown((_, mgr) => mgr.activate())     // active from pointerdown, like the prototype
  .shouldCancelWhenOutside(false)                // finger may drift above the 44px strip
  .blocksExternalGesture(tabsPagerRef)           // pager waits for us inside the row
  .onBegin((e) => { dragging.value = true; lastIdx.value = -1; fingerX.value = clampX(e.x); })
  .onUpdate((e) => { const x = clampX(e.x); fingerX.value = x;
                     const i = hoverIndex(x, slot); if (i !== lastIdx.value){ lastIdx.value=i; runOnJS(fireHaptic)(); } })
  .onFinalize((e) => {                            // finalize covers release AND cancel
    const x = fingerX.value ?? idleFingerX; const off = offsetForIndex(hoverIndex(x, slot));
    dragging.value = false; fingerX.value = null;
    if (off !== selectedOffset) runOnJS(goDay)(off);   // COMMIT only on release, only if changed
  });
```
`clampX(x) = clamp(x, 0, rowWidth)` (worklet). Do **not** add `activeOffsetX` — it would
reintroduce a dead zone and let the pager race the dock. Keep `dockPan` in a stable
`useMemo` so a `goDay` re-render never recreates a mid-flight gesture.

### 2.7 "Today ↺" pill
Shown when `selectedOffset > 0` (in the date section header, §3). Tap → `goDay(0)`. Style:
bg `color-mix(accent 10%, #FFFDF7)` (precompute or `interpolateColor(0.1,…)`), accent ink,
`fontExtraBold`, `10px`, `letterSpacing:0.6`, uppercase, `borderRadius:11`, `padding:4/9`,
`FadeIn` 250ms.

### 2.8 `dock.ts` self-check (ponytail)
One `demo()`/test asserting: `offsetForIndex(9)===0`, `offsetForIndex(0)===9`,
`hoverIndex(0,slot)===0`, `hoverIndex(rowWidth,slot)===9`, and the Gaussian peaks at 1 when
`d===0`. Small pure surface; that's the whole test.

## 3. Timeline v2

File: `src/tabs/home/Timeline.tsx`. Replaces the wave-illustrated full-width `TimelineCard`
block in `Home.tsx`. Verbatim mechanics in `handoff-extract.md §b`.

### 3.1 Swipeable day container
- The wrapper (summary line + entries — **not** the dock or the header-label row) translates
  with the finger and slides on day change.
- `dayDragX: number` shared value (UI thread). `daySwipe` gesture (see §5 R1 for full
  composition):
  ```ts
  const daySwipe = Gesture.Pan()
    .activeOffsetX([-14, 14]).failOffsetY([-18, 18])   // mirror the pager's gate
    .blocksExternalGesture(tabsPagerRef)
    .onUpdate((e) => { let dx = e.translationX;
       if ((offset===0 && dx<0) || (offset===9 && dx>0)) dx = dx/3.5;   // elastic 1/3.5 at ends
       dayDragX.value = dx; })
    .onEnd((e) => {
       if (e.translationX > 70 && offset < 9)      runOnJS(goDay)(offset+1);   // drag right → older
       else if (e.translationX < -70 && offset > 0) runOnJS(goDay)(offset-1);  // drag left → newer
       else dayDragX.value = withTiming(0, { duration: 250 }); });            // snap back
  ```
- **Do NOT port the prototype's `>12px suppresses tap` flag** — a pan activating at 14px
  already cancels child `Pressable` touches in gesture-handler (§5 R1).
- Day-change slide-in: after `goDay` commits (React state), retrigger a `±34px → 0`,
  `.32s ease` entrance on the new content (`FadeIn`/`SlideIn` from left for older, right for
  newer — prototype `vtDayL`/`vtDayR`). Start it from `onLayout` (`useStartOnLayout`), never a
  bare effect, or it drops on the first paint after commit.

### 3.2 Summary line
`"{n} meal(s) · {m} workout(s) · {x} ml water — counted from your logs"` — singular/plural per
count, units-aware water via `formatVolume`. i18n via `home.timelineSummary` with count
plurals (data shaping in §3.9). Factual count only — no score/streak.

### 3.3 Entry row layout
- Row: `flexDirection:"row"`, `gap:11`; stagger `FadeIn.delay(i*60)` (started on layout).
- Time gutter: `width:38`, right-aligned, `10.5px/700 #B7AB9C (labelMuted)`, `paddingTop:16`.
- Spine column: `width:12`; dot `10×10` `borderRadius:5`, `borderWidth:2` `#FFF9F1`, ring via
  a subtle shadow/extra border `rgba(120,100,75,.14)`, `marginTop:16`; rail below `width:2`,
  `flex:1`, `colors.border` (`rgba(120,100,75,.10)`).
- **Dot colors** (see token conflict Q7): water `#A9BC9B`, meal `#E0A375`, workout `#8CA58A`.

### 3.4 Water = passive marker (no card, not tappable)
`flexDirection:"row"`, `gap:7`, `padding:8/2/2`, `11.5px/700 #7E9480`: 11×13 drop SVG
(`#A9BC9B`) + `{meta}` (e.g. "500 ml") + `· {sub}` muted. No press, no expand, no detail route
in the timeline. (Water detail is still reachable from the Water card's expanded log rows —
unchanged.)

### 3.5 Meal / workout = tappable card, expand-in-place
- Card: `colors.card`, `border 1px rgba(120,100,75,.07)`, `borderRadius:20`, `padding:12/14`,
  `shadow.row` (`0 8px 20px rgba(105,84,60,.07)`), press-scale `0.985` (reuse `PressScale`).
- Contents: 34px icon tile `borderRadius:12` (meal `#F7E7D4`/`#A66A3F`; workout `#E7EDE1`/`#5F7A61`
  — see token conflict Q7), title `15px/700 #453E35`, sub `11.5px #8A7E70` ellipsized, badge chip
  (same tint pair as tile, `borderRadius:13`, `5/10`, `11.5px/800`), `Chevron` rotating 180° on open.
- **Expand** (per-entry toggle, **multi-open allowed** — not an accordion; keyed
  `e_{offset}_{id}`): dashed top border `1px dashed rgba(120,100,75,.16)`, `marginTop:11`,
  `paddingTop:11`, `FadeIn 250ms`. Chips row (`10.5px/800 #6E6355` on `#F3EBDD`, `borderRadius:11`,
  `4/9`): meals `["P {p} g","C {c} g","F {f} g"]`; workouts `["{min} min","{n} exercises",
  "via {source}"]`. Item rows: name + kcal/detail `12px`. **"Full details →"** accent link (§3.10).
- Expansion state: a `Set<string>` of `e_{offset}_{id}` keys in Home `useState`. Toggling is a
  discrete tap (not a gesture) so setState is safe; keep it OUT of any gesture callback.

### 3.9 Data: 10 days from SQLite

No schema/contract change. The prototype's `tlDays` sample maps to real queries:

- `entriesForDay(date)` (`src/db/entries.ts`) already answers one day; call it with
  `today - offset` days for `offset ∈ 0..9`. Filter `isTimelineEntry` (excludes `checkin`)
  exactly as today.
- Summary line = counts over that day's entries: meals `type==='meal'`, workouts
  `type==='workout'`, water `Σ detail.amountMl` (units-aware via `formatVolume`).
- Cache: keep a `Map<offset, LocalEntry[]>` memo keyed by the existing `useLogVersion()`
  tick — past days are immutable within a session except via sync, and `logChanged()`
  already invalidates. No new listener plumbing.
- Day labels: offset 0 → `home.dayToday`, 1 → `home.dayYesterday`, else
  `toLocaleDateString(undefined, { weekday: "long" })` + short date — same locale
  approach as the existing header date. **No new date lib.**
- Entry row fields map 1:1 from `LocalEntry`: `t` = `occurredAt` (existing `timeOf`),
  `title/sub/meta` from `detail` per kind (same extraction the current `TimelineCard`
  does), P/C/F = `detail.totals`, items = `detail.items` (meals) / `detail.exercises`
  (workouts).

### 3.10 "Full details →" routing

Routes exist today: `/meal/[id]`, `/workout/[id]`, `/water/[id]`. Per the handoff, the
link renders **only when `selectedDayOffset === 0`** and only on meal/workout rows.
(Open question Q5: our detail screens work for any entry id — enabling it on past days
is free. Default to design fidelity: today-only.)

## 4. Design tokens

Full per-token table (72 values): **`docs/home-v2/tokens-table.md`**. Delta:

| Status | Count | Meaning |
|---|---|---|
| exists | 16 | reuse the `tokens.ts` constant as-is |
| exists-differs | 17 | same intent, value drifts slightly (radii 22 vs 24, shadow .09/16 vs .08/26, greeting 21 vs title 20, gap 13 vs md 12) — Home v2 gets a named override |
| NEW | 39 | net-new constants to add to `tokens.ts` |

**NEW constants to add to `src/ui/tokens.ts`** (grouped):
- Surfaces/ink: `colors.waterVesselBg #EDF1E7`, `colors.dotIdle #D9CFBD`, `colors.inkHero #453E35`.
- Borders: keep the single rgb `(120,100,75)`; add a helper `colors.borderAlpha(a)` rather than
  3 constants for `.06/.10/.12` (Q8).
- Shadows: `shadow.row` `{#69543C, .07, 20, (0,8), elev 2}`, `shadow.tooltip` `{#785032, .28, 16, (0,6), elev 6}`.
- Type: `fontSizes.kcalHero 82` (weight 200, `letterSpacing -2.5`), `sectionLabel 11.5` (`ls 1`),
  `entryTitle 15`, `entryTime 10.5`, `numeralValue 21` (weight 300), `greeting 21`, `dateCaption 13`.
- Layout: `spacing.screenPadding {64,20,150}`, `screenGap 13`, `cardPadding 15`, `waterVesselSize {54,82}`,
  `dockRow {h44,pad6,slots10}`, `dockDotSize 7`, `entryIconTile 34`, `entryGutterWidth 38`, `spineRailWidth 2`.
- Radii: `radii.cardHome 24`, `radii.row 20`, `radii.tile 12/19`, `radii.chip 9/17` (pick concrete px per use).
- Motion: `motion.fillTransition 600/ease`, `motion.dockSpring bezier(.34,1.56,.64,1)/550`,
  `motion.tooltipSpring same/320`, plus the magnifier constants (`amplitude 1.15`, `spread ×1.25`,
  `translateY -13`, `idleSelectedScale 1.85`) — these live in `dock.ts` as literals, not theme tokens.

**RN translation gotchas** (full notes in tokens-table): `box-shadow`→`shadow*` split;
`color-mix()`→`interpolateColor`; `linear-gradient` water fill→`expo-linear-gradient` (**new dep**,
or fake with two stacked views — ponytail: the current `WaterVessel` uses a flat `#8CA58A` fill and
looks fine, so **skip the gradient dep unless the CEO wants the exact two-stop fill** — Q9);
`letterSpacing` maps 1:1; `transformOrigin:"center bottom"` supported on our New-Arch RN (else
translateY-compensate).

### 4.1 Two color conflicts → CEO decisions (Q7)
1. **Workout tile colors.** `tokens.ts` `entryPalette.workout = {badgeBg:#F7E9DF, badgeInk:#C4704E}`
   (terracotta), but Home v2's workout tile is `#E7EDE1/#5F7A61` (green) — identical to
   `entryPalette.water`. Home v2 uses green for movement; the app currently uses terracotta.
   Decision: update `entryPalette.workout` to green to match v2, or let v2 override locally.
2. **Timeline dot colors** (`water #A9BC9B / meal #E0A375 / workout #8CA58A`) don't match any
   `entryPalette.*.line` field — v2's dots reuse the macro palette instead. Two parallel per-kind
   color systems. Pick one canonical source before building (else a later change touches two places).

These are cosmetic and low-effort; defaulting to **design fidelity (use the v2 values)** unblocks
the build, with `entryPalette` reconciled in the same ticket.

## 5. Top technical risks

### R1 — Timeline day-swipe vs tab-swipe (pager) on the same axis ⚠ highest risk
Both are full-width horizontal pans. The pager (`TabsPager.tsx`) activates at `activeOffsetX
±14` and commits via `snapTarget` (session-10 ±1-page snap); the timeline day-swipe commits at
`|dx|>70`. Left unresolved, **the pager activates first at 14px and the day-swipe never fires.**

**Resolution — the timeline wins inside its own bounds; the pager keeps the rest of Home:**
```ts
Gesture.Pan().activeOffsetX([-14,14]).failOffsetY([-18,18]).blocksExternalGesture(tabsPagerRef)
```
- `blocksExternalGesture(tabsPagerRef)` makes the pager wait for the timeline pan to fail — the
  exact pattern the Trends scrub already uses to coexist with the pager (`src/trends/scrub.tsx`).
- Same `activeOffsetX/failOffsetY` as the pager keeps feel consistent and preserves vertical
  scroll (vertical intent → the pan fails → ScrollView scrolls).
- **Consequence to state for the CEO:** you cannot swipe Home→Trends *starting on the timeline
  region* — a horizontal drag there means "change day". Tab switching stays available from the
  header/cards region above the timeline and from the nav pill. This mirrors the Trends-scrub
  precedent (the scrub area doesn't page either) — an accepted, shipped trade.
- The dock and the day-swipe are disjoint areas and don't conflict; the dock's touch-down
  activation wins inside its 44px row regardless.
- **Verification is device-only.** This class of bug (mid-gesture gesture recreation eating the
  swipe) has bitten this codebase twice (session 6, session 10) and does not reproduce under
  Jest. Requires an emulator pass — CEO-authorized, per house rule.

### R2 — Dock magnifier fidelity + performance
- **Performance is a non-issue if done right:** one `fingerX` shared value, 10 per-dot
  `useAnimatedStyle` worklets doing pure `exp()` math — trivially 60fps on the UI thread. The
  failure mode is doing it wrong: any `setState` per pointer-move (as the prototype does) would
  recreate the gesture and stutter. The spec's shared-value approach forbids that (§2.6).
- **Fidelity risk is the spring feel.** The CSS `cubic-bezier(.34,1.56,.64,1)` overshoot must be
  matched by a `withTiming(Easing.bezier(...))` or `withSpring` config that is **tuned against
  `screens/04` and `05`**, not guessed. Budget one iteration cycle for visual tuning.
- **`transform-origin: center bottom`**: dots must grow *upward*. Supported natively on our
  New-Arch RN via `transformOrigin`; if it misbehaves, fall back to translateY-compensation
  (tokens-table note). Verify on device.
- Haptic-per-crossing must fire from `onUpdate` via `runOnJS` on `lastIdx` change only — never
  per frame (would buzz continuously).

### R3 — Expand-in-place + day-change inside a ScrollView
- **Entrance/expand tweens must start from `onLayout`, not a bare `useEffect`** (`useStartOnLayout`)
  — session-6 pitfall: effect-scheduled `withTiming` races view attachment on cold boot and drops
  the animation. Applies to the entry stagger (`FadeIn.delay(i*60)`) and the day-change slide-in.
- **Never setState mid-gesture.** `dayDragX` is a shared value during the swipe; the React
  `selectedOffset` / expansion `Set` change only on discrete commits (`onEnd → runOnJS(goDay)`,
  or a tap). A day-commit re-render must not recreate a mid-flight gesture — keep gesture objects
  in stable `useMemo`.
- **Layout height on expand:** the current Home uses `Card layout={LinearTransition}` for the
  water/energy expanders — reuse that for a height tween on the timeline card expand rather than
  hand-animating height (an animated %-height on an absolute child never applied on-device,
  session 6). Multi-open expansion means the ScrollView content grows; that's fine, it's the outer
  scrollable.
- The whole timeline lives inside Home's vertical ScrollView; horizontal pan + vertical scroll are
  orthogonal (the `failOffsetY` yields vertical to the scroll), so **no `simultaneousWithExternalGesture`
  is needed** — exclusivity is the point.

## 6. Build tasks (Asana-ready)

Each row is a candidate Asana ticket. Sizes are relative (S/M/L). Model per DoD rule: Sonnet for
mechanical work, Opus for the gesture/worklet-heavy pieces. Ships as one epic **HOME-V2**.

| # | Ticket | Files | Depends on | Size | Model | Risk |
|---|---|---|---|---|---|---|
| 1 | **Tokens + i18n groundwork** — add the 39 NEW constants + `home.*` keys (dayToday/dayYesterday, timelineSummary plurals, fullDetails, todayReturn); resolve the 2 color conflicts per Q7 | `src/ui/tokens.ts`, `src/i18n/locales/en.json` | Q7 answered | S | Sonnet | low |
| 2 | **`dock.ts` pure math + test** — offset/index mapping, hoverIndex, Gaussian; assert-based self-check | `src/tabs/home/dock.ts`, `__tests__` | 1 | S | Sonnet | low |
| 3 | **`src/lib/haptics.ts` + expo-haptics** — 1-line wrapper, no-op fallback; add the dep | `src/lib/haptics.ts`, `package.json`, `app.config.ts` | — | S | Sonnet | low |
| 4 | **DockDatePicker component** ⭐ — 10 dots, per-dot Gaussian worklet, tooltip `vtTip`, haptics-per-crossing, drag/release springs, touch-down gesture, commit-on-release | `src/tabs/home/DockDatePicker.tsx` | 1,2,3 | L | Opus | **high** (R2) |
| 5 | **DaySection header** — label logic (Today/Yesterday/weekday+date), "Today ↺" pill, hosts the dock | `src/tabs/home/DaySection.tsx` | 4 | S | Sonnet | low |
| 6 | **Timeline v2 rows** — spine/gutter, water passive marker, meal/workout card, expand-in-place (multi-open), "Full details →" today-only routing | `src/tabs/home/Timeline.tsx` | 1 | M | Opus | med (R3) |
| 7 | **Timeline day-swipe gesture** — pan + elastic ends + slide-in, pager coexistence (`blocksExternalGesture`) | `src/tabs/home/Timeline.tsx` | 6 | M | Opus | **high** (R1) |
| 8 | **Home wiring** — `selectedDayOffset` state, day-aware timeline data (`entriesForDay(today-offset)`, summary counts), swap old `TimelineCard` for Timeline v2, mount DaySection+Dock; top cards stay pinned to today | `src/tabs/Home.tsx` | 4,5,6,7 | M | Opus | med |
| 9 | **Component/E2E tests + device pass** — RNTL for dock math/timeline data/expand; Maestro day-swipe smoke; **emulator gesture pass** (R1/R2 device-only, CEO-authorized) | `__tests__`, `.maestro/` | 8 | M | Opus | — |

**Phasing recommendation:**
- **Phase A (ships first, low risk, standalone value):** tasks 1–2 + 6 + 8-partial — the Timeline
  v2 rows with expand-in-place and the day-aware data layer, driven by a *plain* selector (dock
  tap or a simple prev/next), no magnifier yet. This lands the visible redesign and the SQLite
  10-day wiring with the lowest gesture risk.
- **Phase B:** task 7 — day-swipe gesture (the R1 pager-coexistence work) on top of the working
  timeline.
- **Phase C (the showpiece, highest risk):** tasks 3–5 — the dock magnifier + haptics + tooltip.
  Isolated behind `dock.ts`; can be tuned/iterated without touching the timeline.
- **Phase D:** task 9 — full test + emulator pass.

This ordering means the CEO can see and approve the timeline redesign before we invest in the
hardest interaction, and the dock can be perfected independently.

## 7. Open questions / product decisions for the CEO

1. **v2 replaces v1 Home, or a toggle?** The prototype exposes `home: "v1"|"v2"` as a Tweak.
   Recommendation: **replace** — v2 is a superset (same top cards + a better timeline + date
   browsing). A runtime toggle is speculative config (ponytail: skip unless you want an A/B).
2. **`menu` v1 vs v2 pill.** The handoff also ships a v2 floating mic/log **pill** (glass blur,
   66×56 slots). Our app already has a capture pill. Is the pill redesign **in scope for this
   Home-v2 work, or a separate ticket**? Recommendation: separate — it's orthogonal to the Home
   screen and touches the capture stack. Not included in the tasks above.
3. **Accent.** Default terracotta `#C4704E`; options `#8CA58A / #C98A3F / #D6926B` already in
   `tokens.ts`. Ship v2 on the default, keep the picker as-is? (No new decision needed unless you
   want the picker surfaced in v2.)
4. **Units.** Metric default; timeline summary + water render units-aware via existing
   `formatVolume`. No new decision — confirming the imperial water summary ("oz") is acceptable.
5. **"Full details →" — today-only, or any day?** Prototype restricts it to today. Our detail
   screens already work for any entry id, so enabling past days is free. Keep design fidelity
   (today-only) or allow all days?
6. **Flo cycle row.** The handoff has a `floConnected` cycle row. Flo is a **v2 integration** (not
   in v1 scope per CEO founding decision). Recommendation: **gate it off / don't build** now.
   Confirm.
7. **Two color conflicts (from tokens-table §Delta):** (a) workout tile green `#E7EDE1/#5F7A61`
   vs the app's current terracotta `entryPalette.workout`; (b) timeline dot colors reuse the macro
   palette, not `entryPalette.*.line`. Default: adopt the v2 values and reconcile `entryPalette`.
   OK?
8. **Border-opacity helper.** README uses one rgb at `.06/.10/.12`. Add `colors.borderAlpha(a)`
   vs three constants — a code-hygiene call, no product impact (defaulting to the helper).
9. **Water vessel gradient.** README wants a two-stop `#A9BC9B→#8CA58A` fill; our current vessel
   is a flat `#8CA58A`. Match exactly (needs `expo-linear-gradient` or two stacked views) or keep
   the flat fill? Recommendation: keep flat (ponytail — the difference is marginal, avoids a dep).
10. **Missing screenshots.** README cites `01-home-overview.png` and `02-water-card-expanded.png`
    that **are not in the handoff** (the 4 raw captures are Energy/nav-pill, dual-expanded
    timeline, macros popover, and the Habits screen). The top-section and expanded-water reference
    images are absent — we're building those from the README text + the existing v1 Home. Flag if
    the design team has newer captures.
11. **Macros popover.** The prototype's macros card opens a full "Macros today" popover that the
    README does not document. We already ship `MacrosSheet.tsx` (session 8) — assume it stands in
    for the popover; confirm no redesign is wanted here.

## 8. Philosophy check

- **No goals**: the dock browses history; no target/goal framing anywhere. The handoff's
  water vessel formula `waterPct = min(100, round(water/3000*100))` uses a fixed 3000 ml
  denominator — a constant vessel scale, not a goal, but our existing
  `WaterVessel` already solves this more carefully (`ml / max(2000, ml)` = visual
  fullness that can never read as a target). **Keep our formula**; noted in Q-list.
- **No scores/streaks**: day summary is a factual count ("N meals · M workouts · X ml
  water — counted from your logs"). Dots encode *which day is selected*, never
  completeness/quality of a day. No color coding by "how well" a day went — idle dots
  are all the same `#D9CFBD`.
- **No advice**: nothing in v2 suggests, recommends, or nudges.
- **Estimates labeled**: kcal hero keeps its "estimates" chip; per-entry kcal in expanded
  rows keep the estimate labeling used by detail screens; energy card copy unchanged.
- **Dual input**: day selection is reachable by dock-drag, dock-tap, AND timeline swipe;
  every expanded entry is also reachable via tap → detail screen. Voice/text capture
  unaffected.
