# Prototype-details pass — implementation spec (APP-051..057)

> **Produced by Fable (session 12) from a minute read of the full prototype source + frame-by-frame
> analysis of the CEO's screen recording of the prototype (37.7s, 2026-07-15).**
> Sources of truth, in order:
> 1. `docs/prototype/vita-prototype.dc.html` (line refs below are into this file)
> 2. CEO video (prototype recording) — confirmed timings/feel for the macro pop-up, trends fill, day scrub
> 3. `docs/home-v2/handoff/` — Home-specific surfaces only (already built, session 11)
>
> **CEO verdict driving this pass:** "ainda estamos bem longe do protótipo, principalmente em
> animações, gestos e pequenos detalhes como sombra em alguns botões." Two named bugs:
> the Macros card must open a **centered pop-up** (not a bottom sheet), and Trends must
> **fill its charts left-to-right on entry**.

---

## 0. Prototype motion vocabulary (the complete keyframe table)

All keyframes live at prototype lines 22–38. The app's `motion` tokens (`src/ui/tokens.ts`)
cover only `pop`/`unfold`/`fade`/`enter` — extend as needed per task, don't invent values.

| Keyframe | Definition | Duration/easing as used | App equivalent today |
|---|---|---|---|
| `vtIn` | fade + translateY(16→0) | .3–.5s ease | `motion.enter` (FadeInDown 350) ✅ |
| `vtFade` | fade + translateY(8→0) | .25–.5s ease, staggered | FadeIn/FadeInDown ✅ |
| `vtPop` | fade + scale(.92→1) | .3s ease / .35s cubic-bezier(.2,.8,.3,1) | `popIn` keyframe in `app/(main)/plan.tsx` (ad-hoc) |
| `vtWave` | scaleY .3↔1 loop | 1–1.05s infinite, per-bar delay | `VoiceOverlay` WaveBar ✅ |
| `vtBreath` | scale 1↔1.07 loop | 2.2–2.4s infinite | check-in badge — **verify present** |
| `vtDraw` | stroke-dashoffset→0 | 1.1s (hero waves) · 1.5–1.6s (trends curves) | WaveIllustration ✅ / trends curves **missing** |
| `vtArc` | donut arc sweep | .9s, delay 200+160·i ms | `Donut` — **verify delays** |
| `vtNextA/B` | translateX(52px) rotate(2deg)→0 | check-in card advance (A/B alternate to force restart) | **missing** |
| `vtDropOut` | →translateY(360px) | check-in dismissal | **missing** |
| `vtSlideInR/L` | translateX(±64)→0 | tab nav in prototype | N/A — app has a real pager (superior; keep) |
| `vtSheetUp/Out` | translateY(105%→0 / →112%) | sheet enter/exit | `useSheetTransition` ✅ (session 11) |
| `vtGrowY` | scaleY(0→1), origin bottom | .5–.55s ease, stagger below | `GrowBar` (450ms, wrong stagger, no replay) |
| `vtGrowX` | scaleX(0→1), origin left | .7s ease, delay i·80ms (micros) | **missing** (meal micros) |
| `vtBlob` | border-radius morph | 9s hero / 2.2s parse | `MorphBlob` ✅ |

**Press feedback (prototype `style-active`)**: every tappable scales on press with
`transition: transform .15s`. Calibration by surface size — small round buttons (mic, +250 ml,
steppers) `.94`; send/mid buttons `.95–.96`; CTAs and list-row buttons `.98`; large cards `.985`.
App's `PressScale` defaults to `.97` for everything — pass explicit `scale` per surface (P1-2).

---

## P0-1 · APP-051 — Macros opens a CENTERED pop-up, not a bottom sheet

**The CEO has flagged this in three sessions running; it has never been fixed correctly.**
`src/tabs/MacrosSheet.tsx` renders through `SheetOverlay` → slides up from the bottom.
The prototype (lines 1654–1680, `data-screen-label="Macros pop-up"`) and the video (t≈13.5–15s)
show a **vertically centered card popping in over a light blurred backdrop**:

- Overlay: `position:absolute; inset:0; z-index above tab pill; justify-content:center; padding: 0 26px`.
- Backdrop: **light cream scrim** `rgba(247,242,233,.45)` + `blur(13px)`, fade-in 250ms
  (`vtFade .25s`). NOTE: this is *not* the dark sheet scrim — `SheetBackdrop` already implements
  exactly this tint+blur; reuse it.
- Card: `#FFFDF7`, radius 26, padding 19–20, border `rgba(120,100,75,.08)`,
  shadow `0 20px 50px rgba(105,84,60,.20)` (≈ shadowColor `#69543C`, opacity .20, radius 30,
  offset y 12, elevation 10), entrance **`vtPop` 300ms ease** (scale .92→1 + fade).
- Dismiss: tap backdrop or the 30px X — no drag-handle, no drag-to-close. Exit: reverse fade+scale
  ~200ms (prototype unmounts; the app should animate out briefly, mirroring `popIn`).
- Content (keep what `MacrosSheet` already renders — title/count/X, 3 macro bars, dashed divider,
  "FROM YOUR MEALS" label, meal rows on `#FBF6EC` r14, footer caption). Macro bar fills animate
  width 400ms.

**Build it as a reusable `PopOverlay` in `src/ui/`** (sibling of `SheetOverlay`): centered card
chrome + backdrop + pop entrance/exit + `useSheetPresence` (hide tab pill). Then:
1. `MacrosSheet` → `PopOverlay` (file can rename to `MacrosPop.tsx`).
2. `app/(main)/plan.tsx` portion pop-up → same component (it already hand-rolls `popIn`; converge).
3. APP-053's check-in deck consumes a variant (darker scrim — see below).

Ladder note: this is a ~60-line component reusing `SheetBackdrop` + one Keyframe; no new deps.

## P0-2 · APP-052 — Trends charts must replay their left→right fill on every entry

**Root cause found (read this first):** `TabsPager` pre-mounts Trends after Home settles and keeps
it mounted (the session-6 swipe fix). `GrowBar` and `TrendCard`'s `FadeInDown` run **once, at
pre-mount, offscreen** — so by the time the user swipes/taps to Trends, the animation already
happened invisibly. The prototype re-runs the entrance every time the screen is shown
(video t≈27.5–29.7s: bars sweep up left→right on every visit).

Fix concept — **focus epoch**: when the pager's settled index makes Trends the active tab
(and it wasn't before), bump an epoch counter delivered via context; `FoodTab`/`ActivityTab` key
their chart containers (or reset GrowBar shared values) off that epoch so bars re-grow and cards
re-stagger. Constraints, non-negotiable (session-6 and session-11 lessons):
- **No setState mid-gesture, no work during the pan.** Derive the epoch from the settle
  (`runOnJS` after `withSpring` completes, or an effect on the route `pathname` — `pathname`
  already changes only on settle; prefer that: zero pager surgery).
- Do not remount the whole tab (SQLite queries re-run = jank); key only the chart/card subtrees.
- Replay also when switching Nutrition↔Activity inner tabs (prototype does: `vtFade` cards again).

Fidelity corrections while in there (`src/trends/parts.tsx`, `src/trends/FoodTab.tsx`):
- Stagger: **55ms per bar** for the 7-day window, **16ms** for 15/30 days
  (prototype `tDelay`, line 2618). App uses 30ms flat today.
- Grow duration: **550ms ease** (`vtGrowY .55s`); app has 450ms.
- Paired bars (consumed vs spent): both bars of a day share the day's delay (prototype
  `cp.delay`); app currently adds +60ms to the second — remove.
- Card entrance stagger: `vtFade .45s` with delays 0 / 30 / 60 / 120 / 180 / 240ms down the
  column (prototype lines 1112–1350). App has 0/60/120/180 — add the missing granularity.
- Curve variants (30-day kcal flow, consumed-vs-spent lines): stroke draw-on `vtDraw` 1.6s
  (kcal, delay .1s) and 1.5s (cvs, delays .1s/.25s) — currently the app draws them statically.
  SVG `strokeDasharray`/`strokeDashoffset` + Reanimated props, same technique as
  `WaveIllustration`'s draw-on; reuse it.

## P0-3 · APP-053 — Check-in deck: centered pop-up with stacked cards, advance & drop-out

Current `src/habits/CheckinSheet.tsx` is a bottom sheet. Prototype (lines 1712–1752) + video:
a **centered deck** (`align-items:center; justify-content:center; padding: 0 30px`):

- Backdrop: **dark** scrim `rgba(60,50,38,.38)` + `blur(4px)`, fade 250ms; backdrop opacity
  eases down while the card is dragged (tied to dragY, like sheets do today).
- Deck illusion: up to two "peek" strips behind the active card, both plain rounded rects:
  next+1 → `left/right +20px, top -21px, h 56, r22, #F1E8D7, shadow 0 8px 20px rgba(80,60,40,.10)`;
  next → `left/right +10px, top -11px, h 66, r24, #F8F0E1, shadow 0 10px 24px rgba(80,60,40,.12)`.
  They render only while more check-ins wait.
- Active card: `#FFFDF7`, r28, padding 18/20/20, **shadow 0 26px 60px rgba(60,45,30,.30)**
  (much deeper than a normal card), drag handle 40×4.5.
- Card content: uppercase accent habit label + "n of m" counter; 20px question; muted time line;
  plan check-ins add the plan-lunch summary box (`#FBF6EC` r14); Yes (accent, flex 1.25, shadow
  accent 35%) / No (outline, flex 1); caption "swipe down to dismiss".
- **Advance animation**: answering slides the next card in from the right —
  `translateX(52px) rotate(2deg) → none`, ~350ms ease (prototype alternates two identical
  keyframes `vtNextA`/`vtNextB` to force a restart; in Reanimated just re-key the card).
- **Dismiss**: drag down; threshold **90px** (sheets use 110). Past it → `vtDropOut`
  (translateY→360px + fade, ~300ms) and close (270ms total teardown). Under it → spring back
  (critically damped — same rule as APP-050, no bounce).
- **Done state**: after the last answer the card content swaps to the "All caught up" check
  (`vtPop` .3s) and the pop-up closes itself after **1100ms**.
- "Not quite" on a plan check-in: close deck (270ms), then open capture 300ms later
  (prototype `ckAnswerM`, line 2314) — the app already routes to capture; keep the beat.

Reuse: `PopOverlay` (P0-1) with `scrim="dark"`; the drag logic is `useSheetDrag`'s pattern with a
90px threshold and a drop-out instead of slide-down — extract, don't duplicate.
`CheckinQuestion` (shared with Habits→Today inline cards) keeps working inline unchanged.

---

## P1 · APP-054 — Shadow pass: buttons, toggles, chips (the CEO's "sombra em alguns botões")

`src/ui/Button.tsx` and `src/ui/Toggle.tsx` currently have **no shadows at all**. The prototype
shadows every raised control. Add to `tokens.ts` (extend the `shadow` family) and apply:

| Surface | Prototype shadow | Token suggestion |
|---|---|---|
| Accent CTA (primary Button) | `0 10px 22px accent@35%` (large hero CTA `0 14px 30px accent@40%`) | `shadowCta(accent)` — shadowColor accent, opacity .35, radius 14, offset y 8, elevation 5 |
| Small accent send/mic buttons | `0 8–10px 18–22px accent@35–40%` | same token, radius 12 |
| Light/neutral buttons & inputs | `0 6px 18px rgba(105,84,60,.07)` | `shadowSoft` |
| Dark buttons (Apple, toast) | `0 10px 24px rgba(60,45,30,.28)` | `shadowDark` |
| Toggle knob | `0 2px 6px rgba(60,45,30,.25)` | inline on `Toggle` |
| Banner "Review" chip (Home) | `0 4px 10px rgba(160,100,60,.10)` | inline |
| Check-in banner card | `0 10px 24px rgba(160,100,60,.12)` | verify present |
| Pop-up card | `0 20px 50px rgba(105,84,60,.20)` | in `PopOverlay` (P0-1) |
| Check-in active card | `0 26px 60px rgba(60,45,30,.30)` | in APP-053 |

Outline/ghost buttons and text links stay flat (prototype does too). Android: pick elevations
that read similar (3–6); verify on emulator, not just iOS-style shadow props.

## P1 · APP-055 — Toast

The prototype confirms nearly every action with a toast the app doesn't have at all
(lines 1871–1875 + `toast()` line 2364): "Plan lunch added to your day", "Habit removed",
"Vacation mode on — …", "Added from your photo — ~N kcal", "Reminder added — linked to your plan".

- Dark pill: `#453E35` bg, `#F7F0E4` ink, r18, padding 10/18, 13px semibold, single line
  ellipsized, shadow `0 12px 30px rgba(60,45,30,.3)`.
- Position: bottom 122px (above the pill/tab bar), centered, `pointer-events: none`.
- Motion: `vtFade` 250ms in; auto-hide after **2200ms**; a new toast replaces the current one
  (reset timer).
- One module-level `showToast(text)` + a host component in the root layout — no context plumbing,
  mirror `sheetPresence`'s pattern. i18n keys for every message.
- Wire the prototype's trigger set: habit save/remove, plan check-in "Yes", photo confirm
  (meal + routine), vacation start/end, offline-review keep/discard batches if trivially reachable.

## P1 · APP-056 — Press-scale & micro-transition calibration

- Parametrize `PressScale` per surface class (see §0 calibration). Sweep: `Button` (.96 default,
  .98 for full-width CTAs), quick-add water (.94), mic (.94), steppers (.94), cards (.985),
  list rows (opacity .6 on press — prototype uses opacity for rows, not scale: lines 721, 1070).
- Chevron rotations, toggle knob/track, tab-chip color swaps: 250ms (`transition .25s`) — audit
  `Chevron`, `Toggle`, period/tab chips for 200 vs 250.
- Water vessel fill: height tween **600ms ease** (line 447) — verify current value.
- Home macro-card bars: width 600ms; pop-up bars 400ms.
- Energy in/out bars: width 500ms.

## P2 · APP-057 — Detail-screen entrance choreography (only after P0/P1 land)

Meal detail (lines 548–624): hero card `vtFade .45s`, phrase +60ms, items card +100ms with rows
staggered ~i·80ms, donut card +160ms with `vtArc` segs at 200+160·i ms, micros `vtGrowX .7s`
i·80ms, hero stroke draw 1.1s +150ms. Workout detail: body-view flip cross-fade 300ms, muscle
opacity 300ms, selected-muscle chip `vtPop`, exercise-row highlight bg 300ms. Account screen:
rows `vtFade .45s` staggered 50ms steps (lines 938–1029). Onboarding: option cards i·70ms,
goal chips i·60ms, connect tiles i·55ms. Verify each against what sessions 6–8 already built —
this is a diff-pass, not a rebuild; several are done.

---

## Gesture rules (unchanged, enforce)

- **Do not touch `TabsPager`'s gesture or mounting logic** beyond reading the settled route for
  the APP-052 focus epoch. R1 (timeline-swipe vs pager) and the snapTarget fix are device-verified;
  regressions there cost more than any animation buys.
- Sheet dismiss threshold stays 110px; check-in deck uses 90px; spring-backs critically damped
  (`damping: 30` convention from APP-050) — no underdamped bounce anywhere.
- Scrub overlays only mount on open cards (CEO bug #6 rule) — the replay epoch must not change this.

## Verification gates

1. `npx tsc --noEmit` clean · Jest suite green (extend: PopOverlay renders/dismisses, toast
   auto-hide timer, focus-epoch bumps only on settle, check-in queue advance).
2. **Emulator drive (mandatory for each P0):**
   - Home → tap Macros card → centered pop-up scales in over blurred Home; backdrop tap closes.
   - Home → Trends (tap AND swipe): bars sweep left→right every entry; switch to Activity and
     back: replay; scrub still works; tab swipe unaffected.
   - Home banner → check-in deck: peek cards visible with 2+ pending; answer → next slides in
     from the right with slight rotation; drag down 100px+ → drops out; last answer → "All caught
     up" → auto-close.
   - Shadows: eyeball Button/Toggle/pill on the emulator (Android elevation, not iOS-only props).
3. Update `app/Progress/` ledger; Asana tickets APP-051..057 (Model: Opus for 051/052/053 —
   gesture/animation risk; Sonnet fine for 054/055/056/057).

## Explicitly out of scope

- Tab-to-tab slide animation (`vtSlideInR/L`) — the app's real pager is better than the
  prototype's fake; keep.
- Home v2 dock/timeline — session 11, device-verified; don't touch except where a shadow token
  lands.
- Backend — zero contract change in this pass.
