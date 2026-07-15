# Handoff: Vita — Home v2 (dock date picker + inline timeline)

## Overview
Vita is a calm health-logging app (meals, water, movement, habits, cycle). This bundle is the **v2 of the Home screen** plus the alternate **v2 nav/log pill**, layered on top of the existing prototype. The headline additions are:
- A **dock-style horizontal date picker** (10 dots, macOS-magnifier behavior) to browse the last 10 days.
- A **Today timeline** that expands each entry in place, with a horizontal swipe as a secondary way to change days.
- The **Water card** restored to the primary slot (the Plan gauge experiment was reverted).

## About the Design Files
The files here are **design references authored in HTML**, not production code to ship. `Vita Prototype v2.dc.html` is a "Design Component" — a single self-contained HTML file that runs in a browser via the accompanying `support.js` runtime (a small custom template/logic layer; **not** a dependency you should port). Treat the HTML as an executable spec of look + behavior. The task is to **recreate these screens in your existing codebase** (React/RN/SwiftUI/etc.) using your own patterns, state, and component library — lifting the exact values (hex, spacing, easing, copy) documented below.

To view it: open `Vita Prototype v2.dc.html` directly in a browser. Toggle the variants via the on-page Tweaks or by setting props (see **Tweaks / Props**).

## Fidelity
**High-fidelity.** Final colors, type, spacing, motion, and interactions. Recreate pixel-close using your design system.

## Tweaks / Props
The root component reads these props (also exposed as an on-canvas Tweaks panel):
- `menu`: `"v1"` | `"v2"` — v1 = bottom text input bar; v2 = floating mic/log **pill**.
- `home`: `"v1"` | `"v2"` — **the subject of this handoff.** v2 = dock date picker + inline timeline.
- `accent`: hex, default `#C4704E` (terracotta). Options: `#C4704E`, `#8CA58A`, `#C98A3F`, `#D6926B`. Drives `--accent` CSS var throughout.
- `units`: `"metric"` | `"imperial"`.
- `floConnected`: boolean — shows the Flo cycle row.

Set `home: "v2"` to see everything described here.

## Screen: Home v2 — "Today"
Scrollable column, `padding: 64px 20px 150px`, vertical `gap: 13px`, background `#F7F2E9`. Phone frame is `390 × 844`, screen radius `46px`.

Top-to-bottom order:
1. **Greeting header** — greeting (21px/700) + date (13px `#8A7E70`); right side = 4 round 36px icon buttons (Trends, Habits, Integrations, Settings), `#FFFDF7` bg, `1px rgba(120,100,75,.12)` border.
2. **Vacation banner** (conditional) / **Check-ins banner** (conditional).
3. **Big kcal total** — 82px/200, `#453E35`, letter-spacing `-2.5px`, caption "kcal logged today" + "estimates" chip.
4. **Water card + Macros card** (row, `gap: 12px`). See components.
5. **Energy today card** (in/out bars, expandable to a 7-day mini chart).
6. **Cycle row** (if `floConnected`).
7. **Date section header + dock date picker** (see below).
8. **Timeline** (swipeable container → animated day wrapper → summary line → entries).

### Component: Water card
- `flex: 1.05`, `#FFFDF7`, radius `24px`, padding `15px`, shadow `0 10px 26px rgba(105,84,60,.08)`, border `1px rgba(120,100,75,.06)`. Tap toggles an expanded log; `active` scale `.985`.
- Liquid vessel: `54×82`, radius `19px`, bg `#EDF1E7`. Fill = absolute-bottom div, `height: {waterPct}%`, gradient `linear-gradient(180deg,#A9BC9B,#8CA58A)`, `transition: height .6s ease`. A translucent drop glyph sits centered.
- Label "WATER" (11.5px/800, `#B7AB9C`, uppercase, letter-spacing 1px) + chevron that rotates 180° when open.
- Value: `{waterStr}` 21px/300. Quick-add button `+250 ml` / `+8 oz`: `#E7EDE1` bg, `#5F7A61` ink, radius `17px`, padding `8px 13px`; `active` scale `.94`. `waterPct = min(100, round(water/3000*100))`; add = +250 ml (metric) / +237 ml (imperial).
- Expanded: dashed top border, list of water log rows (green dot, meta text, time).

### Component: Macros card
- `flex: 1.35`, same card chrome. Header "MACROS" + diagonal-arrow glyph. Three rows (Protein/Carbs/Fat): label + grams, and a 7px track (`#F0E9DA`) with a fill bar per macro color (`#8CA58A`, `#C98A3F`, `#E0A375`), `transition: width .6s`. Tap opens the macro popover.

### Component: Energy card
- Full-width card. Three columns: consumed / spent / balance (21px/300 each). Two labeled bars "in" (`#E0A375`) and "out" (`#8CA58A`) on `#F0E9DA` tracks. Expands (chevron) to a 7-day paired mini bar chart + "See trends →".

### Component: Dock date picker  ⭐ key new interaction
Row: `display:flex; align-items:flex-end; height:44px; padding:0 6px; touch-action:none; cursor:grab`. 10 equal-width slots; each slot is a column that bottom-aligns a 7px dot.

Behavior (continuous **pan/drag**, not per-dot taps):
- On pointer-move the dot nearest the finger becomes active. Each dot's scale follows a Gaussian of its distance to the finger: `scale = 1 + 1.15 * exp(-(d/spread)^2)`, `spread = slot * 1.25`, `slot = rowWidth / 10`. Peak ≈ 2.15×. Also `translateY(-13px * mag)`; `transform-origin: center bottom` (grows upward, dock-style). Dot color/opacity interpolate toward `--accent` with magnification (`color-mix(... mag*60% ...)`).
- **Tooltip**: over the active dot only, a small accent pill with the date (e.g. "Jul 10") + downward triangle, animating in with a spring: keyframe `vtTip` `0%{opacity:0;translateY(7px) scale(.5)} 55%{translateY(-3px) scale(1.08)} 100%{...scale(1)}`, `.32s cubic-bezier(.34,1.56,.64,1)`.
- **Haptic**: `navigator.vibrate(7)` fires **once per dot crossing** (tracked via last-index), never continuously. (No-op on unsupported platforms.)
- **On release**: commit selected day; dots animate back with spring `transition: transform .55s cubic-bezier(.34,1.56,.64,1)`. During drag `transition: none` so dots track the finger 1:1. Idle selected dot stays enlarged (`scale 1.85`) and accent-colored.
- Days map left→right = oldest→today. Index `i` → dayOffset `9 - i` (0 = today).

### Component: Timeline
- Wrapper is also horizontally **swipeable** (pointer drag): `dx > 70` → older day, `dx < -70` → newer; elastic 1/3.5 resistance at the ends; a >12px drag suppresses the tap-to-expand that follows. Day change plays a slide keyframe (`vtDayL/R`) and updates the header label ("Today"/"Yesterday"/weekday + date, e.g. "Jul 9").
- Summary line: "N meals · M workouts · X ml water — counted from your logs".
- Each entry: left time gutter (38px, 10.5px/700 `#B7AB9C`), a spine (colored dot on a 2px `rgba(120,100,75,.10)` rail), and content:
  - **Water** → passive inline marker: small green drop + "500 ml · Quick add", no card.
  - **Meal / workout** → tappable row (`#FFFDF7`, radius 20px, shadow `0 8px 20px rgba(105,84,60,.07)`): 34px rounded icon tile (meal = `#F7E7D4`/`#A66A3F` fork-knife; workout = `#E7EDE1`/`#5F7A61` dumbbell), title 15px/700, subtitle, meta chip, chevron. Expands in place (dashed divider) to macro/summary chips + item list; **"Full details →"** appears only for **today's** entries (they route to the real Meal/Workout detail screens).
- Dot colors: water `#A9BC9B`, meal `#E0A375`, workout `#8CA58A`.

## Data
10 days of sample logs live in `tlDays` (offsets 1–9) plus the live `tl` (offset 0 = today). Each entry: `{ t, kind: 'meal'|'water'|'workout', title, sub, meta, P/C/F (meals), chips (workouts), items:[[name, detail]] }`. Day labels/dates arrays: `dayNames`, `dayDates` (Today, Yesterday, then weekday; Jul 11 → Jul 2).

## Design Tokens
- **Surfaces**: page `#F7F2E9`; card `#FFFDF7`; tile greens `#EDF1E7`/`#E7EDE1`; track `#F0E9DA`; dot idle `#D9CFBD`.
- **Ink**: primary `#453E35`/`#4A4238`; secondary `#8A7E70`/`#6E6355`; muted `#B7AB9C`/`#CFC5B4`.
- **Accent**: `--accent` (default `#C4704E`). Meal accent `#A66A3F` on `#F7E7D4`; movement `#5F7A61` on `#E7EDE1`; macro fills `#8CA58A`/`#C98A3F`/`#E0A375`.
- **Radius**: cards 24px; rows 20px; tiles 12–19px; chips 9–17px.
- **Shadow**: cards `0 10px 26px rgba(105,84,60,.08)`; rows `0 8px 20px rgba(105,84,60,.07)`; tooltip `0 6px 16px rgba(120,80,50,.28)`.
- **Type**: Nunito (UI); large numerals use weight 200–300 with tight tracking.
- **Motion**: spring `cubic-bezier(.34,1.56,.64,1)` (dock + tooltip); fills `.6s ease`; screen slides `.32–.45s`.

## Screenshots (`screens/`)
Reference captures of the exact intended rendering (accent `#C4704E`):
- `01-home-overview.png` — full Home v2: greeting, check-ins banner, kcal hero, Water + Macros row, Energy card, log bar.
- `02-water-card-expanded.png` — Water card open: dashed divider, log rows (dot / meta / time), "See trends →".
- `03-timeline-idle.png` — date header + dock strip at rest (selected dot enlarged in accent), summary line, timeline spine.
- `04-dock-magnifier-mid-drag.png` — **mid-drag**: Gaussian magnification around the finger, neighbors partially scaled, spring tooltip "Jul 5" with pointer triangle. Match this curve and tooltip exactly.
- `05-past-day-loaded.png` — after release: Saturday Jul 5 loaded, "Today ↺" pill visible, selected dot moved, water as passive droplet row.
- `06-timeline-entry-expanded.png` — meal entry expanded in place: P/C/F chips, item list with kcal; no "Full details" on past days.

## Assets
No external images — all icons are inline SVG. No brand assets; swap the SVGs for your icon set.

## Files
- `Vita Prototype v2.dc.html` — full prototype (all screens). Home v2 lives in the `homeV2On` template block; its logic is in the `homeV2` section of `renderVals()` (search `dpkDots`, `tlDays`, `tl2`, `plan2` remnants removed).
- `support.js` — prototype runtime, **reference only; do not port**.
