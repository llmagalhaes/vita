# Home v2 — exact mechanics extracted from `handoff/Vita Prototype v2.dc.html`

Scratch input for the implementation spec. Line numbers refer to `Vita Prototype v2.dc.html`. `support.js` = prototype runtime, ignored. Home v2 markup: `homeV2On` blocks (lines 525–594 cards, 623–694 dock+timeline); logic: `renderVals()` homeV2 section (lines 3327–3439).

## a) Dock date picker

### Geometry (line 631, 637)
- Row: `display:flex; align-items:flex-end; height:44px; padding:0 6px; touch-action:none; cursor:grab` (`grabbing` while active). Pointer handlers on the ROW: `onPointerDown/Move/Up/Leave` (leave = up).
- 10 slots, each `flex:1`, column, `justify-content:flex-end`, full height, `position:relative`.
- Dot: `width:7px; height:7px; border-radius:50%; transform-origin:center bottom; pointer-events:none`.
- Constants (line 3336): `MAXD = 9, NDAYS = 10`. Fallback row width before first measure: `{ width: 322 }` (line 3374).

### Gaussian math (lines 3374–3398) — verbatim
```js
const slot = rect.width / NDAYS;
const selCX = ((NDAYS - 1 - dOff) + 0.5) * slot;              // idle finger-x = selected dot center
const x = (dpkOn && s.dpkX != null) ? s.dpkX : selCX;
const spread = slot * 1.25;
let hoverIdx = Math.round(x / slot - 0.5);                     // clamped [0, 9]
// per dot i:
const off = (NDAYS - 1) - i;                                   // day mapping i → 9−i (0 = today, rightmost)
const ci = (i + 0.5) * slot;                                   // dot center x
const d = Math.abs(x - ci);
const mag = Math.exp(-(d / spread) * (d / spread));            // e^-(d/spread)²
const isSel = !dpkOn && off === dOff;
const isHover = dpkOn && i === hoverIdx;
const scale = dpkOn ? (1 + 1.15 * mag) : (isSel ? 1.85 : 1);   // peak ≈ 2.15×; idle selected 1.85×
const ty = dpkOn ? -(13 * mag) : 0;                            // lift, px (origin bottom → grows upward)
const near = dpkOn && mag > 0.14;                              // tint threshold
bg = active ? 'var(--accent)'
   : near   ? `color-mix(in oklab, var(--accent) ${Math.round(mag * 60)}%, #D9CFBD)`
   :          '#D9CFBD';
op = dpkOn ? (0.5 + 0.5 * mag).toFixed(2) : (isSel ? '1' : '0.85');
```
README formula `scale = 1 + 1.15*exp(-(d/spread)^2)`, `spread = slot*1.25`, `slot = rowWidth/10` — **verified exact**.

### Drag vs release transitions (line 3401)
```js
dpkTrans: dpkOn ? 'none'   // 1:1 finger tracking during drag
                : 'transform .55s cubic-bezier(.34,1.56,.64,1), background .3s, opacity .3s'
```

### Tooltip (lines 634–635 + keyframes line 29) — verbatim
- Shown on the hover dot only (`tipOn: isHover`), text = `dayDates[off]` (static per dot).
- Pill: `position:absolute; left:50%; bottom:26px; transform:translateX(-50%); background:var(--accent); color:#FFF9F1; font:800 10.5px Nunito; letter-spacing:.3px; white-space:nowrap; padding:4px 9px; border-radius:9px; box-shadow:0 6px 16px rgba(120,80,50,.28); animation:vtTip .32s cubic-bezier(.34,1.56,.64,1) both; pointer-events:none`.
- Triangle: `left:50%; top:100%; translateX(-50%); border-left:4px solid transparent; border-right:4px solid transparent; border-top:5px solid var(--accent)`.
```css
@keyframes vtTip{
  0%  {opacity:0;transform:translateX(-50%) translateY(7px)  scale(.5)}
  55% {opacity:1;transform:translateX(-50%) translateY(-3px) scale(1.08)}
  100%{opacity:1;transform:translateX(-50%) translateY(0)    scale(1)}
}
```
(README omits the persistent `translateX(-50%)`.)

### Pointer handling + haptics (lines 3402–3427) — verbatim
```js
dpkPD: e2 => {
  e2.stopPropagation(); this._sw = null;
  const r = e2.currentTarget.getBoundingClientRect();
  this._dpkRect = { left: r.left, width: r.width };
  this.dpkLast = null;                                   // haptic tracker reset
  this.setState({ dpkOn: true, dpkX: e2.clientX - r.left });   // ← active from pointerDOWN
},
dpkPM: e2 => {
  if (!this.state.dpkOn) return; e2.stopPropagation();
  const r = this._dpkRect, xx = Math.max(0, Math.min(r.width, e2.clientX - r.left)); // clamped to row
  const sl = r.width / NDAYS;
  let idx = Math.max(0, Math.min(NDAYS - 1, Math.round(xx / sl - 0.5)));
  if (idx !== this.dpkLast) { this.dpkLast = idx; if (navigator.vibrate) navigator.vibrate(7); }  // once per crossing
  this.setState({ dpkX: xx });
},
dpkPU: e2 => {
  ...; if (!this.state.dpkOn) return;
  const xx = this.state.dpkX != null ? this.state.dpkX : selCX;
  let idx = Math.max(0, Math.min(NDAYS - 1, Math.round(xx / sl - 0.5)));
  const off = (NDAYS - 1) - idx;
  const dir = off > dOff ? 'older' : off < dOff ? 'newer' : null;
  this.setState({ dpkOn: false, dpkX: null });
  if (off !== dOff) goDay(off, dir);                    // commit only on release, only if changed
}
```
- Haptic-once-per-crossing: instance field `dpkLast` (last hover index), reset to `null` on down → first move over a dot also vibrates. `vibrate(7)` = 7 ms.
- `goDay(off, dir)` (line 3364): `setState({ dayOff: off, dayDragX: 0, dayNavN: n+1, dayDir: dir })`.
- "Today ↺" pill (line 628): shown when `dOff > 0` (`dayBackOn`); `backToToday: () => goDay(0, 'newer')`. Style: `background:color-mix(in oklab,var(--accent) 10%,#FFFDF7); color:var(--accent); font:800 10px; letter-spacing:.6px; uppercase; border-radius:11px; padding:4px 9px; animation:vtFade .25s ease both`.

## b) Timeline

### Day swipe (lines 641, 3431–3435) — verbatim
Wrapper: `transform:translateX({{dayDragX}}); transition:{{dayDragTr}}; touch-action:pan-y`.
```js
dayDragX: (s.dayDragX || 0) + 'px',
dayDragTr: s.dayDragging ? 'none' : 'transform .25s ease',   // snap-back tween on release
dayPD: e2 => { e2.stopPropagation(); this._sw = null; this.dayDragX0 = e2.clientX; this.setState({ dayDragging: true }); },
dayPM: e2 => { if (!this.state.dayDragging) return;
  let dx = e2.clientX - this.dayDragX0; const o = this.state.dayOff || 0;
  if ((o === 0 && dx < 0) || (o === MAXD && dx > 0)) dx = dx / 3.5;   // elastic 1/3.5 at both ends only
  this.setState({ dayDragX: dx }); },
dayPU: e2 => { ...; const dx = this.state.dayDragX || 0, o = this.state.dayOff || 0;
  this.daySwiped = Math.abs(dx) > 12;                                  // >12px suppresses the next tap
  if (dx > 70 && o < MAXD) goDay(o + 1, 'older');                      // drag right → older
  else if (dx < -70 && o > 0) goDay(o - 1, 'newer');                   // drag left → newer
  else this.setState({ dayDragX: 0 });
  this.setState({ dayDragging: false }); }
```
Tap suppression consumer (line 3350): `toggle: () => { if (this.daySwiped) { this.daySwiped = false; return; } tgl(ek)(); }`.

### Day-change slide (lines 25–28, 3430)
```css
@keyframes vtDayL {from{opacity:0;transform:translateX(-34px)}to{opacity:1;transform:none}}
@keyframes vtDayL2{from{opacity:0;transform:translateX(-34px)}to{opacity:1;transform:none}}
@keyframes vtDayR {from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:none}}
@keyframes vtDayR2{from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:none}}
```
`dayAnim`: `older → vtDayL(/L2)`, `newer → vtDayR(/R2)`, `.32s ease both`; the `2`-suffixed duplicates alternate via `dayNavN % 2` purely to restart the CSS animation on repeated same-direction navs — **irrelevant in Reanimated** (retrigger explicitly).

### Header label / summary (lines 3362–3369)
```js
const dayNames = ['Today','Yesterday','Wednesday','Tuesday','Monday','Sunday','Saturday','Friday','Thursday','Wednesday'];
const dayDates = ['Jul 11','Jul 10','Jul 9','Jul 8','Jul 7','Jul 6','Jul 5','Jul 4','Jul 3','Jul 2'];
```
Indexed by `dayOff` (0 = today). Real impl: offsets 0/1 → "Today"/"Yesterday", else weekday name; date always short "Mon D".
Summary (line 3368): `` `${nMeals} meal(s) · ${nWk} workout(s) · ${wml} ml water — counted from your logs` `` — singular/plural per count; imperial: `Math.round(wml / 29.5735) + ' oz'`; water total parsed from `parseInt(e.meta)` of water entries.

### Entry row structure (lines 646–690)
- Row: `display:flex; gap:11px`, stagger `animation-delay: i*60ms`, `anim: vtFade .45s ease both` (`vtFade` = fade + 8px rise, line 23). Just-added entry (today only): `vtPop .5s ease both` + bg `color-mix(in oklab,var(--accent) 9%,#FFFDF7)`.
- Time gutter: `width:38px; text-align:right; font 10.5px/700 #B7AB9C; padding-top:16px`.
- Spine column: `width:12px`; dot `10×10, border-radius:50%, border:2px solid #FFF9F1, box-shadow:0 0 0 1.5px rgba(120,100,75,.14), margin-top:16px`; rail below `width:2px; flex:1; background:rgba(120,100,75,.10)`.
- Dot colors (line 3346): water `#A9BC9B`, meal `#E0A375`, workout `#8CA58A`.
- **Water** (passive, no card): `gap:7px; padding:8px 2px 2px; font 11.5px/700 #7E9480` — 11×13 drop SVG (`#A9BC9B`) + `{meta}` + `· {sub}` muted.
- **Meal/workout card**: `#FFFDF7; border:1px rgba(120,100,75,.07); radius 20px; padding:12px 14px; shadow 0 8px 20px rgba(105,84,60,.07)`; active scale `.985`. Inside: 34px tile radius 12 (meal `#F7E7D4`/`#A66A3F`, workout `#E7EDE1`/`#5F7A61`), title 15px/700 `#453E35`, sub 11.5px `#8A7E70` ellipsized, badge chip (same tint pair as tile, radius 13, `5px 10px`, 11.5px/800), chevron rotating 180° when open.
- **Expanded** (in place, per-entry toggle, multi-open allowed via `homeOpen['e_'+dOff+'_'+id]`): dashed top border `1px dashed rgba(120,100,75,.16); margin-top:11px; padding-top:11px; animation:vtFade .25s`; chips row (10.5px/800 `#6E6355` on `#F3EBDD`, radius 11, `4px 9px`) — meals `['P 24 g','C 38 g','F 21 g']`, workouts fallback `['52 min','6 exercises','via Garmin']`; item rows name/kcal 12px; **`Full details →`** accent link only when `detailOn: !isWater && dOff === 0` → routes to real Meal/Workout detail.

## c) Sample data shapes — verbatim

Today (`tl`, line 2087; today entries carry `mealId` → chips/items resolved from `this.meals` / `this.mealItems`):
```js
{ id: 'b',  t: '07:40', kind: 'meal',    title: 'Breakfast', sub: 'Eggs, toast & latte', meta: '~430 kcal', mealId: 'breakfast' },
{ id: 'w1', t: '08:10', kind: 'water',   title: 'Water',     sub: 'Logged by voice',     meta: '250 ml' },
{ id: 'g',  t: '09:30', kind: 'workout', title: 'Leg day',   sub: 'via Garmin · 52 min', meta: '~430 kcal' },
```
Past days (`tlDays`, keyed 1–9, line 2165; P/C/F + items inline):
```js
tlDays = { 1: [
  { t: '08:05', kind: 'meal', title: 'Breakfast', sub: 'Oatmeal, berries & coffee', meta: '~380 kcal',
    P: 14, C: 58, F: 9, items: [['Oatmeal','~220 kcal'],['Berries','~60 kcal'],['Coffee w/ milk','~100 kcal']] },
  { t: '10:20', kind: 'water', title: 'Water', sub: 'Quick add', meta: '500 ml' },
  { t: '18:30', kind: 'workout', title: 'Easy run', sub: 'via Strava · 34 min', meta: '~310 kcal',
    chips: ['34 min','5.2 km','via Strava'], items: [['Warm-up','8 min'],['Steady pace','22 min'],['Cool-down','4 min']] },
  ...], ... }
```
`dayNames` / `dayDates`: see §b above. Workout `wkItems` fallback (line 3335): `[['Back squat','4 × 8'],['Romanian deadlift','4 × 10'],['Leg press','3 × 12'],['Leg curl','3 × 12']]`.

## d) HTML details the README omits or under-specifies

- **Kcal hero** (lines 441–446): centered, `padding:10px 0 2px`; number 82px/200, letter-spacing −2.5px, line-height 1, `#453E35`; caption row gap 8, "kcal logged today" 13.5px `#8A7E70` + `ESTIMATES` chip 9.5px/800 on `#F7E7D4`/`#A66A3F`, radius 8, `3px 7px`. Shared between v1/v2 (outside the `homeV2On` ifs).
- **Header** (lines 408–414): greeting 21px/700 + date 13px `#8A7E70`; four 36px round icon buttons (Trends, Habits, Integrations, Settings) `#FFFDF7`, border `1px rgba(120,100,75,.12)`, ink `#6E6355`. Shared with v1.
- **Water card v2** (527–550): identical chrome to v1 block; expanded log rows = 6px green dot + `wl.meta` + `wl.t`, plus a **"See trends →"** accent link (README's §Water card omits the link, its screenshots list mentions it).
- **Macros card** (552–559): whole card is a `<button>` → `openMacroPop`. The **macros popover itself** ("Macros today", per-macro bars, "FROM YOUR MEALS" rows, "estimates from your descriptions" footer) is entirely undocumented in README — see screens-analysis §17.15.20.
- **Energy card** (562–592): expanded state = `Last 7 days` / `in vs out` header, 52px-tall paired 7px bars (`homePairs`, heights `hIn/hOut` %), day letters 9px, "See trends →".
- **Eating-plan row** (517–523): v1-only (inside `homeV1On`), NOT part of Home v2 — v2 replaces it with `plan2*` vals consumed elsewhere (plan check-in rows use `loggedK = { Breakfast: '~430', Snack: '~170' }` to mark logged meals, line 3365/3442).
- **Menu v2 pill** (1991–2018): floating, `border-radius:36px; padding:6px; rgba(255,253,247,.82) + backdrop-filter:blur(18px); border 1px rgba(120,100,75,.10); shadow 0 18px 44px rgba(105,84,60,.20); vtPop .35s cubic-bezier(.2,.8,.3,1)`, inside a bottom gradient scrim (`rgba(247,242,233,0) → .92`). Slots 66×56 radius 28: mic "Log" (accent) + collapsible text-input+camera section (`max-width`/`opacity` tweens `.45s cubic-bezier(.22,.9,.32,1)`) + Today/Trends/Habits nav (active slot gets tinted bg). `pillOn` on home/trends/workout/habits/integrations/settings when `menu==='v2'`.
- **Commit-on-release only**: nothing below the dock updates mid-drag (screenshot 04 confirms).
- During dock drag the **idle selected 1.85× scale is dropped** — all dots run pure Gaussian.
- Day slide animation applies to a wrapper that includes the **summary line + entries** but NOT the dock or the header label row (header label just swaps text).
- Expansion state is keyed per day (`'e_' + dOff + '_' + id`) — collapse state isn't shared across days, and reopening a day restores its previous open cards.

---

# Gesture composition judgment (Staff review)

Context: all three tabs live in `src/nav/TabsPager.tsx` — one full-screen `Gesture.Pan().withRef(tabsPagerRef).activeOffsetX([-14,14]).failOffsetY([-18,18])`; inner horizontal gestures win via `.blocksExternalGesture(tabsPagerRef)` (`src/nav/pagerRef.ts`), the pattern already proven by the Trends scrub. Session-10 snapping is `snapTarget` (±1 page). Home v2 adds two horizontal gestures inside Home's vertical ScrollView.

## 1. Dock drag — own the touch from touch-down
The prototype uses `touch-action:none` and activates in `pointerdown` (`dpkPD` sets `dpkOn:true` immediately). Requiring horizontal intent would break the design: tapping-and-holding a dot must magnify instantly, and a *vertical* wiggle mid-drag must not hand the touch to the ScrollView. Compose:

```ts
const dockPan = Gesture.Pan()
  .manualActivation(true)
  .onTouchesDown((_, mgr) => mgr.activate())        // own from touch-down, like touch-action:none
  .shouldCancelWhenOutside(false)                    // finger may drift above the 44px row mid-drag
  .blocksExternalGesture(tabsPagerRef)               // pager waits for us within the row
  .onBegin(...).onUpdate(...).onFinalize(...);       // finalize = release commit (also covers cancel)
```
- Immediate activation preempts the ScrollView too (once active, scroll can't claim). Cost: a vertical scroll *started on the 44px row* is dead. The prototype makes exactly this trade; accept it — the row is one thin strip.
- Do NOT give it `activeOffsetX` — that reintroduces the "dead until 10px" feel and lets the pager race it.
- Clamp x to `[0, rowWidth]` as the prototype does; row width comes from `onLayout` into a shared value (`slot`, `spread` derived on the UI thread).

## 2. Timeline day-swipe vs tab-swipe — the real fight
Both are full-width horizontal pans with similar thresholds (timeline commits at |dx| > 70; pager activates at ±14 and commits at half-page/flick). Unresolved, the pager activates first at 14px and the day-swipe never fires. **Resolution: the timeline wins inside its own bounds; the pager keeps the rest of Home.**

```ts
const daySwipe = Gesture.Pan()
  .activeOffsetX([-14, 14])          // mirror the pager's own horizontal-intent gate
  .failOffsetY([-18, 18])            // vertical intent → fail → ScrollView scrolls
  .blocksExternalGesture(tabsPagerRef);
```
- Same offsets as the pager keep the feel consistent and preserve vertical scrolling (this exact pair already coexists with ScrollViews app-wide).
- Consequence to state in the spec: **you cannot swipe Home→Trends starting on the timeline region** — by design, a horizontal drag there means "change day". Tab changes remain available from the header/cards region and the nav pill. This mirrors the Trends-scrub precedent (scrub area doesn't page either).
- The prototype's `>12px suppresses tap` flag (`daySwiped`) is unnecessary in RN: the day-swipe pan activating at 14px cancels child `Pressable` touches automatically. Do not port the flag.
- Elastic ends: apply `dx/3.5` in `onUpdate` on the UI thread when `(dayOff===0 && dx<0) || (dayOff===9 && dx>0)`; snap back with `withTiming(0, {duration:250})` (prototype `transform .25s ease`), slide-in of the new day content `±34px → 0, .32s ease` triggered after the JS-side day commit.
- Dock vs day-swipe don't conflict: disjoint areas, and the dock's touch-down activation wins inside its row anyway.

## 3. Dock magnifier as a UI-thread worklet — yes, entirely
- One shared value `fingerX` (plus `dragging: boolean`, `rowWidth`). Each of the 10 dots gets a `useAnimatedStyle` computing `mag = Math.exp(-((fingerX - ci)/spread)**2)` → `scale`, `translateY`, `opacity` — pure math, 10 styles, trivially 60fps. Color-mix: precompute the accent↔`#D9CFBD` ramp with `interpolateColor(mag, [0.14, 1], [dotIdle, accent])`.
- **Release spring**: don't animate `fingerX` — flip `dragging` off and let each dot's style target its idle value via `withTiming(…, { duration: 550, easing: Easing.bezier(0.34, 1.56, 0.64, 1) })` (bezier overshoot ≈ the CSS spring); idle selected dot targets 1.85.
- **Haptics per crossing**: track `lastIdx` in a shared value inside `onUpdate`; on change, `runOnJS(Haptics.selectionAsync)()` (expo-haptics ≈ `vibrate(7)`). Never call haptics directly from the worklet.
- **Tooltip**: per-dot label text is *static* (`dayDates[9-i]`) — render all 10 tooltip nodes and toggle visibility/scale per dot on the UI thread from `fingerX`-derived hover index. Zero mid-gesture setState; the vtTip pop runs as an animated style keyed on "became hover".

## 4. ScrollView interplay
- Home's vertical ScrollView is the outer scrollable; both new gestures live inside it.
  - Dock: immediate activation settles it — no `simultaneousWithExternalGesture`, no `waitFor` needed; the scroll simply never activates for touches the dock claimed.
  - Day-swipe: `failOffsetY ±18` yields to the scroll on vertical intent; horizontal pan and vertical scroll are orthogonal so no `simultaneousWithExternalGesture` is needed (same as the pager itself over tab ScrollViews today). If the ScrollView is RNGH's, no extra wiring; if RN's, this still works because pan activation cancels the responder.
- Neither gesture should be `simultaneous` with anything — exclusivity is the point.

## 5. Codebase pitfalls to respect (session ledgers — non-negotiable)
- **Never setState mid-gesture**: the prototype re-renders per pointermove (`setState({dpkX})`, `setState({dayDragX})`) — do NOT port. All continuous values (fingerX, dayDragX) are shared values; React state changes only on commit (`onEnd`/`onFinalize` → `runOnJS(goDay)`), matching how a mid-gesture re-render recreated the pager pan and ate swipes (session 6, and the reason `TabsPager` pre-mounts neighbors off-gesture).
- **Mount tweens from `onLayout`, not bare `useEffect`** (`useStartOnLayout`): the entry stagger (`vtFade`, delay `i*60ms`) and day slide-in must start on layout or they drop on cold boot.
- **`runOnJS` for every JS call from worklets**: haptics, `goDay`, router pushes from "Full details →".
- Keep both new gestures' objects stable across re-renders (deps-correct `useMemo` or define outside render-driven churn) — a day-commit re-render must not recreate a mid-flight gesture.
