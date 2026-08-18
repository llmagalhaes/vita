# Handoff: Vita v4 — final (Trends | Day | Library, scenic home, interactive muscle & habit detail)

## Overview
Vita is a **quiet log of meals, water & movement** — an all-in-one personal health dashboard with **no coach**: no goals, no scores, no streaks, no advice, no judgment. v4 is a structural rethink of v3 plus several interaction rounds. Android-first, one-handed, seconds-long sessions.

## About the design files
`Vita Prototype v4.dc.html` (+ runtime `support.js`) is a **design reference authored in HTML** — an executable spec of look and behavior, not production code. Recreate in the target codebase (React Native) with its own patterns, lifting the exact values below. `meal-plan.pdf` is the real nutritionist source document (anonymize before committing).

Tweaks panel (demo state): `homeStyle` (**scenic** / classic — compare the two home headers), `daytime` (morning / afternoon / evening), `composition` (everything / meals only), `screen` (app / onboarding / day-close notification).

---

## 1 · What changed v3 → v4

### Structure
- **Flat 6-screen carousel → three panels: Trends | Day | Library.** Edge-swipe (start within 34px of either edge, ≥8px horizontal, vertical veto if |dy|>12 && |dy|>1.1·|dx|) drags panels 1:1; commit at |dx| ≥ 90px, else spring back. Snap transition `transform .45s cubic-bezier(.22,.9,.32,1)`; `transition:none` while dragging; rubber-band ÷3.5 beyond the ends. On Trends/Library the whole surface drags back; on Day only the edges start a pan (dock and charts own mid-screen gestures). Day travel **never** uses content swipe — only the dock date picker + calendar sheet.
- **Panel tabs** (top, floating): frosted segmented control — container `rgba(255,253,247,.55)` + `backdrop-filter:blur(14px) saturate(1.4)`, border `rgba(120,100,75,.12)`, radius 20, padding 3; active chip `#FFFDF7`, radius 16, padding 6×13, shadow `0 3px 8px rgba(105,84,60,.14)`, label 9.5/800 uppercase ls 1.2 — active ink `var(--accent)`, idle `#8A7E70`. On dark scenes (scenic evening) container `rgba(40,34,28,.30)`, border `rgba(255,253,247,.22)`, active chip `rgba(255,253,247,.20)`, inks `#F7F0E4` / `rgba(247,240,228,.65)`.
- **Home v3 (timeline screen + separate plan screen) → one Day** with two labeled zones, **Overview on top** (Water, Macros, Habits, Weight) then **"Your day"** timeline (meals + workout chronologically, Close-the-day as final node). Zone labels 11.5/800 uppercase ls 1.4 `#B7AB9C`.
- **Onboarding 5 steps → 2** (name → what to keep). Plan/program imports moved to Library / empty states.
- **Fake surfaces removed**: Integrations screen (→ one real Health Connect toggle row), Garmin energy card, per-meal check-in notifications (→ single day-close notification), fake "what to monitor" menu (→ real composition flags), "Fix something" ghost link, "+N more" toast (→ real searchable swap sheet), Flo cycle row.
- **Day record model (pillar 1)**: meals born `planned`; user action moves them to `done`/`adjusted`/`skipped`; evening **Close the day** card + lock notification confirm the rest in one tap; untouched days stay **unrecorded** (neutral, phrased as absence); retro-close available on any dock/calendar day with honesty caption.
- **New in v4 rounds**: scenic home with parallax; account section; add-meal and add-habit forms; interactive Trends (scrub + pin + detail cards); muscle map everywhere (workout card, past days, Trends) with per-muscle bottom sheet; habit detail sheet (Loop-inspired, counters only); frosted capture pill.

### Kept sacred from v2/v3
PDF plan import flow · dock date picker · portion slider modal · voice/text/photo capture (now plan-delta based) · vacation mode · export · undo-toast pattern.

---

## 2 · Design tokens (complete)

### Base palette
- Canvas / panel bg `#F7F2E9` · sheet bg `#FBF6EC` · card bg `#FFFDF7` · input bg `#FBF6EC`
- Ink `#453E35` (headings) / `#4A4238` (body) · muted `#6E6355` · secondary `#8A7E70` · faint `#B7AB9C` · disabled/sand `#CFC5B4`, `#D9CFBD`, `#E4DCCB`
- Accent `#C4704E` (links hover `#A85A3B`) · vacation accent `#3E8FA3` (pair bg `#E3EEF0`, banner `#EAF3F4→#DFECEE`, ink `#3A4C51`/`#6B8087`)
- Green (done/water): bg `#E7EDE1` ink `#5F7A61`, fills `#8CA58A`, `#A9BC9B`, water track `#EDF1E7`
- Amber (adjusted): bg `#F7E7D4` ink `#A66A3F`, fill `#C98A3F` · peach (kcal bars, weight line) `#E0A375`, `#E8B48C`
- Sand chips `#F0EDE2`, `#F3EBDD`, chart empty `#EDE8DC`, muscle empty `#ECE6D8`/`#EDE6D8`, bar idle `#D5CBB8`
- Danger (delete) `#B0563F`, border `rgba(176,86,63,.35)`
- Dark: toast/segmented-active `#453E35`, toast ink `#F7F0E4`, undo `#F2C08C`, recap gradient `135deg #3E3A46→#5C4A4A`, recap label `#D8C9B4`
- Hairlines: cards `rgba(120,100,75,.06–.10)`, controls `.14–.16`, dashed dividers `.16`
- Phone bezel `#332D26` (radius 56 outer / 46 screen), desk bg `#EDE5D6`

### Scenic scenes (home header gradient `180deg A 0% → B 55% → C 100%`)
- **morning**: A `#DFEDE9` B `#F3E3CB` C `#F2C9A2` · sun `#FFF6DE` · hills `#BFD0BB` / `#93AE9A` · ink `#48493E`
- **afternoon**: A `#CDE3E4` B `#EFDFBE` C `#EBC493` · sun `#FFF8E4` · hills `#CFC291` / `#A89F66` · ink `#5C4A3A`
- **evening**: A `#2F2C40` B `#6B4A4E` C `#C98A6B` · sun (moon) `#F2C08C` · hills `#4A4258` / `#5C4A55` · ink `#F7F0E4` · 8 stars (r 1–1.5, `#F7F0E4` opacity .5–1) fade in via `opacity` transition .3s
- Sun: circle r30 opacity .92 + halo r48 opacity .22 at (196,46). Hills: two SVG paths in a 390×120 box pinned to the bottom (`M0 70 Q70 40 140 66 T290 60 T390 74 V120 H0 Z` opacity .85; `M0 92 Q90 66 190 88 T390 92 V120 H0 Z`).
- Scene text: greeting 20/800, date 12.5/600 opacity .8; kcal hero 72/200 ls −2.2; sub-line 13/600 opacity .92 with `text-shadow 0 1px 8px rgba(30,22,16,.35)`; counts line in a glass chip `rgba(30,24,18,.22)` + blur 8 + border `rgba(255,253,247,.14)`, radius 15, padding 6×13, 11.5/700.
- **Sheet cap** (the "rolling card" seam): 38px tall, `#F7F2E9`, radius `30px 30px 0 0`, margins `-34px -20px -13px`, shadow `0 -12px 26px -8px rgba(50,36,22,.18)`.
- **Parallax**: Day panel `onScroll` stores scrollTop; sun/hills/stars SVGs get `transform:translateY(min(340, scrollTop) × 0.38)` — imagery exits at ~0.62× scroll speed, the cap slides over it. Update threshold 1px.
- Classic mode (`homeStyle:"classic"`): flat header (greeting 21/700 + avatar), kcal hero 82/200 ls −2.5 on canvas, "estimates" chip `#F7E7D4`/`#A66A3F`.

### Typography
Nunito 200–800 (Google Fonts). Screen titles 21/700 · hero numbers 82/200 (classic) / 72/200 (scenic) / 64/200 (lock clock) / 44/200 (Trends record counter) · card titles 14–15.5/700 · body 12.5–13.5/600 · micro-labels 9–11.5/800 uppercase ls 0.5–1.4 · rail time 10/800 · chart axis 8.5–9/700–800. Minimum hit target 34px (calendar cells), standard buttons 42–52px.

### Radii & shadows
Cards 24–26 · sheets `30px 30px 42px 42px` (margins `0 6px 6px`) · modals 22 · inner blocks 16–20 · buttons full-round (h/2) · chips/badges 7–17. Card shadow `0 1px 2px rgba(105,84,60,.05), 0 14px 30px rgba(105,84,60,.10)` (water card 16/34 .11) · sheet `0 -10px 44px rgba(80,60,40,.20)` · modal `0 14px 34px rgba(105,84,60,.14)` · accent CTA `0 10px 22–24px color-mix(accent 30–32%, transparent)` · toast `0 12px 30px rgba(60,45,30,.3)`.

### Keyframes
`vtIn` (16px rise + fade, .3–.35s) · `vtFade` (8px, .25–.4s, staggered `animation-delay` i×70ms on lists) · `vtPop` (scale .92→1) · `vtBreath` (scale 1↔1.07, 1.6s loop — parsing icons) · `vtTip` (tooltip spring: translateY 7→−3→0, scale .5→1.08→1, .32s `cubic-bezier(.34,1.56,.64,1)`) · `vtSheetUp` (translateY 105%→0, .35–.38s `cubic-bezier(.22,.9,.32,1)`) · `vtWave` (scaleY .3↔1, 1s, delays i×.13s — mic bars) · `vtPillX` (pill max-width 54→280px, .5s) · `vtPillBtn` (scale .4 pop, delays .3s/.38s).

---

## 3 · Component math

### Dock date picker (10 days)
Gaussian magnification while dragging: `mag = exp(−(d / (slot·1.25))²)` where `d` = px distance from dot center, `slot` = width/10. Scale `1 + 1.15·mag`, lift `translateY(−13·mag px)`, tint `color-mix(in oklab, accent round(mag·60)%, #D9CFBD)`. Selected (idle) dot scale 1.85, 100% accent. Release spring `transform .55s cubic-bezier(.34,1.56,.64,1)`. `navigator.vibrate(7)` once per dot crossing. Accent tooltip (10.5/800, radius 9, arrow 4/5px) via `vtTip`. Calendar button opens a month sheet: 7-col grid, 42px cells, status dot per day (`#8CA58A` as-planned · `#C98A3F` adjusted · 1.5px ring `rgba(120,100,75,.35)` no record), selected cell accent bg.

### Charts (Trends)
Bars: height `max(4, round(v/max·96))%` in a 72px box, radius 3, gap 6px (W) / 2px (M/Y); fill `#E0A375` kcal, `#A9BC9B` water, `#8CA58A` movement; scrubbed bar `var(--accent)`. Scrub index `floor(x/width·n)` clamped; pointer-down sets, move updates (marks `moved`), release clears only if moved (tap = pin). Tooltip follows at `left:(i+.5)/n·100%`. **Detail card on pin** (`#FBF6EC`, radius 16): Week → that day's record lines + "Open this day →" (jumps `dayOff`, panel 1); M/Y → range average, highest/lowest, periods with a record. Week's last bar is live (today's recorded values). Weight: 306×64 polyline `#E0A375` 2.5px, dot r4.5 accent + 2px `#FFFDF7` stroke; scrub index `round(x/width·(n−1))`; detail line = value · date · ±delta vs previous · source.

### Muscle map (SVG capsule body, viewBox 190×150)
Front + back figures built from primitives: head circle r8 `#EDE6D8`; shoulders circles r7; chest 2×(14×16 r6); back 2×(14×20 r6); arms upper 9×21 r4.5 + fore 8×17 r4; core 20×19 r7; traps 18×9 r4; glutes 2×(12×13 r6); quads/hamstrings 11×30/26 r5.5; calves 9×22 r4.5; shins/pelvis neutral `#EDE6D8`. FRONT/BACK captions 8/700 `#B7AB9C`.
Intensity data `MUS`: Leg day `{qu:1, gl:.85, ha:.8, ca:.55, co:.25}` · Upper body `{ch:1, bk:.9, sh:.7, ar:.6, tr:.5, co:.25}`. Fill `color-mix(in oklab, accent round(16+v·70)%, #F0EDE2)`; zero → `#ECE6D8`. Trends aggregate: `muT(k) = (legIntensity·legSessions + upperIntensity·upperSessions) / totalSessions` with session counts W `{2,2}`, M `{10,8}`, Y `{44,38}`. Chip label: primary ≥.75, secondary ≥.4, else light; primary chips accent-tinted `color-mix(accent 16%, #FFFDF7)`.
**Muscle bottom sheet** (opens from Trends chips, workout-card Muscles view, past-day map): session rows (program, weekday+date, primary/secondary chip, exercises that hit that muscle from `EXMU` map, "Open this day →" when within dock range); M/Y adds "+N earlier sessions". Exercise↔muscle map: Leg day — qu: Squat/Leg press/Lunges · gl: Squat/RDL/Lunges · ha: RDL/Leg curl · ca: Calf raise; Upper — ch: Bench/Incline · bk: Row · sh: Lateral raise/Incline · ar: Bench/Row/Triceps rope · tr: Row.

### Habit detail sheet (Loop-inspired, counters only — no score/streak)
Trigger: tap habit row (or its dot strip) in Trends. Contents: (1) three counter tiles — this month ×, total ×, "most often" top-2 weekdays; (2) current-month mini calendar — 34px cells r11, done `#8CA58A` ink `#FFF9F1`, not-done `#F0EDE2` ink `#6E6355`, future transparent `#D9CFBD`, selected 2px accent outline; tapping a day shows date · done/not marked · vacation flag · "Open this day →"; (3) by-month history — 8 bars, height `round(count/max·42+5)px`, current month `#8CA58A`, others `#D5CBB8`, count label 9.5/800 above, month letter below; (4) by-weekday frequency (last 30 days) — circles Ø `8+share·14px`, opacity `.35+share·.65` (zero → .25), `#8CA58A`. Footer: "Counts of recorded days — never a score, never a streak."
Trends habit rows keep the W/M/Y dot strip: W 7 dots 14px, M 30 dots 7px (binary `#8CA58A`/`#EDE8DC`), Y 12 cells tinted `color-mix(#8CA58A count/28·100%, #EDE8DC)`.

### Capture pill (frosted, Samsung-Health-like)
Container `rgba(255,253,247,.55)` + `backdrop-filter:blur(20px) saturate(1.5)`, border 1px `rgba(255,253,247,.72)`, radius 32, shadow `0 12px 34px rgba(50,38,26,.25)`; entry `vtPillX` (max-width 54→280, .5s) with side buttons popping via `vtPillBtn` at .3s/.38s. Aa/camera buttons 40px `rgba(69,62,53,.08)` ink `#453E35`; mic 52px accent + `0 8px 20px color-mix(accent 40%)`. Visible **only** on today's Day, no sheet open. Hold mic = listening (5 wave bars `vtWave`); release → parsed sheet; result is a **plan delta** ("white rice → sweet potato · −23 kcal"), never a loose meal.

### Timeline (Your day)
Left rail 40px: time 10/800, dot 9px, connecting line 2px `rgba(120,100,75,.10)`. Dot colors: done `#8CA58A` · adjusted `#C98A3F` · skipped `#D9CFBD` · due-now `var(--accent)` · future `#E4DCCB`. Due meal card border `1.5px color-mix(accent 32%, #FFFDF7)`; future meals show "· later today" and no confirm button. Workout card sits at its 18:00 slot with **Exercises | Muscles** segmented view. Close-the-day / Day-closed recap render as the final "now" node.

### Misc
- Toast: dark pill 122px above bottom, radius 18, auto-dismiss 2.2s (3.6s with Undo `#F2C08C`). Undo on every recording action (confirm, skip, portion, swap, habit answer/removal, retro-close, weight, add-meal/habit, domain toggle).
- Portion modal: per-item slider min/max/step, delta badge (amber +, green −, neutral 0), "didn't have it today", "only counts for today".
- Water: quick +250ml, exact modal slider 50–1000 step 50 **plus** typed input (dual entry everywhere); bottle fill `height:%` of 2500ml, transition .6s.
- Status bar ink follows scene (`#F7F0E4` on lock/dark scenes, else `#453E35`); clock per daytime (7:10 / 2:37 / 9:26).
- Account (Library): avatar `linear-gradient(135deg,#E8B48C,accent)` with initial, name + email, Sign out (neutral outline) and Delete my data (danger outline `#B0563F` + confirm step) — delete resets to onboarding and clears all state.
- Vacation mode swaps `--accent` to `#3E8FA3` globally (CSS var, so every accent surface follows).

---

## 4 · Screens (in the prototype)
1. **Onboarding** — 2 steps; step 2 writes real composition flags ("turning something off hides it, never deletes").
2. **Day (today)** — scenic or classic header · Overview (Water, Macros, Habits ✓/—, Weight w/ Health Connect + manual modal) · Your day timeline · capture pill · close-day card at evening.
3. **Day (past)** — status card (as planned / with adjustments + recorded lines) or unrecorded + retro-close; past muscle map ("probable muscle use") or "log it" chips.
4. **Trends** — W/M/Y rail · record counter · Energy/Water/Movement charts (scrub + pin + detail + jump) · Muscle focus (aggregate map + tappable chips → session sheet) · Habits (dot strips → detail sheet) · Weight line.
5. **Library** — What Vita keeps (composition toggles) · Eating plan (list, + Add a meal form, Replace via PDF → full plan-setup flow) · Training programs (+ import/type flow) · Habits (add form: name/time/weekday circles; per-habit notification switch; remove w/ undo) · Health Connect row · Vacation sheet · Export sheet (recipient-shaped PDF) · Account.
6. **Lock screen** — day-close notification ("Ignoring this leaves the day unrecorded — Vita never assumes").

## 5 · Copy rules
Counters and estimates, never verdicts: "estimates" chips on kcal, "recorded, not judged", "gaps are just days, not failures", "coverage, never a score", "a count, never a streak", "Vita assumed nothing". Never: goal, target, streak, missed, score.

## 6 · PDF parsing target model
As v3 handoff: meals with options/items/swaps + hydration + supplements; real values pre 109 · post 121 · lunch 702/679 · snack 72 · dinner 702/718/706/691 · day ≈1,706 kcal (PDF report 1,716). Parse card findings: "13 pages · 6 meals · 214 swap options".

## Files
- `Vita Prototype v4.dc.html` — full interactive prototype (open in a browser)
- `support.js` — prototype runtime (reference only; do not port)
- `meal-plan.pdf` — real source plan (contains personal data — anonymize)
