# Spec: Eating Plan & Training Program screens — Vita

Implementation spec for recreating two screens (plus their modals) in the production codebase. Everything here is lifted verbatim from the reference prototype (`Vita Prototype v2.dc.html`). All values are exact — treat them as the design source of truth. Type family is **Nunito** throughout; weights and sizes are given per element.

Both screens live inside the 390 × 844 phone canvas, background `#F7F2E9`, and are full-screen scrollable views (`position:absolute; inset:0; overflow-y:auto`).

Shared header pattern (both screens):
```
padding of screen: 60px 22px 60px   (Eating plan)  /  60px 22px 60px (Workout)
back button: 34×34 circle, bg #FFFDF7, border 1px rgba(120,100,75,.16), ink #4A4238,
  chevron-left SVG (stroke-width 1.8, round caps)
screen title: 11.5px / 800, letter-spacing 1.4px, uppercase, color #B7AB9C
enter animation: vtIn .3s ease both        (fade + rise 16px)
```

Shared keyframes used in these screens:
```css
@keyframes vtIn    {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes vtFade  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes vtPop   {0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
@keyframes vtBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes vtSheetUp {from{transform:translateY(105%)}to{transform:translateY(0)}}
@keyframes vtSheetOut{to{transform:translateY(112%)}}
```

---

# 1 · Eating Plan screen

Entry points: Account → "Eating plan" row; Home v2 → Plan details "Adjust plan →". Navigation: `view = 'plan'`, no directional slide (plain `vtIn`).

## 1.1 Layout (top → bottom, column gap 13px)

1. **Header row**: back button + "EATING PLAN" title + right-aligned source badge:
   - badge: text "via nutritionist PDF", 9.5px/800, letter-spacing .8px, uppercase, bg `#F7E7D4`, ink `#A66A3F`, radius 8px, padding 3px 7px.
2. **Title block**: "Low-carb weekdays" 24px/700; below it "imported Jun 12 · your own reference · estimates" 13px `#8A7E70`, margin-top 2px.
3. **Totals card** (the live-updating summary):
   - card: bg `#FFFDF7`, radius 24px, padding 18px, shadow `0 10px 26px rgba(105,84,60,.08)`, border `1px solid rgba(120,100,75,.06)`, column gap 12px, animation `vtFade .45s ease both`.
   - kcal line: number `{planKcal}` 44px weight 200, letter-spacing −1.2px, line-height 1; beside it "kcal planned per day" 13px `#8A7E70` (baseline-aligned, gap 8px).
   - 3 macro bars (Protein / Carbs / Fat), each: label row 12.5px (name 700 `#6E6355`, grams right-aligned `#8A7E70`) + 7px track radius 4px bg `#F0E9DA` with fill bar radius 4px, `transition: width .25s ease`. Fill colors: Protein `#8CA58A`, Carbs `#C98A3F`, Fat `#E0A375`.
   - micros chip row (wrap, gap 6px, padding-top 2px): chips 11px/600 `#6E6355`, bg `#F0EDE2`, radius 12px, padding 5px 10px. Labels: `Fiber {x.x} g`, `Sodium {n} mg`, `Iron {x.x} mg`, `Calcium {n} mg`.
4. **One card per meal** (4 cards: Breakfast 07:30, Lunch 13:00, Snack 16:30, Dinner 20:00):
   - card: bg `#FFFDF7`, radius 24px, padding `8px 18px 10px`, shadow `0 8px 20px rgba(105,84,60,.06)`, border `1px solid rgba(120,100,75,.06)`.
   - meal header row (padding `10px 0 2px`): name 15px/700 + time 11.5px `#B7AB9C` (baseline gap 8px); right: meal kcal `~{n} kcal` 12px/700 `#8A7E70`.
   - item rows (full-width buttons, tap opens the Portion modal): padding `11px 0`, bottom border `1px solid rgba(120,100,75,.07)`, `active` state opacity .6, transition opacity .2s. Row anatomy, left→right, gap 10px:
     - 7px dot, `#E8B48C`
     - item name, flex 1, 14px/600 `#4A4238`
     - **qty pill**: 11.5px/700, ink `var(--accent)`, bg `color-mix(in oklab, var(--accent) 10%, #FFFDF7)`, radius 11px, padding 4px 9px. Label format below (§1.3).
     - kcal `~{n}` 12.5px `#8A7E70`, right-aligned, min-width 44px.
5. **Footer hint**: "Tap an item to adjust portions — totals update as you drag." 11.5px `#B7AB9C`, centered, padding 0 16px.

## 1.2 Data model — plan items

Portions are stored per item id in `planQty` (a sparse override map; fall back to the item's default `qty`). Nutrition is defined **per unit** so totals are pure multiplication.

```js
// per = nutrition PER 1 unit (per egg / per slice / per ml / per g)
// k=kcal P=protein(g) C=carbs(g) F=fat(g) fb=fiber(g) na=sodium(mg) fe=iron(mg) ca=calcium(mg)
const planItems = [
  { id:'eggs',    meal:'bf', name:'Scrambled eggs',     unit:'egg',   qty:2,   min:0, max:4,   step:1,  per:{ k:95,   P:6.5,  C:.8,  F:7,    fb:0,   na:95,  fe:.9,   ca:28 } },
  { id:'bread',   meal:'bf', name:'Grilled bread',      unit:'slice', qty:1,   min:0, max:3,   step:1,  per:{ k:145,  P:4,    C:27,  F:2,    fb:1.4, na:210, fe:1,    ca:20 } },
  { id:'latte',   meal:'bf', name:'Latte',              unit:'ml',    qty:200, min:0, max:400, step:50, per:{ k:.55,  P:.033, C:.05, F:.018, fb:0,   na:.4,  fe:0,    ca:1.2 } },
  { id:'chicken', meal:'lu', name:'Grilled chicken',    unit:'g',     qty:180, min:0, max:300, step:10, per:{ k:1.65, P:.31,  C:0,   F:.036, fb:0,   na:.74, fe:.007, ca:.11 } },
  { id:'rice',    meal:'lu', name:'Rice & beans',       unit:'g',     qty:200, min:0, max:350, step:10, per:{ k:1.05, P:.035, C:.21, F:.006, fb:.025,na:1.9, fe:.009, ca:.12 } },
  { id:'salad',   meal:'lu', name:'Salad + olive oil',  unit:'g',     qty:100, min:0, max:200, step:10, per:{ k:1.1,  P:.012, C:.05, F:.09,  fb:.02, na:.5,  fe:.005, ca:.3 } },
  { id:'yog',     meal:'sn', name:'Yogurt',             unit:'g',     qty:170, min:0, max:300, step:10, per:{ k:.59,  P:.059, C:.047,F:.015, fb:0,   na:.21, fe:0,    ca:.65 } },
  { id:'gran',    meal:'sn', name:'Granola',            unit:'g',     qty:30,  min:0, max:80,  step:5,  per:{ k:2.33, P:.08,  C:.42, F:.07,  fb:.09, na:.5,  fe:.04,  ca:.4 } },
  { id:'salmon',  meal:'di', name:'Baked salmon',       unit:'g',     qty:160, min:0, max:300, step:10, per:{ k:1.85, P:.25,  C:0,   F:.088, fb:0,   na:.55, fe:.005, ca:.09 } },
  { id:'veg',     meal:'di', name:'Roasted vegetables', unit:'g',     qty:150, min:0, max:300, step:10, per:{ k:.6,   P:.02,  C:.11, F:.01,  fb:.03, na:.3,  fe:.007, ca:.25 } },
  { id:'spot',    meal:'di', name:'Sweet potato',       unit:'g',     qty:150, min:0, max:300, step:10, per:{ k:.92,  P:.016, C:.21, F:.001, fb:.03, na:.36, fe:.006, ca:.3 } },
];
const planMeals = [
  { id:'bf', name:'Breakfast', t:'07:30' }, { id:'lu', name:'Lunch', t:'13:00' },
  { id:'sn', name:'Snack', t:'16:30' },     { id:'di', name:'Dinner', t:'20:00' },
];
```
Defaults yield **~1,880 kcal/day**.

## 1.3 Calculations

```js
const qty = it => planQty[it.id] ?? it.qty;               // sparse override
const qtyLabel = (it, q) =>
  it.unit === 'g'  ? `${q} g`  :
  it.unit === 'ml' ? `${q} ml` : `${q} × ${it.unit}`;      // "2 × egg", "1 × slice"

// Totals — recomputed on EVERY slider tick (cheap: 11 items)
let tK=0,tP=0,tC=0,tF=0,tFb=0,tNa=0,tFe=0,tCa=0;
planItems.forEach(it => { const q = qty(it);
  tK+=it.per.k*q; tP+=it.per.P*q; tC+=it.per.C*q; tF+=it.per.F*q;
  tFb+=it.per.fb*q; tNa+=it.per.na*q; tFe+=it.per.fe*q; tCa+=it.per.ca*q;
});

// Displays
planKcal   = '~' + Math.round(tK).toLocaleString('en-US');   // "~1,880"
// Macro bar widths are relative to the LARGEST macro, with 10% headroom:
const pMax = Math.max(tP, tC, tF) * 1.1 || 1;
barPct(g)  = Math.round(g / pMax * 100);                     // never hits 100
barLabel   = Math.round(g) + ' g';
micros     = [`Fiber ${tFb.toFixed(1)} g`, `Sodium ${Math.round(tNa)} mg`,
              `Iron ${tFe.toFixed(1)} mg`, `Calcium ${Math.round(tCa)} mg`];
// Per-meal kcal: sum of its items — '~' + Math.round(mk) + ' kcal'
// Per-item kcal: '~' + Math.round(it.per.k * q)
```

## 1.4 Portion adjust modal (`planSel`)

Opens on item tap. **Centered** overlay (not a bottom sheet), z-index above screen content, container padding `0 26px`, column gap 12px.

- **Backdrop**: `rgba(247,242,233,.45)` + `backdrop-filter: blur(13px)` — a frosted wash of the page color, NOT a dark scrim. Animation `vtFade .25s`. Tap closes.
- **Card A — live totals mini-card** (appears above the editor, `vtPop .3s ease both`):
  bg `#FFFDF7`, radius 22px, padding `15px 17px`, shadow `0 14px 34px rgba(105,84,60,.14)`, border `1px rgba(120,100,75,.08)`.
  - kcal line: `{planKcal}` 26px/300 ls −.5px + "kcal planned · updates live" 11.5px `#8A7E70`.
  - 3 compact macro bars: 52px label (11px/700 `#6E6355`) + 6px track (same colors as screen) + 38px right-aligned value (11px `#8A7E70`), fill `transition: width .2s ease`.
  - This card re-renders live while the slider moves — it is the visible payoff.
- **Card B — the editor** (`vtPop .35s ease both .05s` — 50ms after Card A):
  bg `#FFFDF7`, radius 26px, padding `19px 20px`, shadow `0 20px 50px rgba(105,84,60,.20)`, border `1.5px solid color-mix(in oklab, var(--accent) 25%, #FFFDF7)`, column gap 13px.
  - header: item name 17px/700 + meal context "Lunch · 13:00" 11.5px `#8A7E70`; right side kcal `~{n}` 22px/300 with "kcal" 12px/600 `#8A7E70`.
  - big qty readout, centered: `{qtyLabel}` 30px/600 ls −.5px, color `var(--accent)` — e.g. "180 g", "2 × egg".
  - `<input type=range>` full-width, `accent-color: var(--accent)`, height 34px, with the item's `min/max/step`. Below: min & max labels 10.5px `#B7AB9C` at the two ends.
  - macro line, centered, in a `#F7F2E9` radius-12 pill (padding 8px 12px), 12px `#6E6355`: `P {n} g · C {n} g · F {n} g` (each = `Math.round(per.X * q)`).
  - **Done** button: height 46px, radius 23px, bg `var(--accent)`, ink `#FFF9F1`, 14.5px/700, shadow `0 10px 22px color-mix(in oklab, var(--accent) 35%, transparent)`. Closes modal (slider changes are already committed live).

State: single `planSel: itemId | null`; slider `onChange` writes `planQty[planSel] = Number(value)`. No confirm/cancel semantics — edits are immediate and persistent.

---

# 2 · Training Program screen (Workout detail)

Entry points: Account → "Training program" row (subtitle "3-day strength split · via FitZone Gym"); Home timeline workout → "Full details →". Navigation: `view = 'workout'`; slide-in `vtSlideInR/.L .45s cubic-bezier(.22,.9,.32,1)` when arriving via directional nav, else `vtIn .3s`.

## 2.1 Layout (column gap 15px)

1. **Header row**: back button + "WORKOUT" title (same pattern as §1.1).
2. **Source card**: bg `#FFFDF7`, radius 20px, padding `13px 15px`, shadow `0 6px 16px rgba(105,84,60,.05)`; 36px circle avatar bg `#E7EDE1` ink `#5F7A61` with monogram "Ga" (12.5px/800); text "Imported from Garmin" 14px/700 + "Today · 09:30 · synced automatically" 12px `#8A7E70`.
3. **Title block**: "Leg day" 24px/700; meta row (margin-top 4px, gap 8px): "52 min · ~430 kcal · 6 exercises" 14px `#8A7E70` + "ESTIMATE" badge (9.5px/800, ls .8px, uppercase, bg `#F7E7D4`, ink `#A66A3F`, radius 8px, padding 2px 7px).
4. **Muscle map card** — see §2.2.
5. **Exercises card**: bg `#FFFDF7`, radius 24px, padding `8px 18px`, standard card shadow/border. Header "EXERCISES · AS IMPORTED" 11.5px/800 ls 1.2px `#B7AB9C` (padding `12px 0 4px`). Rows: gap 12px, padding `11px 8px`, bottom border `1px rgba(120,100,75,.07)`, radius 12px, `transition: background .3s`:
   - index tile 26×26, radius 9px, bg `#F7F2E9`, number 11px/800 `#B7AB9C`
   - name flex-1 14px/600 `#4A4238`; detail right 12.5px `#8A7E70`
   - **highlight**: when a muscle is selected and this exercise targets it, row bg becomes `color-mix(in oklab, var(--accent) 9%, #FFFDF7)` (else transparent).
   ```js
   const exRows = [ ['Back squat','4 × 8 · 80 kg'], ['Leg press','3 × 12'],
     ['Romanian deadlift','3 × 10 · 60 kg'], ['Walking lunges','2 × 20 steps'],
     ['Seated calf raise','4 × 15'], ['Leg curl','3 × 12'] ];
   // imperial: 80 kg → 175 lb, 60 kg → 130 lb
   ```
6. **History card** — see §2.4.

## 2.2 Muscle map (interactive body diagram)

Card: standard 24px-radius card, padding 18px, items centered, column gap 12px.
Header row: "MUSCLES LIKELY WORKED" label + **flip button** ("See back"/"See front" with a swap-arrows icon): padding 7px 12px, radius 16px, border `1px rgba(120,100,75,.14)`, bg `#F7F2E9`, 12px/700 `#6E6355`. Flipping swaps between two 150×266 SVGs with `vtFade .3s`.

**Body SVG** (150 × 266): skin tone `#EADBC4`, darker accents `#E2D0B5`, ground shadow ellipse `rgba(120,100,75,.10)` (cx 75, cy 258, rx 36, ry 6). Head circle r15 @ (75,24); neck 12×12 r6; arms 13×62 r6.5 rotated ±9°; torso 52×66 r19 @ (49,45).

Muscle hotspots are accent-colored shapes with per-muscle base opacity (their "worked" intensity for this session):

| Muscle | View | Shape(s) | Base opacity |
|---|---|---|---|
| Core | front | rect 36×34 r13 @ (57,74) | .30 |
| Quads | front | 2 rects 18×66 r9 @ (53,127) & (79,127) | .92 |
| Lower back | back | rect 34×26 r11 @ (58,82) | .30 |
| Glutes | back | 2 ellipses r12×11 @ (64,116) & (86,116) | .92 |
| Hamstrings | back | 2 rects 18×63 r9 @ (53,130) & (79,130) | .78 |
| Calves | back | 2 rects 14×52 r7 @ (55,195) & (81,195) | .62 |

Selection model (`selMuscle: id | null`, toggle on tap):
```js
opacity(id, base) = sel ? (sel === id ? 1 : base * 0.3) : base;   // dim others to 30%
anim(id) = sel === id ? 'vtBreath 1.5s ease-in-out infinite' : 'none';  // selected pulses
// transition: opacity .3s; transform-box: fill-box; transform-origin: center
// picking a muscle also auto-flips the body to its side:
pick(id) => { selMuscle = (selMuscle === id ? null : id); bodyFront = (muscles[id].side === 'front'); }
```

Below the body: view caption ("FRONT VIEW"/"BACK VIEW", 11px/800 ls 1px `#B7AB9C`), then — when a muscle is selected — an **info banner** (`vtPop .3s`): bg `color-mix(in oklab, var(--accent) 8%, #FFFDF7)`, border `1px color-mix(... 25% ...)`, radius 16px, padding 10px 14px; muscle name 13.5px/700 + tag ("PRIMARY"/"SECONDARY", 9.5px/800 ls .7px uppercase accent) + its exercises joined with " · " (12px `#8A7E70`).

**Muscle chips** (wrap, centered, gap 6px): one per muscle, 11.5px/700, radius 12px, padding 6px 11px, `transition: all .2s`. Selected: bg `color-mix(in oklab, var(--accent) 14%, #FFFDF7)`, ink accent, border accent. Idle: bg `#F7F2E9`, ink `#6E6355`, border transparent. Tapping a chip = same as tapping the shape (incl. auto-flip).

Footer hint: "Tap a muscle or a chip — related exercises light up below." 11px `#B7AB9C` centered.

```js
const muscles = {
  quads:  { name:'Quadriceps', side:'front', tag:'primary',   ex:['Back squat','Leg press','Walking lunges'] },
  glutes: { name:'Glutes',     side:'back',  tag:'primary',   ex:['Back squat','Romanian deadlift','Walking lunges'] },
  hams:   { name:'Hamstrings', side:'back',  tag:'primary',   ex:['Romanian deadlift','Leg curl'] },
  calves: { name:'Calves',     side:'back',  tag:'secondary', ex:['Seated calf raise'] },
  core:   { name:'Core',       side:'front', tag:'secondary', ex:['Back squat','Walking lunges'] },
  lowback:{ name:'Lower back', side:'back',  tag:'secondary', ex:['Romanian deadlift'] },
};
```
(Only this session's muscles get chips/hotspots; ex lists drive the exercise-row highlight in §2.1.5.)

## 2.3 Interaction chain (the point of the screen)

Muscle tap → (a) body flips to the right side if needed, (b) shape goes to opacity 1 and breathes, others dim ×0.3, (c) info banner pops in, (d) matching chips light up, (e) matching exercise rows tint accent-9%. Everything reverses on second tap. All transitions ≤ .3s; no layout shift except the banner.

## 2.4 History card + Workout preview sheet

Card: radius 24px, padding `8px 18px 10px`. Header row (padding `12px 0 4px`): "HISTORY" + right "last 30 days · as imported" 10.5px `#B7AB9C`.

Rows (buttons, padding `10px 0`, bottom border, `active` opacity .6):
- **date tile** 44×44, radius 14px: day 15px/800 + month 9px/800 uppercase (opacity .7). Today's tile: bg `color-mix(in oklab, var(--accent) 13%, #FFFDF7)`, ink accent; others: bg `#F7F2E9`, ink `#8A7E70`.
- title 14px/700; muscles line 11.5px `#B7AB9C` ellipsized.
- right: meta 12px/600 `#8A7E70` + `VIA {SRC}` 10px/800 ls .5px `#B7AB9C`; chevron-right 40% opacity.

```js
const history = [
  { d:'11', mo:'Jul', title:'Leg day',       meta:'52 min · ~430 kcal', mus:'Quads · Glutes · Hamstrings',  src:'GARMIN', today:true,
    ex:[['Back squat','4 × 8 · 80 kg'],['Leg press','3 × 12'],['Romanian deadlift','3 × 10 · 60 kg'],['Walking lunges','2 × 20 steps'],['Seated calf raise','4 × 15'],['Leg curl','3 × 12']] },
  { d:'09', mo:'Jul', title:'Push day',      meta:'48 min · ~380 kcal', mus:'Chest · Shoulders · Triceps',  src:'GARMIN',
    ex:[['Bench press','4 × 8 · 60 kg'],['Overhead press','3 × 10 · 32 kg'],['Incline dumbbell press','3 × 12'],['Cable fly','3 × 15'],['Triceps pushdown','3 × 12']] },
  { d:'08', mo:'Jul', title:'5 km easy run', meta:'31 min · ~290 kcal', mus:'Calves · Quads',               src:'STRAVA',
    ex:[['Easy run','5.0 km · 6:12 /km']] },
  { d:'07', mo:'Jul', title:'Pull day',      meta:'44 min · ~350 kcal', mus:'Lats · Biceps · Core',         src:'FITZONE',
    ex:[['Deadlift','3 × 5 · 100 kg'],['Lat pulldown','4 × 10'],['Seated row','3 × 12'],['Biceps curl','3 × 12'],['Face pull','3 × 15']] },
  { d:'05', mo:'Jul', title:'Full body',     meta:'55 min · ~410 kcal', mus:'Quads · Chest · Lats',         src:'FITZONE',
    ex:[['Back squat','3 × 10 · 70 kg'],['Bench press','3 × 10 · 55 kg'],['Lat pulldown','3 × 12'],['Plank','3 × 45 s']] },
];
```

**Preview bottom sheet** (tap a history row):
- Backdrop `rgba(60,50,38,.35)` + blur 4px, `vtFade .3s`; its opacity follows the drag: `max(.2, 1 − dragY/320)`.
- Sheet: bg `#FBF6EC`, radius `30px 30px 0 0`, padding `14px 22px 28px`, shadow `0 -14px 44px rgba(80,60,40,.22)`. Enter `vtSheetUp .45s cubic-bezier(.22,.9,.32,1)`; close `vtSheetOut .3s ease` then unmount after **290ms**.
- Grab handle: 42×5, radius 3, `rgba(120,100,75,.22)`, centered.
- **Drag-to-dismiss** (pointer events on the sheet, `touch-action:none`, pointer capture on down):
  ```js
  onMove: dragY = max(0, clientY - startY);          // translateY(dragY)
  during drag: transition none; on release: transition transform .3s cubic-bezier(.2,.8,.3,1)
  onUp: dragY > 110 ? close() : spring back to 0
  ```
- Content: 48px date tile (accent-13% bg, accent ink) + title 19px/700 + "{meta} · via {SRC}" 12px `#8A7E70`; muscle chips (accent-12% bg, accent ink, 11.5px/700, radius 12, padding 5px 11px); exercise list in an inner `#FFFDF7` radius-20 card (24px index tiles, name 13.5px/600, detail 12px `#8A7E70`); footer "Preview · drag down to close" 11px `#B7AB9C` centered.

---

# 3 · Shared tokens (recap)

- Page `#F7F2E9` · card `#FFFDF7` · sheet `#FBF6EC` · inset `#F7F2E9`/`#F0EDE2` · track `#F0E9DA`
- Ink: primary `#453E35`/`#4A4238` · secondary `#8A7E70`/`#6E6355` · muted `#B7AB9C`
- Accent: `var(--accent)` default `#C4704E`; on-accent text `#FFF9F1`. Derived tints always via `color-mix(in oklab, var(--accent) N%, #FFFDF7)` with N ∈ {8,9,10,12,13,14,25,35} as specified — never hardcode the tints, they must follow the theme (vacation mode swaps the accent globally).
- Meal/food accent `#A66A3F` on `#F7E7D4` · movement/green `#5F7A61` on `#E7EDE1` · macro colors P `#8CA58A` C `#C98A3F` F `#E0A375`
- Badges "estimate"/"via …": 9.5px/800, ls .8px, uppercase, radius 8, padding 2-3px 7px
- Card shadows: `0 10px 26px rgba(105,84,60,.08)` (primary), `0 8px 20px rgba(105,84,60,.06)` (list), `0 6px 16px rgba(105,84,60,.05)` (row)
- Copy voice: lowercase-calm, "·"-separated metas, "~" before every estimated number, sources always credited ("via Garmin", "as imported"). Never gamified language.
