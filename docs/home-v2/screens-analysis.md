# Home v2 — screens analysis (handoff/screens/)

Studied against `handoff/README.md` and `Vita Prototype v2.dc.html`. Accent in all captures: `#C4704E` terracotta. Page bg `#F7F2E9`, cards `#FFFDF7`.

> **Missing captures:** README lists `01-home-overview.png` and `02-water-card-expanded.png` — **neither exists in `screens/`**. None of the 4 raw screenshots covers the greeting header, kcal hero, or the Water/Macros card row either (see per-file notes). The Water-card-expanded state has **no reference capture at all**; implement from README §Water card + HTML lines 527–550 only.

---

## 03-timeline-idle.png
Prototype-canvas capture (phone frame `390×844` inside the design page, "Vita — a quiet log of meals, water & movement — hi-fi concept" header). Top of Home v2 scrolled to the date section.

- Top pill overlapping status bar: circle accent glyph + "Cycle day 14" + right column "VIA FLO" (capture shows it wrapping under the status icons — canvas artifact, in-app it's the full-width Cycle row).
- Section header: `TODAY` (uppercase, 11.5px/800, letter-spacing 1.4px, `#B7AB9C`) + `Jul 11` (10.5px/700, `#CFC5B4`), left-aligned, baseline row.
- **Dock at rest**: 10 dots, equal slots, bottom-aligned. Dots 1–9: 7px, `#D9CFBD`, ~.85 opacity. Dot 10 (rightmost = today = selected): enlarged (≈1.85×, ~13px visual), solid accent `#C4704E`, full opacity, **no vertical lift** at idle, baseline-aligned with the small dots.
- Summary line directly under dock: `2 meals · 1 workout · 750 ml water — counted from your logs` (11.5px, `#8A7E70`).
- Timeline entries (time gutter right-aligned, spine dots on a thin rail):
  - `07:40` — **Breakfast** card: 34px peach tile (`#F7E7D4`) w/ fork-knife icon (`#A66A3F`), title "Breakfast" 15px/700, sub "Eggs, toast & latte", badge `~430 kcal` peach chip, chevron down. Spine dot peach/orange (`#E0A375`).
  - `08:10` — water passive row (no card): small green drop glyph + `250 ml` (bold, greenish `#7E9480`) + `· Logged by voice` (muted). Spine dot green (`#A9BC9B`).
  - `09:30` — **Leg day** card: green tile (`#E7EDE1`) dumbbell icon (`#5F7A61`), sub "via Garmin · 52 m…" (truncated with ellipsis at this width), badge `~430 kcal` **green** chip, chevron. Spine dot `#8CA58A`.
  - `15:20` — water row `500 ml · Quick add`.
- Not in README: the sub-line truncation behavior ("52 m…") is visible; badges are color-coded per kind (meal peach / workout green) — README only gives tile colors, HTML confirms `badgeBg`/`badgeInk` mirror `chipBg`/`chipInk`.

## 04-dock-magnifier-mid-drag.png  (⭐ match exactly)
Same framing as 03; **finger mid-drag over dot index 3** (4th from left → dayOffset 6 → "Jul 5").

- **Tooltip pill**: accent `#C4704E` bg, text `Jul 5` in near-white `#FFF9F1`, 10.5px/800, letter-spacing .3px, padding 4px 9px, radius 9px, drop shadow (`0 6px 16px rgba(120,80,50,.28)` — visible soft warm shadow). Centered above the peak dot, sitting ~26px above the dot baseline.
- **Triangle pointer**: small solid accent triangle centered under the pill (4px half-width, 5px tall), pointing down at the peak dot.
- **Magnification falloff** (left→right across the visible dots): dots 1–2 at rest size/color; dot 3 clearly enlarged (~1.4–1.6×) and warm-tinted; **dot 4 = peak**: largest (≈2.15×), solid accent, **lifted up** off the baseline (≈13px translateY, grows upward — transform-origin bottom); dot 5 partially enlarged/tinted (mirror of dot 3); dots 6–10 at rest. Falloff is smooth/Gaussian, roughly ±2 slots of visible influence (matches `spread = slot·1.25`, tint threshold `mag > .14`).
- Neighbor tint: intermediate dots blend from `#D9CFBD` toward accent (color-mix `mag·60%`), and opacity rises toward the peak (`.5 + .5·mag`).
- Baseline: non-peak dots stay bottom-aligned; only lift is proportional to magnification (peak lifts most, neighbors slightly).
- **Rightmost (today/selected) dot is back to small rest size during the drag** — the idle 1.85× selected scale is dropped while dragging (all dots use the Gaussian only). Screenshot confirms; README doesn't state this explicitly.
- Header still reads `TODAY Jul 11` and summary still shows today's counts — **selection commits only on release**, nothing below the dock changes mid-drag.
- Timeline content identical to 03 (Breakfast / 250 ml / Leg day / 500 ml).

## 05-past-day-loaded.png
After release on Jul 5 (dayOffset 6 = `tlDays[6]`).

- Header row: `SATURDAY` (uppercase, muted) + `Jul 5` + **`TODAY ↺` pill** — uppercase 10px/800 accent text on a light accent-tinted bg (`color-mix(accent 10%, #FFFDF7)`), radius 11px, padding 4px 9px. Sits inline right of the date.
- Dock: selected dot now the **4th from left** (i=3 → offset 6), enlarged accent, at baseline; all others small `#D9CFBD`.
- Summary: `3 meals · 0 workouts · 750 ml water — counted from your logs` (note pluralization "0 workouts").
- Entries (match `tlDays[6]` verbatim):
  - `08:30` Breakfast — "Yogurt, granola &…" (truncated), `~350 kcal`.
  - `13:40` Lunch — "Backyard barbecue", `~780 kcal`.
  - `15:00` water — `750 ml · Logged by voice`.
  - `20:50` Dinner — `~380 kcal` (cropped at frame bottom).
- All meal cards collapsed; chevrons down. Water is the passive droplet row, as on today.
- Not in README: the past-day header keeps the same TODAY-style typography; the ↺ glyph renders as a small "u/↺" after "TODAY".

## 06-timeline-entry-expanded.png
Prototype canvas capture including the right-hand **screens nav list** (Sign in / Onboarding / Lock screen · check-in / **Home / Today** (selected, dark) / Capture demo / Meal detail / Meal plan / Workout / Habits / Integrations…) — canvas chrome, **not part of the design**.

- Today (`TODAY Jul 11`), rightmost dot selected, summary unchanged.
- **Breakfast expanded in place**: card grows downward; chevron rotated 180° (points up).
  - Dashed divider (`1px dashed rgba(120,100,75,.16)`) under the header row.
  - Macro chips row: `P 24 g` `C 38 g` `F 21 g` — small pills, 10.5px/800 `#6E6355` on `#F3EBDD`, radius 11px.
  - Item list (name left / kcal right, muted right column): `Scrambled eggs (2)  ~180 kcal`, `Grilled bread  ~140 kcal`, `Latte  ~110 kcal`.
  - **`Full details →`** accent text link, bottom-left — present because this is **today** (README: today-only).
- README says caption "no 'Full details' on past days" — this capture is a *today* card so the link IS shown; the caption text in README §Screenshots is slightly misleading for this file (it demonstrates the link present, not absent).

## Screenshot 2026-07-15 at 17.14.39.png
Full-device raw capture. **Not** `01-home-overview` — Home v2 **scrolled down past** greeting/kcal-hero/Water+Macros. Shows:

- **Energy today card** at top: header `ENERGY TODAY` + chevron, right caption `kcal · spent via Garmin · estimates`. Three columns 21px/300: `600 / consumed`, `~1,180 / spent so far`, `−580 / balance`. Below: `IN` bar (peach `#E0A375`, ~half-full) and `OUT` bar (green `#8CA58A`, nearly full) on `#F0E9DA` tracks with 26px uppercase micro-labels.
- **Cycle row**: accent ring glyph in peach circle, "Cycle day 14", right `VIA FLO` — proper full-width card (confirms the 03/04 wrap is canvas artifact).
- `TODAY Jul 11` + idle dock (rightmost accent dot) + summary line.
- Full today timeline incl. the 5th entry cropped in 03/04: `16:00` **Snack** — "Yogurt & granola", `~170 kcal`.
- **Bottom nav pill (menu v2)**: floating rounded pill, blurred translucent bg, 4 slots: `Log` (mic icon, accent, on accent-tinted rounded bg), `Today` (home icon, on gray-tinted bg = **active state**), `Trends` (line chart), `Habits` (check circle). Gradient fade of page bg behind it.
- Not in README: the pill has an **active-tab tinted background** on Today and the mic slot is labeled "Log"; README calls menu v2 just a "floating mic/log pill" — it's actually mic + 3 nav tabs (HTML lines 1991–2018 confirm, incl. an expandable text-input state).

## Screenshot 2026-07-15 at 17.15.02.png
Raw capture, today timeline scrolled — **two entries expanded simultaneously** (Breakfast AND Leg day). Confirms expansion is per-entry toggle (`homeOpen` map), **not** accordion/exclusive.

- Breakfast expanded: same as 06 (chips P 24 g / C 38 g / F 21 g; 3 items; `Full details →`).
- **Leg day expanded** (workout expand reference — no numbered capture exists for this):
  - Chips: `52 min` `6 exercises` `via Garmin`.
  - Items (name / right-aligned sets): `Back squat 4 × 8`, `Romanian deadlift 4 × 10`, `Leg press 3 × 12`, `Leg curl 3 × 12`.
  - `Full details →` (today).
- Snack (16:00) collapsed at bottom; water rows unchanged; nav pill visible, Today active.
- Note: header "TODAY Jul 11" is scrolled behind the status bar — the date header + dock scroll away with content (not sticky).

## Screenshot 2026-07-15 at 17.15.20.png
Raw capture — **Macros popover** ("Macros card tap" target; closest thing to the missing macros references).

- Background: Home dimmed + heavily blurred.
- Centered sheet, large radius (~28px), `#FFFDF7`: title **"Macros today"** (~22px/700 dark), sub "2 meals logged today", round gray close `×` button top-right.
- Three labeled bars: `Protein 33 g` (green fill ~40%), `Carbs 60 g` (ochre `#C98A3F`, ~80%), `Fat 26 g` (peach `#E0A375`, ~40%) on `#F0E9DA` tracks (thicker than card bars, ~8px).
- Dashed divider, then `FROM YOUR MEALS` (uppercase muted): two tinted rows —
  - `Breakfast` / `P 24 g · C 38 g · F 21 g` — right `~430 kcal` / `07:40`.
  - `Snack` / `P 9 g · C 22 g · F 5 g` — right `~170 kcal` / `16:00`.
- Footer caption centered: `estimates from your descriptions`.
- README mentions only "Tap opens the macro popover" — the popover's entire content/layout is undocumented there; this capture + HTML are the spec.

## Screenshot 2026-07-15 at 17.15.51.png
Raw capture — **Habits screen, NOT Home v2** (out of scope for this handoff; likely included by accident or as nav-pill context).

- Back chevron + `HABITS` header, `+ New habit` accent-tinted button; `Today | Manage` segmented control.
- Card 1: `CHECK-IN · 21:00` (accent caps) — "Did you take creatine today?" — filled accent `Yes` pill / outlined `No` pill — caption "Also arrives as a notification — see the Lock screen view."
- Card 2: `PLAN CHECK-IN · 13:00` + `LINKED TO YOUR PLAN` chip — "Did lunch follow your plan today?" — inset plan summary ("Plan lunch — ~520 kcal · 42 g protein · 48 g carbs · 18 g fat / e.g. grilled chicken · rice & beans · salad") — `Yes, as planned` / `Not quite` — caption ""Yes" logs the plan's lunch automatically — "not quite" lets you tell Vita what changed."
- Card 3 (cropped): `PLAN DIGEST · 12:30` + `ARRIVES AS A NOTIFICATION` — "Lunch, from your plan" — chips `42 g protein` `48 g carbs` `18 g fat`.
- Nav pill: Habits active. Only Home-v2-relevant info here: pill active-state on a non-Home tab.

---

## Conflicts / gaps found
1. **`01-home-overview.png` and `02-water-card-expanded.png` referenced by README do not exist**; raw files don't substitute (none shows greeting, kcal hero, or Water/Macros cards, expanded or not).
2. README §Screenshots implies the raw files were renamed captures; actually `17.15.51` is the **Habits screen** and `17.15.20` is the **macros popover** — neither is a "01/02".
3. README omits: during drag the idle selected-dot 1.85× scale is dropped (04); expansion is multi-open, not exclusive (17.15.02); menu-v2 pill contains 3 nav tabs + expandable input, not just mic/log; entire macros-popover spec; date header + dock scroll with content (not sticky).
4. Minor: README tooltip keyframe omits the persistent `translateX(-50%)` in every `vtTip` step (needed to keep it centered); README caption for 06 ("no Full details on past days") describes the *rule*, but the capture itself shows a today card *with* the link.
