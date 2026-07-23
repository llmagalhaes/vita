# Handoff: Vita v3 — Plan Setup, Empty States, Evening Recap & UX Polish

## Overview
Vita is a **gentle health dashboard** (explicitly *not* a coach): it logs meals, water, workouts and habits with zero targets, zero scores, zero guilt. Everything is phrased as "estimates" and "your own reference"; any daily change resets tomorrow.

This handoff covers the **v3 iteration**:
1. **Meal-plan setup flow** — import a real nutritionist PDF (13 pages, substitution lists, meal options, supplements) and review it meal-by-meal with almost no friction.
2. **Empty / pending states** for Today's plan (meals and workouts) and a "finish setup" banner on Home.
3. **Evening recap** — lock-screen notification + expandable Home card.
4. **UX debt from v2 → v3**: morning empty state, swipe-affordance dot strip (with "Today" label), undo-in-toast pattern, onboarding reduced to 5 steps (integrations deferred to a contextual Home prompt), consistency line in Trends.

## About the Design Files
The files in this bundle are **design references created in HTML** (a self-running prototype: `Vita Prototype v3.dc.html` + its runtime `support.js`). They show intended look and behavior — they are **not production code to copy**. Recreate these designs in the target codebase's existing environment (React Native, Swift UI, Flutter, etc.) using its established patterns. If no app codebase exists yet, choose the stack that best fits a mobile-first health app and implement there.

`meal-plan.pdf` is the **real source document** (anonymize before committing anywhere) — use it as the reference input for the PDF-parsing feature.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii, shadows, copy and animation timings below are final and should be matched. All measurements are CSS px on a 390 × 844 phone canvas.

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| Canvas | `#F7F2E9` | app background |
| Card | `#FFFDF7` | all cards, chips off-state |
| Ink | `#453E35` / `#4A4238` | headings / body |
| Muted | `#8A7E70` | secondary text |
| Faint | `#B7AB9C` | tertiary text, section labels |
| Hairline | `rgba(120,100,75,.14)` | borders (cards use `.06`–`.10`) |
| Accent (default) | `#C4704E` | CTAs, active states — user-themeable (`#8CA58A`, `#C98A3F`, `#D6926B`); vacation mode swaps to `#3E8FA3` |
| Accent soft | `color-mix(in oklab, var(--accent) 10%, #FFFDF7)` | chip/badge fills |
| Green pair | `#E7EDE1` bg / `#5F7A61` ink (`#8CA58A`, `#A9BC9B` accents) | workouts, water, success |
| Amber pair | `#F7E7D4` bg / `#A66A3F` ink (`#C98A3F`) | meals, kcal badges |
| Peach | `#E0A375` | "consumed" bars |
| Sand | `#F0EDE2` (tab rails) / `#F3EBDD` (icon wells) | neutral fills |
| Dot idle | `#D9CFBD` | nav dots, radio borders `rgba(120,100,75,.3)` |
| Toast | bg `#453E35`, text `#F7F0E4`, undo link `#F2C08C` | |
| Recap card | `linear-gradient(135deg, #3E3A46, #5C4A4A)`, text `#F7F0E4`, label `#D8C9B4`, moon/gold `#F2C08C` | evening only |

### Typography
Nunito (400/600/700/800), fallback sans-serif.
- Screen title 21/700 · card title 19–20/700 · row title 14–15/600-700
- Body 12.5–13.5 · captions 11–11.5 · micro-labels 9–11/800, uppercase, letter-spacing 0.6–1.4px
- Hero numbers: 82/200 (Home kcal, letter-spacing −2.5px), 34/200 (plan kcal)

### Radii
Cards 24–26 · inner cards/banners 20–22 · buttons/pills 13–18 (full-round CTAs: height 52, radius 26) · badges 7–12 · icon wells 13–18 · circles 50%.

### Shadows
- Card: `0 8px 20px rgba(105,84,60,.06)` (pop-cards `.09`–`.10`, blur 26–30)
- Accent CTA: `0 10px 24px rgba(160,100,60,.25)`
- Toast: `0 12px 30px rgba(60,45,30,.3)` · Recap card: `0 12px 30px rgba(60,45,30,.18)`

### Keyframes (exact)
```css
@keyframes vtIn    { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
@keyframes vtFade  { from { opacity:0; transform:translateY(8px) }  to { opacity:1; transform:none } }
@keyframes vtPop   { 0% { opacity:0; transform:scale(.92) } 100% { opacity:1; transform:scale(1) } }
@keyframes vtBreath{ 0%,100% { transform:scale(1) } 50% { transform:scale(1.07) } }
```
Standard entries: cards `vtFade .4–.45s ease both`, screens `vtIn .3s ease both`, banners `vtPop .35–.4s ease both`, expanding sections `vtFade .25s ease both`. Screen-to-screen swipes: `vtSlideInR/L .45s cubic-bezier(.22,.9,.32,1)` (64px travel).

---

## Screens / Views

### 1. Plan Setup (`view: 'plansetup'`) — NEW
Full-screen flow, padding `60px 22px 150px`, column gap 13.

**Header row:** 34px circular back button (hairline border, card bg) · "PLAN SETUP" label (11.5/800, uppercase, faint) · right-aligned step counter "2 of 6" (11/700 faint).

#### 1a. Parsing state (the PDF-import animation — match exactly)
Centered card: radius 26, padding `32px 22px`, card bg, shadow `0 12px 30px rgba(105,84,60,.09)`, border `1px rgba(120,100,75,.06)`. Entry: `vtPop .35s ease both`.

Vertical stack, centered, gap 6:
1. **Icon well** 52 × 52, radius 18, bg `#F3EBDD`, margin-bottom 6 — loops `vtBreath 1.6s ease-in-out infinite` (a calm 7% scale pulse, never a spinner). Inside: a 22 × 26 document SVG, stroke `#A66A3F`, width 1.6: outline path `M3 1.5 h10 l6 6 v17 h-16 Z`, folded corner `M13 1.5 v6 h6`, three text lines (`M6.5 13 h9 · M6.5 16.5 h9 · M6.5 20 h6`, width 1.4, round caps).
2. Title **"Reading your plan…"** 17/700 ink.
3. Three findings fade in one by one, 12.5px muted, each `vtFade .4s ease both` with **staggered delays 0.5s / 1.0s / 1.5s**:
   - "13 pages"
   - "6 meals · 214 swap options"
   - "hydration & supplement notes"

After **2.6s** the state auto-advances to review (in production: when parsing actually resolves; keep the findings lines tied to real parsed counts). The whole card is replaced by the review UI (no exit animation — review card enters with `vtIn .3s`).

#### 1b. Review — one meal per step (6 steps: 5 meals + Notes & habits)
- **Progress bar:** 6 flex-1 segments, height 4, radius 2, gap 5. Done `#8CA58A`, current `var(--accent)`, upcoming `rgba(74,66,56,.13)`; `transition: background .4s`.
- **Step 1 only, intro line** (12.5/–, muted, line-height 1.5): "One meal at a time — just check what Vita read. Nothing here is a target."
- **Meal card** (radius 26, padding 18, gap 12, `vtIn .3s`):
  - Header: meal name 20/700 · time 11.5/700 faint · right kcal badge "~702 kcal" (11.5/800, `#A66A3F` on `#F7E7D4`, radius 12, padding 5 × 10).
  - **Options selector** (only Lunch: 2, Dinner: 4): label "PICK YOUR USUAL — SWITCH ANY DAY" (11/800 uppercase faint), then wrapping chip row (gap 6). Chip: padding 8 × 12, radius 15, 12/700, name + kcal (10px, 65% opacity). Active: bg/border `#453E35`, text `#F7F0E4`. Inactive: card bg, hairline border, `#6E6355`. Switching options resets the open swap row.
  - **Item rows** (full-width buttons, padding 11 × 0, bottom hairline `.07`): 7px amber dot `#E8B48C` → item name 14/600 (+ optional "SWAPPED" badge, see below) → quantity 11.5/700 muted ("200g", "1 scoop (30g)") → **swaps chip**: "19 swaps" 10.5/800 accent on accent-soft, radius 11, padding 4 × 8, with a 9px chevron that rotates 180° (`transition .25s`) when open. Items with no swaps show a faint "—".
  - **Expanded swap list** (below the row, indented 17px left, `vtFade .25s`):
    - Hint line (10.5/700 faint): "Tap one to make it your usual — you can still swap on any single day."
    - **Radio rows** (buttons, padding 6 × 0, 12/600 `#6E6355`, active-press opacity .6): 15px circle — idle `1.5px rgba(120,100,75,.3)` border; selected: accent-filled with a white 9px check. Rows list real substitutions from the PDF, format `Name · quantity` ("White rice, cooked · 150g").
    - When an item is swapped, the first row is the **original** ("Banana · 1 unit (100g)") with an "ORIGINAL" tag (9.5/800 uppercase faint, right-aligned) — tapping restores it.
    - Last row: **"+ 14 more in your plan →"** (11/700 accent). Behavior: opens the full substitution list as a **searchable bottom sheet** (prototype shows a toast placeholder — build the sheet for real: search field + the same radio rows, same selection semantics).
  - **Swap selection semantics (the answer Claude Code needs):** tapping a swap makes it the item's **default ("usual")** — the row's name/quantity update in place, an accent "SWAPPED" badge (9/800 uppercase on accent-soft, radius 7, padding 2 × 6) appears next to the name, the list collapses, and a toast confirms "Your usual is now White rice, cooked" **with an Undo action**. It must persist into the generated plan (Today's plan shows the swapped item and its macros). It is *not* a one-day change — one-day swaps happen later in Today's plan via the portion/adjust flow.
  - **Nutritionist note** (when present): italic 12px muted on `#FBF6EC`, radius 14, padding 10 × 13, with a "· FROM YOUR NUTRITIONIST" micro-tag. E.g. "Up to 2 meals a week can go off-plan — your nutritionist built that in."
- **CTA:** full-width "Looks right" (height 52, radius 26, accent bg, 15/700 `#FFF9F1`, accent shadow) → next step. Below, centered ghost link "Fix something" (12.5/600 faint, underlined) → opens an editable version of the card (out of prototype scope).

#### 1c. Final step — "Notes & habits"
Same card chrome. Title "Notes & habits" + "from the plan". Four toggle rows (padding 11 × 0, bottom hairline): name 14/600 + sub 11.5 muted, right 38 × 22 switch (radius 11; knob 18px white circle, `left` animates 2px→18px, `.25s`; track on `#8CA58A`, off `#E4DCCB`):
- Water — 2,500 ml a day · "split across the day, between meals" (default ON)
- Creatine — 1 dose (4g), daily · "any time, away from caffeine" (ON)
- Omega-3 — 1 capsule · "with lunch or dinner" (ON)
- Vitamin D — 1 dose · "with lunch or dinner · for 5 months" (ON)

Footer microcopy: "Anything you keep on becomes a gentle check-in — edit or remove them in Habits." CTA **"Finish setup"** → creates the accepted habits (daily check-ins at 10:00 / 13:00 / 13:00), activates the plan, navigates to Today's plan, toast "Plan ready — 5 meals · 3 new check-ins".

### 2. Home — v3 changes
- **Header:** greeting ("Good morning/afternoon/evening, Ana" 21/700 + date 13 muted) and a single 36px account button. Trends/habits/integrations buttons are gone (reachable by swipe/dots). **The "Today's plan · swipe" pill was removed in this iteration.**
- **Nav strip** (all main screens, absolute top 46px, centered, gap 6): order Today's plan ← Home → Trends → Workout → Habits → Integrations. The **first position is the word "TODAY"** (9/800, uppercase, letter-spacing 1.2px, 3px right padding) instead of a dot — accent when active, faint `#B7AB9C` otherwise, `transition: color .3s`. Remaining five are 5px dots (radius 3), idle `#D9CFBD`; the active one stretches to 16px wide and fills accent (`transition: width .3s, background .3s`). All are tappable (navigate with the correct slide direction). Until the user's first swipe, a "SWIPE" hint (9/800 uppercase faint) sits after the dots, then disappears permanently.
- **Banner slot** (below header, in order): ① vacation banner ② check-ins banner ③ **"Your meal plan is in"** (only while setup is pending): warm gradient `#FFF7EA→#FBEFDD`, border `1.5px color-mix(accent 26%)`, radius 22, padding `12 12 12 15`, leaf icon in a 38px white well, title 13.5/700 + sub "Finish the setup — 5 meals, one at a time" 11.5 muted, accent "Continue" button (radius 15, padding 9 × 13) + "×" dismiss (30px, faint). Dismiss → toast "Anytime — it's waiting in Today's plan". ④ integrations prompt (same layout, neutral card bg, chain-link icon on `#E7EDE1`) — appears after onboarding when nothing was connected.
- **Evening recap card** (when it's evening; sits right above the hero number): dark gradient card (tokens above), radius 24, padding `15 17`, gap 9, `vtPop .4s`. Header: gold moon glyph + "EVENING RECAP" (11/800 uppercase `#D8C9B4`) + chevron. Body 14.5/600 `#F7F0E4`: "2 meals, a workout and 1,250 ml of water — logged, not judged." Sub 12px 65%-white: "Tomorrow starts fresh." Tap toggles an expansion (dashed top border `rgba(247,240,228,.22)`): "~600 kcal in · ~1,180 out — estimates, not scores" + "See trends →" pill (bg `rgba(247,240,228,.14)`, text `#F2C08C`). Counts are computed from the day's log.
- **Morning empty state** (fresh day, timeline area): dashed card (`1.5px dashed rgba(120,100,75,.22)`, radius 24, padding `26 20`, centered) — sun icon in `#F3EBDD` well, "Nothing logged yet" 15.5/700, "Your plan starts with breakfast at 07:30. Hold the mic when you eat — or peek at what's ahead." 12.5 muted (max-width 230), soft-accent "See today's plan →" button. Hero kcal shows 0; water/macros/energy all derive from the (empty) log.

### 3. Today's plan — states
Header: "Today's plan" + date, "Home →" pill; helper line "Tweak anything — it only counts for today, tomorrow starts fresh." + accent "Edit everyday plan →" link; Meal plan / Workout segmented rail (`#F0EDE2` track, active thumb `#453E35`).

**Meal tab states:**
- **ready** — summary card ("~1,700 kcal planned today" 34/200 + P/C/F bars) and one card per meal (Pre-workout 06:40, Post-workout 08:30, Lunch 13:00, Snack 16:30, Dinner 20:00) listing items with quantity pill + kcal; tapping an item opens the portion-adjust modal (below). Any change shows the "N changes for today" banner with **Revert** (undo-able).
- **review** (imported, not reviewed) — dashed empty card: leaf icon, "Your plan is imported", "Finish the setup — 5 meals to review, one at a time. Takes about a minute.", accent "Continue setup →".
- **none** — dashed empty card: "No meal plan yet", "Vita counts whatever you log either way. Bring a plan whenever you're ready.", two buttons: accent **"Import a PDF"** and ghost **"Type or speak it"** (hairline border). Both lead into Plan Setup (import shows the parsing animation; type/speak captures free text then enters the same review).

**Workout tab states:**
- **ready** — chip selector for **multiple programs** ("Leg day", "Upper body"; same chip style as meal options — the user can keep N programs), summary card (kcal 34/200 + program name + "6 of 6 exercises"), exercise list with 22px check circles (green `#E7EDE1`/`#5F7A61` when on; tap = skip for today → strikethrough, "OFF TODAY" amber tag, kcal recomputes, toast with Undo). Footer: "Your program keeps every lift for next time."
- **none** — dashed empty card: dumbbell icon on `#E7EDE1`, "No training program yet", "Log workouts freely — or bring your program and Vita lays it out day by day. You can keep more than one.", Import a PDF / Type or speak it (mirrors the meal-plan setup flow).

### 4. Onboarding (now 5 steps)
Name → What to keep an eye on → Eating plan → Training → All set. The old "Connect apps" step was **removed** — integrations are offered later via the Home prompt. Eating-plan subtitle now reads "…you'll review it meal by meal right after setup, no rush." Finishing with an imported plan puts Today's plan in **review** state and shows the Home banner; skipping leaves **none**.

### 5. Lock screen
Below the existing check-in notification, a second frosted notification (same chrome, entry `vtIn .5s ease both .15s`): "Vita · Evening recap · now" — "3 meals, a workout and 2.1 L of water today — logged, not judged. Tomorrow starts fresh." Tapping opens Home.

### 6. Trends
Under the range caption, a consistency card (card bg, hairline, radius 16, padding 10 × 14): two-tone leaf glyph (`#8CA58A`/`#A9BC9B`) + "Third week in a row of showing up — steady beats perfect." (12.5/600 `#6E6355`). **Never a numeric streak counter** — computed as consecutive weeks with ≥1 log, phrased ordinally, disappears rather than resets to zero.

### 7. Toast with Undo (global pattern)
Fixed 122px above bottom, centered, max-width fits 16px margins. Dark pill (radius 18, padding 10 × 16, 13/600) + optional **"Undo"** (13/800 `#F2C08C`). Auto-dismiss **2.2s** (no action) / **3.6s** (with Undo). Used by: exercise skip, portion adjust, plan Revert, habit removal, swap selection.

## Interactions & Behavior
- **Swipe navigation:** pointer-tracked; commit when `|dx| ≥ 70px` **and** `|dx| ≥ 1.8·|dy|`; suppressed while any sheet/modal/capture is open and on inputs. Order as in the nav strip; slide animations by direction.
- **Portion adjust math:** every plan item has `per`-unit macros; displayed kcal = `per.k × qty`. Modal slider uses the item's `min/max/step`; delta badge shows `Math.round(per.k×newQty) − Math.round(per.k×origQty)` — 0 → "no change" (neutral), positive amber, negative green. Grams-based items store per-gram values (e.g. corn `k .84/g × 200g ≈ 168 kcal`; chicken `1.65/g`; whole plan totals **~1,700 kcal**, matching the PDF's 1,716 report).
- **Workout kcal:** `~Math.round(plan.kcal × activeExercises / totalExercises)` (Leg day 430, Upper body 380).
- **"N changes for today"** = edited portions + skipped exercises (across all programs); Revert clears both (undo-able).
- **Morning mode derivation:** the fresh day filters out seeded log entries and subtracts their totals (kcal −600, water −1,250 ml, macros P−33 C−60 F−26) so anything logged *after* still appears.

## State Management
Key state: `view`, `navDir`; plan status `mealPlanSt: 'ready' | 'review' | 'none'`, `trainSt: 'ready' | 'none'`; setup flow `psStep (0–5)`, `psPhase ('parsing' | 'review')`, `psOpt {stepIdx: optionIdx}`, `psSel {itemKey: swapString}` (chosen usuals), `psSwapOpen`, `psHab {water, creatine, omega, vitd}`; Today edits `planQty {itemId: qty}`, `dayWkSkip {exerciseName: bool}`, `wkPlanSel`; UI `toast {text, undo}`, `swiped`, `planPromptHide`, `intPrompt`, `recapOpen`.

Demo-only knobs (prototype Tweaks): `daytime: morning | afternoon | evening`, `plans: ready | needs setup | empty` — in production these come from the clock and from actual plan status.

## PDF Parsing — target data model
Parse the nutritionist PDF into:
```ts
{ meals: [{ name, time?, kcal, note?,            // per-meal kcal from the report page
    options?: [{ name, kcal, items }],           // "Opção 2 – Brunch" etc.
    items: [{ name, qty, grams?, swaps: [{ name, qty }], moreCount }] }],
  hydration: { mlPerDay },                       // 2500
  supplements: [{ name, dose, timing, duration }],
  report: { perMeal: {...}, totals: { kcal: 1716, P: 188.6, C: 153.4, F: 47.9 } } }
```
Real values from `meal-plan.pdf`: Pre-workout 109 kcal · Post-workout 121 · Lunch 702 (Brunch 679) · Snack 72 · Dinner 702 (Tortilla 718 / Pasta 706 / Burger 691). Substitution lists run up to 25 options per item ("Opções de substituição para…"), hence the collapsed-by-default swaps UI.

## Assets
No raster assets. All icons are inline SVG (16–22px, stroke 1.4–1.8, round caps) drawn in the handoff colors. Font: Nunito via Google Fonts.

## Files
- `Vita Prototype v3.dc.html` — the full interactive prototype (all screens; open directly in a browser)
- `support.js` — prototype runtime (required by the HTML; not production code)
- `meal-plan.pdf` — real source meal plan used to design the setup flow (contains personal data — anonymize)
