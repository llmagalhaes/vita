# App implementation spec — Vita v3 (Plan Setup · plan states · Home v3 · evening recap · nav dots)

App-team spec for the **v3 design handoff** `docs/v3/design_handoff_vita_v3/README.md` (HIGH-FIDELITY —
px/colors/keyframes/copy below are lifted from it and from the prototype runtime inside
`Vita Prototype v3.dc.html`; on any visual conflict the handoff README wins). This is an EVOLUTION of
the shipped app (sessions ≤18c, Jest 250/250), not a rewrite. The backend Fable lead is writing
`docs/v3/backend-spec.md` in parallel — §1.2 "Contract needs" is the reconcile list; nothing there is
assumed, everything is stated.

Repo paths are relative to `app/services/vita-app/` unless rooted.

Tickets: APP-082..APP-092 (§16 — doc only, orchestrator files after CEO review). Dependency order:

```
backend contract v0.7.0 merged (docs/contracts/vita-api-v0.yaml)
  └─ APP-082 types regen + client + mock v3 seed/lifecycle      (Sonnet)
       ├─ APP-083 toast-with-undo + token/motion/i18n deltas    (Sonnet)
       ├─ APP-085 plan-state & day-overlay stores + pure math   (Opus 4.8)
       │    ├─ APP-086 Plan Setup flow + onboarding deltas      (Opus 4.8)  [also needs 083]
       │    ├─ APP-087 Today's plan tab (meal+workout states)   (Opus 4.8)  [also needs 083, 084]
       │    └─ APP-088 Home v3 (banners, recap card, empty)     (Opus 4.8)  [also needs 083, 084]
       ├─ APP-084 nav v3: 6-tab pager + NavDots strip           (Opus 4.8)
       │    └─ APP-091 Workout hub tab                          (Opus 4.8)
       ├─ APP-089 evening recap notification                    (Sonnet)    [after 085]
       ├─ APP-090 Trends consistency card                       (Sonnet)
       └─ APP-092 18b review-minor fold-ins                     (Sonnet)    [independent]
```

---

## 0 · What exists today (read before building)

- **Nav:** `src/nav/TabsPager.tsx` — ONE finger-following pager co-mounting 3 tabs;
  `TAB_ROUTES = ["/home","/trends","/habits"]` (line 31); placeholders in `app/(main)/_layout.tsx`
  keep pathname alive; programmatic nav = `router.replace(TAB_ROUTES[i])`, the pager animates the
  slide itself. `snapTarget` = ±1 page max. `pagerRef` seam for inner gestures
  (`blocksExternalGesture`). **No dot strip exists.** All non-tab screens are Stack pushes with
  `animation:"fade_from_bottom"`.
- **Home:** `src/tabs/Home.tsx` — banner order today: vacation → check-ins `CountBanner` →
  offline-review `CountBanner` → hero (82px `fonts.extraLight`, ls −2.5) → water/macros → energy →
  plan/program `SetupRow`s → `DaySection` + `Timeline`. Header = greeting + single account icon
  (APP-068). Day totals: `entriesForDay` + sums (`kcalToday`, `waterMl`, `spentKcal` incl.
  `healthActiveKcalToday`). Timeline empty state = one text line. **No recap card, no morning
  empty-state card.**
- **Plan:** `app/(main)/plan.tsx` = the Eating Plan DOC screen (44px kcal, headroom bars, live
  micros, always-tappable qty pill → `src/plan/PortionPop.tsx` on `PopOverlay`, Edit mode stays —
  A7). `src/db/plan.ts` = kv doc cache + **portions overlay** (`getPortions/setPortion/
  clearPortions`, sparse, coalescing outbox op `portions`, `pruneOverlayAfterEdit`).
  `src/plan/compute.ts` = `qtyOf/itemTotals/mealTotals/planDailyTotals/planMicroTotals/barPct/
  qtyLabel/kcalLabel/boundsOf`. **No plan status model** (presence = `getCachedPlan() !== null`),
  **no Today's-plan screen, no workout skip state, no meal options/swaps anywhere.**
- **Program:** `app/(main)/program.tsx` doc editor; `TrainingProgramDraft.days[]` (`ProgramDay
  {name, exercises}` — **no per-day kcal**). One program doc; days ARE the "Leg day / Upper body"
  units.
- **Habits/notifications:** `src/db/habits.ts` (`HabitKind "plain"|"plan"|"digest"`),
  `src/habits/notifier.ts` (seam; per-habit WEEKLY triggers via expo-notifications;
  `plannedNotifications` pure; `notificationsPaused()` gates master switch + vacation).
  **No daily/evening app-level notification exists.**
- **Toast:** `src/ui/toast.ts` module store (string only, 2200ms) + `src/ui/ToastHost.tsx`
  (dark pill, bottom 122, `pointerEvents:"none"` — NOT tappable). Call sites: habit remove,
  vacation on/ended ×2, capture added/offline, HC toasts.
- **Trends:** `src/tabs/Trends.tsx` — range caption at lines ~87–89, then Food/Activity segment,
  then `TrendCard` stacks. `aggregateDays` buckets days; **no consistency metric**.
- **Capture:** `src/capture/CapturePill.tsx` (mic/text/camera + Home/Trends/Habits shortcuts),
  `CaptureContext` (`submit/requestTextEntry/prefill`), `getRecognizer()` speech seam,
  `src/onboarding/planImport.ts` (`importPdf` → requestUpload → presigned PUT → caller parses).
- **Onboarding:** `app/onboarding.tsx`, `TOTAL_STEPS = 5` (line 14): Name → Keep track →
  Eating plan (`PlanStep`) → Training (`PlanStep`) → All set. Finish saves settings + confirmed
  docs, `router.replace("/home")`. Already matches the handoff's 5 steps (APP-072 removed connect).

Fragile paths (sessions 13/14 lessons — respect, do not touch):
- TabsPager pan gesture + `pagerRef`; **never setState mid-gesture** (pre-mount from deferred
  effects only).
- Mount tweens start from `onLayout` (`useStartOnLayout`), never bare `useEffect`.
- `"worklet"` directives on pure helpers used inside `useAnimatedStyle`.

---

## 1 · Contract v0.7.0 consumption (APP-082)

### 1.1 What the app consumes (per the handoff's target data model)

`EatingPlanDraft` (the DOC — not only the parse response; setup must survive app restart):

```
meals: [{ name, time?, kcal?, note?,
          options?: [{ name, kcal, items: PlanItem[] }],   // "Opção 2 – Brunch" etc.
          items: PlanItem[] }]
PlanItem += swaps?: [{ name: string, qty: string }]        // display strings: "150g",
                                                           // "as much as you like", "1 medium"
hydration?: { mlPerDay: number }                           // 2500
supplements?: [{ name, dose, timing, duration? }]
report?: { totals: { kcal, proteinG, carbsG, fatG } }      // the PDF's report page (1716 kcal)
status: "ready" | "review"                                 // plan lifecycle (see §2.1)
```

Parse response additionally: `pageCount?: number` (findings line "13 pages").

App work in APP-082:

1. `npm run api:gen` after the merge → `api:check` clean, `tsc` 0. Don't hand-type shapes.
2. `src/api/client.ts`: thread `status` through `getPlan/createPlan/updatePlan`; no new endpoints
   expected (see 1.2 #4 — if the merged contract ships a swaps/status endpoint instead, regen and
   match it).
3. `src/api/mock.ts`: seed a **v3 fixture** shaped like the prototype's `importedPlan`
   (5 meals: Pre-workout 06:40 / Post-workout 08:30 / Lunch 13:00 [2 options] / Snack 16:30 /
   Dinner 20:00 [4 options], per-meal notes, items with FULL swaps lists — take names/qtys/counts
   from `docs/v3/design_handoff_vita_v3/` prototype `importedPlan`, ~5 inline swaps each is
   enough for the mock as long as at least ONE item has > 5 swaps so the "+N more" sheet is
   exercisable in mock mode, e.g. give Banana 20 swaps), `hydration {2500}`, the 4 supplements,
   `report.totals {1716, 188.6, 153.4, 47.9}`. **A4 discipline carries over: example data /
   deterministic golden test input only — every assert computed from the fixture.**
   `mockParsePlan` returns the same shape + `pageCount: 13`. Mock lifecycle: `createPlan` stores
   `status` as sent; `updatePlan` echoes it; parse drafts default `"review"` semantics are
   APP-side (§2.1), the mock just stores the field.
4. Keep the v0.6.0 §1.2 11-item fixture and its tests untouched (they gate compute math).

### 1.2 Contract needs (explicit — for the orchestrator to reconcile with backend-spec)

1. **`swaps` must be the FULL substitution list per item** ({name, qty} display strings). The
   "+N more → searchable bottom sheet" is REAL in v3 — a truncated list + `moreCount` cannot feed
   it. `moreCount` should be dropped or documented as derived (`swaps.length` − inline 5); if the
   backend keeps it, it must be redundant, never a substitute for the data. **This is the one
   hard requirement.** (~214 swap strings ≈ a few KB — no size concern.)
2. **`status: "ready"|"review"`** as a plain stored/echoed field on the plan resource (POST and
   PUT bodies + GET response). The APP sets it: parse-imported plans are saved `"review"`;
   "Finish setup" and manual edits save `"ready"`. No server-side transition logic requested.
   `"none"` is client-derived (no plan) — not a stored value.
3. **`options[]`, `hydration`, `supplements`, `report` live on the DOC** (EatingPlanDraft), not
   only on the parse response — setup is resumable after restart and options remain switchable
   in Today's plan afterwards.
4. **Persisted "usual" swap choice — recommendation A (no new endpoint):** at Finish setup the
   app REWRITES the doc — chosen option moved to `options[0]` (options[0] = the usual, by
   convention), chosen swap becomes the item's `name`/`quantity`/`unit` and the original is
   prepended to that item's `swaps` — then one `PUT /plan`. Nothing is lost (the original stays
   in swaps), nothing new server-side. If the backend spec ships a selection map instead
   (e.g. `PUT /plan/swaps {itemId: swapIndex|null}` + echo on GET /plan + reset on re-import +
   422 unknown id), the app adapts — but A is smaller on both sides. **Note:** swaps carry NO
   nutrition (the PDF doesn't have it; nutritionist substitution lists are isocaloric by design)
   — a swapped item keeps the original item's per-unit nutrition; the `~` estimate marker covers
   it. Both teams must agree on this display rule.
5. **`pageCount?` on the eating-plan parse response** (optional; findings line omits pages when
   absent).
6. **`ProgramDay.kcalEstimate?: number`** (optional) — Today's workout tab shows
   `~{kcal}` per day (handoff: Leg day 430 / Upper body 380). When absent the kcal line is
   simply omitted (honest).
7. Portions endpoints (`GET /plan portions`, `PUT /plan/portions`) **unchanged** — day scoping
   (§2.2) is client semantics; the server keeps storing one sparse map.
8. `PlanItem.id` remains the overlay/swap key everywhere (A2 rules unchanged: ids at save/parse
   time, no legacy handling).

---

## 2 · State model (APP-085)

### 2.1 Plan status lifecycle

`mealPlanStatus(): "ready" | "review" | "none"` in `src/db/plan.ts` — derived, no new storage:
`getCachedPlan() === null → "none"`, else the doc's `status ?? "ready"` (old cached docs without
the field read as ready). Training: `trainStatus(): "ready" | "none"` = program presence (no
review flow for programs). Transitions:

- Onboarding/Today import (parse path) → `savePlan(doc, source)` saves with `status:"review"`.
- Plan Setup "Finish setup" → doc rewrite (§5.6) saved with `status:"ready"`.
- Manual editor save (Edit mode) → keeps the doc's current status (editing a review-state doc
  does not silently activate it).
- Re-import replaces the doc (existing savePlan semantics; overlay reset + prompt-hidden reset
  §2.4 apply).

### 2.2 Day-scoped portions overlay (semantics change vs v0.6.0 — CEO Q2)

The handoff is explicit: *"Tweak anything — it only counts for today, tomorrow starts fresh."*
The shipped v0.6.0 overlay persists until the plan changes. v3 makes it **day-scoped**:

- New kv key `plan.portionsDate` (ISO `YYYY-MM-DD`), written by `setPortion` alongside the map.
- `getPortions()` gains the rule: if `portionsDate !== todayISO()` → return `{}` AND lazily
  reset (`clearPortions()` + `enqueuePortionsPush()` so the server map empties too — one
  coalesced PUT of `{}` on the first touch of a new day). Pure date compare, no timers.
- Everything downstream (compute lens, Home plan row, plan.tsx totals) is untouched — they
  already read through `getPortions()`.
- Outbox op, poison taxonomy, hydrate rules: unchanged, except hydrate rule 3 also stores
  `portionsDate = today` when adopting server portions (server map is only ever today's — the
  app empties it at rollover).

### 2.3 Day workout skips + selected program day

New in `src/db/plan.ts` (same kv pattern; device-local ONLY, never the outbox — day skips are
ephemeral UI state, backend builds nothing):

```ts
kv "workout.daySkips"     → { [dayName: string]: { [exerciseName: string]: true } }
kv "workout.daySkipsDate" → "YYYY-MM-DD"   // same lazy day-reset rule as §2.2
kv "workout.selectedDay"  → string          // chip selection, persists, no date scoping
export const getDaySkips = (): Record<string, Record<string, true>>
export function toggleDaySkip(dayName: string, exercise: string): void  // + logChanged()
export function clearDaySkips(): void
```

### 2.4 Setup prompts

- kv `plan.setupPromptHidden` (bool) — the Home "Your meal plan is in" banner dismiss.
  **Reset to false inside `savePlan`** (any new import shows the banner again).
- kv `nav.swiped` (bool) — the one-time SWIPE hint (§4.3).
- kv `int.promptDismissed` (bool) — the integrations prompt (§7.4).

### 2.5 Pure math (all in `src/plan/compute.ts` / new `src/plan/setup.ts`, unit-tested)

```ts
// §5 findings lines — computed from the parse result, never hardcoded:
export function setupFindings(doc, pageCount?): string[]
// 1. `${pageCount} pages`                        (omit when pageCount == null)
// 2. `${nMeals} meals · ${nSwaps} swap options`  (nMeals = doc.meals.length; nSwaps = Σ over
//     every item of every meal AND every option: item.swaps.length)
// 3. i18n "hydration & supplement notes"         (only when hydration or supplements present)

// §6 changes-today count:
export function changesToday(plan, portions, skips): number
// = # overlay keys whose value ≠ the item's doc quantity  +  Σ skipped exercises across all days

// §6 workout kcal:  ~Math.round(day.kcalEstimate * active / total)  (null when kcalEstimate absent)
export function dayWorkoutKcal(day, skips): number | null

// §9 recap line (shared by Home card + notification body):
export function recapLine(nMeals, nWorkouts, waterMl): string
// "2 meals, a workout and 1,250 ml of water — logged, not judged."
// pluralize meal(s); workouts: 0 → segment omitted, 1 → "a workout", n → "N workouts";
// water 0 → segment omitted; all zero → "" (callers hide).
```

Ordinal-week helper lives in `src/trends/consistency.ts` (§10).

### 2.6 Portions drain race fix (18b minor, folded here — it touches the same store)

`src/db/outbox.ts` portions branch, exact recipe: snapshot `const sent = JSON.stringify(
getPortions())` BEFORE `api.putPlanPortions(...)`; after the await, if
`JSON.stringify(getPortions()) !== sent` → delete the outbox row, `enqueuePortionsPush()`, and
**do NOT `clearDirty`** (the newer write's dirty flag survives); else `clearDirty` + delete row
as today. Test: mutate the map between the mocked PUT resolving and drain continuing → a second
row exists and dirty is still set.

---

## 3 · Toast with Undo — global pattern (APP-083)

`src/ui/toast.ts` (extend, don't fork):

```ts
export function showToast(message: string, opts?: { undo?: () => void }): void
// auto-hide: 2200ms without undo (unchanged), 3600ms with undo (handoff §7).
// A new toast replaces the current one and cancels its undo window (no stacking).
export const getToast = (): { text: string; undo?: () => void } | null
```

`src/ui/ToastHost.tsx`: pill unchanged (bottom 122, dark `#453E35`, radius 18, 13/600
`#F7F0E4`, `shadowDark`) + when `undo` present append a Pressable **"Undo"** 13px
`fonts.extraBold` color `colors.toastUndo #F2C08C`, marginLeft 10. Host root gets
`pointerEvents="box-none"`, the pill `pointerEvents="auto"`. Undo tap → clear toast + run
callback once.

Call sites after this round (enumerated; each listed in its owning ticket's AC):

| Site | Message | Undo action |
|---|---|---|
| Plan Setup swap pick (§5.4) | "Your usual is now {name}" | restore previous selection |
| Plan Setup ORIGINAL restore | "Back to {name}" | — |
| Plan Setup banner dismiss (§7.3) | "Anytime — it's waiting in Today's plan" | — |
| Finish setup (§5.6) | "Plan ready — {n} meals · {m} new check-ins" | — |
| Portion modal close-with-change (§6.2) | "Adjusted for today · {item}" | restore open-time qty |
| Exercise skip (§6.3) | "Skipped for today · {name}" | un-skip |
| Today Revert (§6.4) | "Back to your everyday plan" | restore both maps |
| Habit removal (existing `Habits.tsx:280`) | "Habit removed · {name}" | re-insert the habit |
| Integrations prompt dismiss (§7.4) | "Anytime — swipe left for Integrations" | — |
| Existing sites (vacation on/ended, capture added/offline, HC) | unchanged, no undo | — |

---

## 4 · Navigation v3 — 6 positions + dot strip (APP-084)

### 4.1 Pager

`src/nav/TabsPager.tsx`:
`TAB_ROUTES = ["/today", "/home", "/trends", "/workout", "/habits", "/integrations"]`
(handoff §2 order). Row width `width * 6`. Initial route stays `/home` (index 1).
**Lazy mount:** co-mounting 6 chart-heavy screens is the perf risk — keep a `mounted: Set<number>`
(state), initially `{current}`; grow to current ± 1 from a **deferred effect after settle**
(session-6 pitfall 1 — NEVER from the gesture); unmounted slots render `null` inside their
width-slot View. `snapTarget` (±1) untouched. `settle()` additionally sets kv `nav.swiped = true`
**when the transition was gesture-driven** (flag captured at gesture begin, read at settle — no
mid-gesture setState).

New tab screens (content moves, routes become placeholders like home/trends/habits):
- `/today` → `src/tabs/Today.tsx` (§6, new).
- `/workout` → `src/tabs/WorkoutHub.tsx` (§11, new).
- `/integrations` → `src/tabs/Integrations.tsx` = the current `app/(main)/integrations.tsx`
  content moved verbatim (platform gating intact); the route file becomes a null placeholder.
  Links elsewhere (`account.tsx` Your setup) switch `router.push` → `router.replace`.

`CapturePill` nav shortcuts stay Home/Trends/Habits (prototype pill is identical — the dots are
the complete map, the pill is the shortcut subset).

### 4.2 NavDots strip (new `src/nav/NavDots.tsx`, mounted once in `app/(main)/_layout.tsx`)

- Visible only `onTab && !useAnySheetOpen()` (same gate as the pill). Absolute, top = safe-area
  top + 6 (prototype: 46px on the 844 canvas incl. status bar), centered row, gap 6,
  `pointerEvents:"box-none"` wrapper.
- Position 0 = the word **"TODAY"**: 9px `fonts.extraBold`, uppercase, letterSpacing 1.2,
  paddingRight 3; color accent when active else `colors.labelMuted`; color animates
  `withTiming(300)`.
- Positions 1–5 = dots 5×5 radius 3, `colors.dotIdle`; the ACTIVE dot animates to width 16 +
  accent fill (`withTiming(300)` on width and color — handoff `transition: width .3s,
  background .3s`).
- Active index from the settled `usePathname()` (same source the pill uses). All six tappable
  (hitSlop ≥ 10) → `router.replace(TAB_ROUTES[i])` + set kv `nav.swiped = true` (prototype does).
- **SWIPE hint**: after the last dot, "SWIPE" 9px/800 uppercase `colors.labelMuted`, rendered
  until kv `nav.swiped` is true, then gone permanently (no animation needed beyond FadeOut).

### 4.3 Home header

Already a single account button (APP-068) — v3 keeps greeting + date + account. Confirm no
"Today's plan · swipe" pill exists (handoff: removed). No change expected beyond §7.

---

## 5 · Plan Setup flow (APP-086) — new full-screen `app/(main)/plan-setup.tsx`

Stack screen (pill auto-hides — not a tab). Screen padding `60 22 150` via ScrollView content,
column gap 13. Entry points: Home banner **Continue** (§7.3), Today review-state **Continue setup
→**, Today none-state **Import a PDF** / **Type or speak it** (§6.1), meal-plan PDF import
anywhere. Entered via `router.push("/plan-setup"`, params `{ mode: "parse" | "review" }`)`:
`parse` = a fresh import job runs now (parsing state first); `review` = the cached review-status
doc is reviewed directly.

**Header row:** existing `BackButton` (34px look is close enough — reuse, don't fork) ·
"PLAN SETUP" 11.5/800 uppercase `colors.labelMuted` centered · right step counter "2 of 6"
11/700 labelMuted (hidden during parsing).

### 5.1 Parsing state (match exactly — handoff §1a)

Centered card: `colors.card`, radius 26, padding `32 22`, border 1 `rgba(120,100,75,.06)`,
shadow ≈ `shadow` token; entry `vtPop` = `entering={ZoomIn.duration(350)}` (motion.pop bezier,
scale .92 → 1). Stack centered, gap 6:

1. **Icon well** 52×52 radius 18 bg `colors.well #F3EBDD`, marginBottom 6 — loops **vtBreath**:
   `withRepeat(withTiming(1.07, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true)`
   (= 1.6s full cycle, 7% pulse — a calm breath, NEVER a spinner). Start from `onLayout`
   (`useStartOnLayout` — fragile-path rule). Inside: 22×26 document SVG, stroke
   `colors.estimateInk #A66A3F` width 1.6, round caps: outline `M3 1.5 h10 l6 6 v17 h-16 Z`,
   folded corner `M13 1.5 v6 h6`, text lines `M6.5 13 h9 · M6.5 16.5 h9 · M6.5 20 h6` (width 1.4).
2. Title **"Reading your plan…"** 17/700 ink.
3. **Findings** — 3 lines 12.5px `colors.muted`, each `FadeInUp(400).delay(…)`. Production
   timing (the handoff's 0.5/1.0/1.5s are relative to a fake 2.6s parse): the upload+parse call
   runs while only the well+title show; **when the parse resolves**, the findings from
   `setupFindings(doc, pageCount)` (§2.5 — REAL counts) fade in with delays **0 / 500 / 1000ms**,
   and the state auto-advances to review **1600ms after resolve** (≈ the prototype's 2.6s−1s
   feel: every line lands, nothing lingers). No exit animation — the review card replaces it
   entering with vtIn.
4. Parse failure → the card swaps to the existing calm error pattern (reuse PlanStep's error
   copy `onboarding.plan.error` semantics): body "That didn't parse — try again or type it
   instead." + Retry + "Type or speak it" ghost. No dead ends.

On resolve the doc is saved immediately (`savePlan(doc, "pdf")` with `status:"review"` — §2.1),
so abandoning setup mid-way leaves the review state + Home banner. Re-entering goes straight to
review (`mode:"review"`).

### 5.2 Review chrome — one meal per step

Steps = `doc.meals.length + 1` (5 meals + Notes & habits = 6 for the reference PDF — counts come
from the doc, never constants). Local state: `step`, `optIdx: {stepIdx: number}`, `swapOpen:
string | null` (key `"{step}_{optIdx}_{itemIdx}"`), `sel: {key: swapIndex}` (chosen usuals),
`habToggles`.

- **Progress bar:** flex-row of `nSteps` flex-1 segments, height 4, radius 2, gap 5. Done
  `#8CA58A` (colors.greens[1]) · current accent · upcoming `rgba(74,66,56,.13)`; color animates
  `withTiming(400)`.
- **Step 1 only, intro line** 12.5px `colors.muted` lineHeight 1.5×:
  "One meal at a time — just check what Vita read. Nothing here is a target."
- Step transition: card re-keys on `step` and enters `FadeInUp(300)` (vtIn). Back button: step 0
  → `router.back()`; else step−1 (swapOpen reset on every step/option change).

### 5.3 Meal card (radius 26, padding 18, gap 12)

- Header: meal name 20/700 · time 11.5/700 labelMuted (baseline gap 8) · right kcal badge
  `~{kcal} kcal` 11.5/800 `colors.estimateInk` on `colors.estimateBg`, radius 12, padding 5×10.
  kcal = current option's kcal when options exist, else meal.kcal (report values — display only).
- **Options selector** (only meals with `options[]`): label "PICK YOUR USUAL — SWITCH ANY DAY"
  11/800 uppercase labelMuted; wrapping chip row gap 6. Chip padding 8×12 radius 15, 12/700 name
  + kcal `~{k}` 10px at 65% opacity. Active: bg+border `#453E35`, text `#F7F0E4`; inactive: card
  bg, hairline border, ink `#6E6355`. **Switching options resets `swapOpen` to null** (selections
  `sel` are keyed per option so each option keeps its own chosen swaps).
- **Item rows** (full-width Pressable, padding 11×0, bottom hairline `rgba(120,100,75,.07)`,
  last none): 7px dot `#E8B48C` → name 14/600 `#4A4238` (shows the CHOSEN swap's name when one
  is selected) + **SWAPPED badge** when selected (9/800 uppercase accent ink on `tint(accent,10)`,
  radius 7, padding 2×6) → qty 11.5/700 `colors.muted` (chosen swap's qty, else item qty) →
  right **swaps chip**: `{n} swaps` (n = `item.swaps.length`) 10.5/800 accent on `tint(accent,10)`
  radius 11 padding 4×8, with the existing `Chevron` at 9px rotating 180° (250ms) when open.
  Items with `swaps.length === 0`: faint "—" 11 labelMuted, row not expandable.

### 5.4 Expanded swap list (below the row, marginLeft 17, enters `FadeInUp(250)`)

- Hint 10.5/700 labelMuted: "Tap one to make it your usual — you can still swap on any single
  day."
- **Inline shows the first 5 swaps** as radio rows (Pressable padding 6×0, 12/600 `#6E6355`,
  pressed opacity .6): 15px circle — idle border 1.5 `rgba(120,100,75,.3)`; selected accent-filled
  + white 9px check (tiny SVG). Row text `{name} · {qty}`.
- When a swap is selected, the FIRST row is the **original** (`{item.name} · {item.qty}` +
  right-aligned "ORIGINAL" 9.5/800 uppercase labelMuted) — tapping it restores: clear selection,
  collapse, toast "Back to {item.name}" (no undo).
- **Selection semantics (binding):** tapping a swap sets it as the item's usual → row name/qty
  update in place, SWAPPED badge appears, list collapses (`swapOpen = null`), toast
  **"Your usual is now {swapName}"** with **Undo** (restores the previous selection — which may
  be another swap or none). Selection is LOCAL setup state until Finish (§5.6); it is *not* a
  one-day change (one-day = Today's portion flow).
- Last row when `swaps.length > 5`: **"+ {swaps.length − 5} more in your plan →"** 11/700
  accent → opens the **SwapSheet** (build for real — the prototype's toast placeholder is out):

**`src/plan/SwapSheet.tsx`** — rides `SheetOverlay` (bg `colors.sheet`, drag-dismiss, keyboard
lift already built in): title = item name 17/700 + caption "{n} options from your plan" 11.5
muted; search `TextInput` (card bg, radius 14, hairline, placeholder "Search your plan's
options…", case-insensitive substring filter on swap name); below, the SAME radio rows over the
FULL swaps list (original pinned first with its ORIGINAL tag, always visible regardless of
filter), same selection semantics (select → sheet closes → badge/toast/Undo). FlatList — 25
rows max per item, no virtualization concerns.

### 5.5 Nutritionist note + CTA

- Note (when `meal.note` or the current option context has one): italic 12px `colors.muted` on
  `#FBF6EC`, radius 14, padding 10×13, micro-tag "· FROM YOUR NUTRITIONIST" 9/800 uppercase
  labelMuted.
- CTA **"Looks right"**: existing `Button` (height 52 radius 26 accent, 15/700 `#FFF9F1`,
  `shadowCta(accent)`) → step+1. Below, centered ghost link **"Fix something"** 12.5/600
  labelMuted underlined → **routes to the existing Eating Plan Edit mode**
  (`router.push("/plan")` + auto-enable edit via a route param `plan.tsx` already can honor or a
  one-line store flag) — the doc is already saved in review status, so the shipped editor IS the
  editable card; no new UI (CEO Q5; prototype left it out of scope).

### 5.6 Final step — "Notes & habits" + Finish

Same card chrome. Title "Notes & habits" 20/700 + "from the plan" 11.5 labelMuted. Toggle rows
built from the DOC (not hardcoded): one row per `supplements[]` entry (name 14/600 = "{name} —
{dose}", sub 11.5 muted = timing [+ "· for {duration}"]) plus a first row from `hydration`
("Water — 2,500 ml a day" / "split across the day, between meals"). All default ON. Switch:
38×22 radius 11, 18px white knob translating 2→18 (`withTiming(250)`), track on `#8CA58A` /
off `#E4DCCB` — the existing animated `Toggle` if prop-compatible, else a 10-line local one.

Footer microcopy 11.5 labelMuted: "Anything you keep on becomes a gentle check-in — edit or
remove them in Habits." CTA **"Finish setup"** →

1. **Create habits** for every ON toggle via `createHabit` (kind `"plain"`, daily): supplements
   at times from a tiny timing heuristic in `src/plan/setup.ts` — timing contains "lunch" or
   "dinner" → 13:00, "morning"/"wake" → 08:00, else 10:00 (reference PDF ⇒ 10:00/13:00/13:00,
   matching the handoff); water at 10:00 named from hydration ("Water — 2,500 ml"). Honest rule:
   the water toggle creates a real habit too (the prototype silently dropped it — CEO Q6).
   `refreshNotifications()` after.
2. **Apply usuals** (contract-need #4, recommendation A): rewrite the doc — per meal with
   options, move the chosen option to `options[0]`; per selected swap, item.name/quantity/unit ←
   the swap (qty display string parsed leniently: leading number+g/ml → quantity+unit, else
   quantity 1 unit = the raw string; pure helper `applyUsuals(doc, optIdx, sel)` in
   `src/plan/setup.ts`, unit-tested), original prepended to `swaps`. Set `status:"ready"`.
   One `updatePlan` (flows through `pruneOverlayAfterEdit` — changed items correctly drop any
   stale override).
3. Navigate `router.replace("/today")` (meal tab) · toast "Plan ready — {n} meals · {m} new
   check-ins" (m = habits created; m = 0 → "Plan ready — {n} meals · ~{kcal} kcal/day" with the
   computed total).

### 5.7 Onboarding deltas (in this ticket)

- Eating-plan step subtitle (i18n `onboarding.plan.*`) → "…you'll review it meal by meal right
  after setup, no rush." (exact key in §13).
- PlanStep PDF/describe confirm now saves with `status:"review"` (§2.1) and does NOT open setup
  inside onboarding — finishing onboarding with an imported plan lands on Home with the banner
  (§7.3) and Today in review state. Skipping leaves none. No step count change (already 5).

---

## 6 · Today's plan tab (APP-087) — new `src/tabs/Today.tsx`

Header: "Today's plan" 21/700 + date caption; right "Home →" pill (card bg, hairline, 11.5/700 →
`router.replace("/home")`). Helper line 12.5 muted: "Tweak anything — it only counts for today,
tomorrow starts fresh." + accent link 12.5/700: "Edit everyday plan →" (meal tab →
`router.push("/plan")`) / "Edit training program →" (workout tab → `router.push("/program")`).
Segmented rail Meal plan / Workout: track `#F0EDE2` radius ~14, active thumb `#453E35` ink
`#F7F0E4` (existing `Segment` with a dark-thumb style variant — extend, don't fork).

State per tab from §2.1: `mealPlanStatus()` / `trainStatus()`.

### 6.1 Meal tab

**ready** —
- Summary card: `kcalLabel(planDailyTotals(doc, getPortions()).kcal)` at fontSize 34
  `fonts.extraLight` ls −1 + "kcal planned today" 12 muted; P/C/F bars identical spec to
  plan.tsx §4.3 of the v0.6.0 spec (barPct headroom, 250ms fills) — extract the bar row from
  `plan.tsx` into `src/plan/MacroBars.tsx` and reuse in both (+ Card A of PortionPop stays as
  is).
- One card per meal (name 15/700 · time 11.5 labelMuted · right `~{k} kcal` 12/700 muted):
  item rows exactly like plan.tsx view-mode rows (dot, name, **qty pill** from
  `qtyLabel(unit, qtyOf(item, portions))`, kcal) — extract the row (`src/plan/ItemRow.tsx`) and
  reuse. Meals with `options[]` render `options[0]`'s items (the usual) + a small chip row to
  switch option **for today** (chip style §5.3; switching swaps the displayed items for the day
  — display-only state kv-free: local useState is fine, resets naturally).
- Tap item/pill → **PortionPop** (§6.2).
- **Changes banner** when `changesToday(...) > 0` (§2.5): row card bg `tint(accent, 8)`, border
  1 `tint(accent, 25)`, radius 16, padding 10×14 — "{n} change{s} for today" 12.5/700 accent +
  right **Revert** button (accent text 12.5/800) → snapshot both maps, `clearPortions()` +
  `clearDaySkips()`, toast "Back to your everyday plan" + Undo (write both snapshots back +
  re-enqueue portions push).

**review** — dashed empty card (border 1.5 dashed `colors.dashedBorder`, radius 24, padding
26×20, centered): leaf icon in `colors.well` well 44px, "Your plan is imported" 15.5/700,
"Finish the setup — {n} meals to review, one at a time. Takes about a minute." 12.5 muted
(n from the doc), accent Button **"Continue setup →"** → `/plan-setup?mode=review`.

**none** — same dashed chrome: "No meal plan yet", "Vita counts whatever you log either way.
Bring a plan whenever you're ready.", two buttons: accent **"Import a PDF"** (→
`importPdf()` then `/plan-setup?mode=parse`) and ghost hairline **"Type or speak it"** (→
opens the existing describe path: a small sheet reusing `PlanStep`'s describe field + mic
(`getRecognizer`) → `api.parseEatingPlan({text})` → save review → `/plan-setup?mode=review`).
Both funnel into the SAME review.

### 6.2 Portion modal delta (extends the shipped `src/plan/PortionPop.tsx`)

Keep everything from v0.6.0 (Card A live totals, slider, numeric exact field A6, immediate
commit, Done only closes). Add:

- Capture `openQty` when the modal opens. **Delta badge** beside the kcal readout:
  `Math.round(per.k×q) − Math.round(per.k×openQty)` → 0: "no change" ink `colors.labelMuted` bg
  `#F0EDE2`; positive: `+{d} kcal` ink `#A66A3F` bg `#F7E7D4`; negative: `−{d} kcal` ink
  `#5F7A61` bg `#E7EDE1` (radius 9, padding 3×8, 10.5/800).
- Caption near the readout: "for today only" 10.5 labelMuted (day-scoped semantics §2.2).
- On close (Done/backdrop/back) **when q ≠ openQty**: toast "Adjusted for today · {item.name}"
  with Undo → `setPortion(item.id, openQty)`. No Cancel button (immediate-commit + Undo covers
  it — deliberate deviation from the prototype's cancel, consistent with the v0.6.0 CEO
  decision).

### 6.3 Workout tab

**ready** —
- Chip selector over `program.days` (chip style §5.3 dark-active) — "the user can keep N
  programs" maps to the program doc's days (CEO Q4); selection persists in kv
  `workout.selectedDay`.
- Summary card: `~{dayWorkoutKcal(day, skips)}` 34 `fonts.extraLight` (line omitted when
  kcalEstimate absent) + "{active} of {total} exercises" 12 muted + day name 15/700.
- Exercise rows (padding 11×0, hairline): 22px check circle left — on: bg `#E7EDE1` border
  `#E7EDE1`, ✓ ink `#5F7A61`; skipped: card bg, border 1.5 `rgba(120,100,75,.25)`, no glyph.
  Name 14/600 (+ strikethrough + ink `colors.labelMuted` when skipped) · detail (existing
  `exerciseLabel`) 11.5 muted · right "OFF TODAY" tag when skipped (9.5/800 uppercase
  `colors.estimateInk` on `colors.estimateBg`, radius 7, padding 2×6). Row tap =
  `toggleDaySkip(day.name, ex.name)`; when skipping → toast "Skipped for today · {name}" +
  Undo (un-skip). kcal + count recompute live (logChanged bump).
- Footer 11 labelMuted centered: "Your program keeps every lift for next time."

**none** — dashed card: dumbbell icon on `#E7EDE1` well, "No training program yet",
"Log workouts freely — or bring your program and Vita lays it out day by day. You can keep more
than one.", accent **"Import a PDF"** + ghost **"Type or speak it"** → minimal import flow
(NO 6-step review for programs): `src/workout/ImportProgramSheet.tsx` on SheetOverlay —
pdf: `importPdf()` → `api.parseTrainingProgram({fileRef})`; describe: text+mic →
`parseTrainingProgram({text})`; result card = summary + days list + Confirm ("Save program" →
`saveProgram(doc)`) / adjust via free text (existing PlanStep pattern — reuse its internals
where trivially liftable, else a lean 150-line sheet). Toast "Program imported — {n} workouts
found".

---

## 7 · Home v3 (APP-088) — `src/tabs/Home.tsx`

### 7.1 Banner slot order (render order after header)

① vacation (exists) → ② check-ins CountBanner (exists) → ②b offline-review CountBanner (exists
— not in the prototype; keep here, it's rare) → ③ **plan-setup pending** (§7.3) → ④
**integrations prompt** (§7.4). Then ⑤ evening recap card (§7.2) directly above the hero.

### 7.2 Evening recap card

Shown when `hour ≥ 18` AND the day has ≥1 timeline entry (all-zero → hidden, calm). Dark
gradient card — `expo-linear-gradient` 135° `#3E3A46 → #5C4A4A` (colors.recap tokens §12; new
dep, CEO Q1), radius 24, padding 15×17, gap 9, `shadowDark` at .18, enters
`ZoomIn.duration(400)` (vtPop).

- Header row: gold moon glyph (14px SVG crescent, `colors.toastUndo #F2C08C`) + "EVENING RECAP"
  11/800 uppercase ls 1 `#D8C9B4` + right `Chevron` (rotates on expand).
- Body 14.5/600 `#F7F0E4`: `recapLine(nMeals, nWorkouts, waterMl)` (§2.5 — computed from the
  day's log, the same sums Home already makes). Sub 12px `rgba(247,240,228,.65)`:
  "Tomorrow starts fresh."
- Tap toggles expansion (the animated `Card layout` height tween the water/energy expanders
  already use): dashed top border `rgba(247,240,228,.22)` paddingTop 9 —
  "~{kcalIn} kcal in · ~{spent} out — estimates, not scores" 12.5 `#F7F0E4` + **"See trends →"**
  pill (bg `rgba(247,240,228,.14)`, text `#F2C08C`, 11.5/700, radius 12, padding 5×10) →
  `router.replace("/trends")`.

### 7.3 Plan-setup pending banner

When `mealPlanStatus() === "review"` && !kv `plan.setupPromptHidden`: gradient `#FFF7EA →
#FBEFDD` (linear-gradient), border 1.5 `tint(accent, 26)`, radius 22, padding `12 12 12 15`,
row gap 10, enters ZoomIn(350):
leaf icon in a 38px white circle well → title "Your meal plan is in" 13.5/700 + sub
"Finish the setup — {n} meals, one at a time" 11.5 muted → accent **Continue** button (radius
15, padding 9×13, 12/700 `#FFF9F1`) → `/plan-setup?mode=review` · "×" dismiss 30px labelMuted →
set kv + toast "Anytime — it's waiting in Today's plan".

### 7.4 Integrations prompt

Android only (`Platform.OS === "android"` — APP-072 honesty), shown once when onboarding is done
&& Health Connect not connected && !kv `int.promptDismissed`. Same banner layout, neutral: card
bg + hairline, chain-link icon on `#E7EDE1` well; title "Bring what you already use" 13.5/700;
sub "Health Connect — whenever you like" 11.5 muted (honest — no Garmin/Strava name-dropping);
Connect → `router.replace("/integrations")`; × → kv + toast "Anytime — swipe left for
Integrations".

### 7.5 Morning empty state

When today's timeline is empty (`entries.length === 0`), replace the current one-line
`home.emptyTimeline` with a dashed card (border 1.5 dashed `colors.dashedBorder`, radius 24,
padding 26×20, centered): sun icon in `colors.well` well; "Nothing logged yet" 15.5/700; body
12.5 muted maxWidth 230 centered — with a ready plan:
"Your plan starts with {firstMeal.name.toLowerCase()} at {firstMeal.time}. Hold the mic when you
eat — or peek at what's ahead." (first meal = doc.meals[0] with a time; fall back to the
generic below when absent); without: "Hold the mic when you eat — Vita counts whatever you
log."; CTA (only with a plan) soft-accent "See today's plan →" (bg `tint(accent,10)`, ink
accent, radius 15, padding 9×13) → `router.replace("/today")`. Hero/water/macros already derive
from the (empty) log — no change.

### 7.6 Home plan row

Restyle the existing eating-plan `SetupRow` (Home.tsx ~702) into the prototype's collapsed
plan2 card: left "{left} kcal left" 15/700 ("left" = `max(0, planTotal − kcalToday)`,
planTotal = overlay-aware `planDailyTotals` — the APP-critical-fix call site stays) + sub
"kcal left of ~{planTotal}" 11.5 muted + progress track 6px (fill `min(100, kcalToday/planTotal
×100)%`, accent) + chevron. Expanded (Card layout tween): one row per meal — name 12.5/600 ·
right "logged · ~{k} kcal" ink `#5F7A61` dot `#8CA58A` when a meal entry with the same name
exists today, else "~{k} kcal planned" muted dot `#E4DBC9` · footer link "Open plan →" →
`/plan`. Training-program SetupRow unchanged. Hidden when status ≠ ready (the banner covers
review; none shows nothing — Today's tab has the CTAs).

---

## 8 · (folded into §5.7 — onboarding has no separate ticket)

## 9 · Evening recap notification (APP-089)

- `src/habits/notifier.ts` — extend the seam: `syncRecap(planned: { body: string } | null)`
  schedules (or cancels) ONE notification with identifier `"evening-recap"`, daily-content
  pattern: `Notifications.scheduleNotificationAsync({ identifier: "evening-recap", content:
  { title: "Evening recap", body }, trigger: today 20:30 })` — a one-shot for TODAY (not a
  repeating trigger: the body is computed from the log, which changes; a repeating trigger would
  freeze stale content). Cancel first, reschedule. Stub notifier records it (existing pattern).
- Recompute + resync: in the `logChanged` path (one subscriber module `src/habits/recap.ts`,
  registered in `_layout.tsx` like ToastHost): `body = recapLine(...) + " Tomorrow starts
  fresh."` from today's entries; sync only when now < 20:30, entries > 0, `Settings.notifRecap
  !== false`, `!notificationsPaused()`; else cancel. Cheap (a kv read + schedule call); no
  debounce needed unless the device pass says otherwise.
- If the app wasn't opened that day → no notification (nothing logged → nothing to recap;
  honest, calm — CEO Q7).
- Account screen (`app/(main)/account.tsx` notifications section): add row "Evening recap" /
  sub "a calm summary of your day · 20:30" with a Toggle on new `Settings.notifRecap`
  (default true). Master switch + vacation already gate via `notificationsPaused()`.
- Tapping the notification opens the app (default behavior lands on Home) — no deep-link work.
- Lock-screen appearance (handoff §5) is the OS rendering this notification — nothing else to
  build.

## 10 · Trends consistency line (APP-090)

- Pure `src/trends/consistency.ts`:
  `export function consecutiveLogWeeks(today: Date, weekHasLog: (start: Date, end: Date) =>
  boolean, isVacationWeek: (start: Date, end: Date) => boolean, maxWeeks = 12): number` —
  weeks are Monday-based; walk back from the current week; the current week counts if it has
  ≥1 log SO FAR; a week fully covered by vacation is skipped (bridges the chain, doesn't count
  toward n — vacation isn't absence); stop at the first non-vacation week with no logs; cap at
  maxWeeks. Adapter wires `weekHasLog` to `entriesInRange` (any type, count > 0) and
  `isVacationWeek` to the existing vacation range helpers.
- Card in `src/tabs/Trends.tsx`, rendered **between the range caption and the Food/Activity
  segment**, only when `n ≥ 2` (n = 1 or 0 → NOT rendered — it *disappears rather than resets*;
  never a zero state, never a number badge): card bg, hairline border, radius 16, padding
  10×14, row gap 10 — two-tone leaf SVG (`#8CA58A` body / `#A9BC9B` vein, 16px) + text
  12.5/600 `#6E6355`: i18n `trends.consistency.w{2..12}` ("Second/Third/…/Twelfth week in a row
  of showing up — steady beats perfect.") and `trends.consistency.many` ("Week after week of
  showing up — steady beats perfect.") for n > 12. **NEVER a numeric counter — the ordinal
  phrase is the whole display (product non-negotiable).**
- Tests: chain broken by an empty week → 0/1; vacation week bridges; current partial week
  counts; cap; phrase key selection.

## 11 · Workout hub tab (APP-091) — new `src/tabs/WorkoutHub.tsx`

The Workout dot needs a destination (prototype view `workout` = muscle map + exercises +
history). Program-centric hub, maximal reuse of the APP-080/081 work in `workout/[id].tsx`:

- Header "Workout" 21/700 + day chips over `program.days` (same selection kv as §6.3).
- **Muscle map**: `BodyMap` with `absolute` + `selected`, opacities from
  `muscleIntensities(day.exercises)` (all exists); chips + info banner + exercise-row highlight
  — extract the muscle-map block of `workout/[id].tsx` into `src/workout/MuscleMapCard.tsx`
  and render it in both places (the extraction is refactor-only; snapshot the existing tests).
- Exercise list = the day's exercises (read-only rows, `exerciseLabel`).
- **History card**: reuse the APP-081 vertical history (captures + HC sessions →
  `WorkoutPreviewSheet`) — extract `src/workout/HistoryCard.tsx` from `workout/[id].tsx`
  likewise.
- Empty state (no program): the §6.3 none-state dashed card (same component, shared).
- No new data, no new contract. This screen is composition + two extractions.

---

## 12 · Token / motion deltas (APP-083) — `src/ui/tokens.ts`

Additions (exact values):

```ts
colors.well        = "#F3EBDD"                    // icon wells (parsing doc, sun, leaf)
colors.dashedBorder= "rgba(120,100,75,0.22)"      // dashed empty cards
colors.toastUndo   = "#F2C08C"                    // toast Undo link + recap gold
colors.recap = { bg1: "#3E3A46", bg2: "#5C4A4A", text: "#F7F0E4",
                 label: "#D8C9B4", dashed: "rgba(247,240,228,0.22)",
                 pill: "rgba(247,240,228,0.14)" }
colors.progressUpcoming = "rgba(74,66,56,0.13)"   // setup + onboarding progress segments
motion.breath = { durationMs: 1600, scale: 1.07 } // parsing-well pulse (BodyMap keeps its 1.5s)
```

Reuse — do NOT add: done-green `#8CA58A` = `colors.greens[1]` · amber pair =
`estimateBg/estimateInk` · sand rail `#F0EDE2` (Segment track, already used) · dot idle =
`colors.dotIdle` · toast colors stay local to ToastHost · setup card shadow = `shadow` · banner
shadows = `shadowRow`/`shadowSoft` · vtIn/vtFade/vtPop = `motion.enter/fade/pop` with Reanimated
`FadeInUp/ZoomIn` (already the house pattern) · slide bezier = `motion.unfold` (pager already
animates slides itself). No keyframe system is added — every v3 animation maps to an existing
motion token + Reanimated entering/withTiming as specced inline above.

New dependency (ONE, CEO-gated Q1): **`expo-linear-gradient`** (SDK 56 pin via
`expo install`) — recap card + plan banner gradients; no hand-rolled substitute looks right.

---

## 13 · i18n keys (`src/i18n/locales/en.json` — English-only, translation-file rule intact)

Groups per existing layout. New keys (values = the exact copy in §§5–11; abbreviated here):

```
planSetup.title            "PLAN SETUP"
planSetup.stepOf           "{{n}} of {{total}}"
planSetup.reading          "Reading your plan…"
planSetup.findPages        "{{n}} pages"
planSetup.findMeals        "{{meals}} meals · {{swaps}} swap options"
planSetup.findNotes        "hydration & supplement notes"
planSetup.intro            "One meal at a time — just check what Vita read. Nothing here is a target."
planSetup.pickUsual        "PICK YOUR USUAL — SWITCH ANY DAY"
planSetup.swaps            "{{n}} swaps" / planSetup.swapOne "1 swap"
planSetup.swapHint         "Tap one to make it your usual — you can still swap on any single day."
planSetup.original         "ORIGINAL"     planSetup.swapped "SWAPPED"
planSetup.more             "+ {{n}} more in your plan →"
planSetup.searchSwaps      "Search your plan's options…"
planSetup.sheetCaption     "{{n}} options from your plan"
planSetup.usualNow         "Your usual is now {{name}}"
planSetup.backTo           "Back to {{name}}"
planSetup.fromNutritionist "· FROM YOUR NUTRITIONIST"
planSetup.looksRight       "Looks right"   planSetup.fix "Fix something"
planSetup.notesTitle       "Notes & habits"  planSetup.notesSub "from the plan"
planSetup.notesFooter      "Anything you keep on becomes a gentle check-in — edit or remove them in Habits."
planSetup.finish           "Finish setup"
planSetup.planReady        "Plan ready — {{n}} meals · {{m}} new check-ins"
planSetup.planReadyKcal    "Plan ready — {{n}} meals · ~{{kcal}} kcal/day"
planSetup.parseError       "That didn't parse — try again or type it instead."
today.title / today.homePill / today.helper   ("Tweak anything — it only counts for today, tomorrow starts fresh.")
today.editPlan "Edit everyday plan →" / today.editProgram "Edit training program →"
today.tabMeal "Meal plan" / today.tabWorkout "Workout"
today.plannedToday "kcal planned today"
today.changes "{{n}} changes for today" / today.changeOne "1 change for today" / today.revert "Revert"
today.reverted "Back to your everyday plan"
today.adjusted "Adjusted for today · {{name}}"  today.forTodayOnly "for today only"
today.noChange "no change"
today.reviewTitle "Your plan is imported"
today.reviewBody  "Finish the setup — {{n}} meals to review, one at a time. Takes about a minute."
today.continueSetup "Continue setup →"
today.noneTitle "No meal plan yet"
today.noneBody  "Vita counts whatever you log either way. Bring a plan whenever you're ready."
today.importPdf "Import a PDF" / today.typeOrSpeak "Type or speak it"
today.exOf "{{a}} of {{t}} exercises" / today.offToday "OFF TODAY"
today.skipped "Skipped for today · {{name}}"
today.wkFooter "Your program keeps every lift for next time."
today.wkNoneTitle "No training program yet"
today.wkNoneBody  "Log workouts freely — or bring your program and Vita lays it out day by day. You can keep more than one."
today.programImported "Program imported — {{n}} workouts found"
home.planBannerTitle "Your meal plan is in"
home.planBannerSub   "Finish the setup — {{n}} meals, one at a time"
home.planBannerContinue "Continue"
home.planBannerLater "Anytime — it's waiting in Today's plan"
home.intPromptTitle "Bring what you already use"
home.intPromptSub   "Health Connect — whenever you like"
home.intPromptLater "Anytime — swipe left for Integrations"
home.recapLabel "EVENING RECAP" / home.recapFresh "Tomorrow starts fresh."
home.recapKcal  "~{{in}} kcal in · ~{{out}} out — estimates, not scores"
home.recapTrends "See trends →"
home.emptyTitle "Nothing logged yet"
home.emptyPlanBody "Your plan starts with {{meal}} at {{time}}. Hold the mic when you eat — or peek at what's ahead."
home.emptyBody     "Hold the mic when you eat — Vita counts whatever you log."
home.seeTodaysPlan "See today's plan →"
home.kcalLeft "{{n}} kcal left" / home.kcalLeftOf "kcal left of ~{{total}}"
home.mealLogged "logged · ~{{k}} kcal" / home.mealPlanned "~{{k}} kcal planned"
nav.today "TODAY" / nav.swipe "SWIPE"
toast.undo "Undo"
trends.consistency.w2 … .w12 / trends.consistency.many   (ordinal phrases, §10)
account.notifRecap "Evening recap" / account.notifRecapSub "a calm summary of your day · 20:30"
onboarding.plan.subtitle → append "…you'll review it meal by meal right after setup, no rush."
```

(recapLine's segments — "{{n}} meals", "a workout", "logged, not judged." — parameterized keys
under `home.recap*`; the builder splits them so pluralization stays in the translation file.)

---

## 14 · 18b review-minor fold-ins (APP-092)

1. **`src/api/mock.ts` `updatePlan`** (lines ~547–552): mirror the server — assign ids to items
   lacking them (same counter as `createPlan`) and prune `storedPortions` keys whose item no
   longer exists / whose quantity·unit changed (mirror of `pruneOverlayAfterEdit`). Test: edit
   adds an item → response carries an id; edit changes a qty → its stored portion is gone.
2. **`src/db/plan.ts` `pushPlan`** (lines ~156–166): adopt the PUT response —
   `kvSet(PLAN_KEY, await api.updatePlan(doc))` (mirrors `savePlan`), so edit-added items get
   ids without waiting for the next sync. Test: offline edit-add → drain → cached doc has ids.
3. **`src/ui/BodyMap.tsx`**: highlight opacity changes tween `withTiming(300)` (an
   `AnimatedProps` opacity per shape or a memoized animated wrapper — respect session-6 pitfall
   3: memoize so animatedProps don't freeze; pin final value with the existing pattern). Test:
   descriptor-level (duration 300 config), not frames.
4. **Portions drain race** — §2.6 (spec'd there because it touches APP-085's store; implement
   here if APP-085 hasn't landed first, coordinate in the PR).
5. **The 2 skipped spec-required component tests** (18b builder debt): (a) muscle-map chip tap →
   info banner text + role tag + exercise-row highlight wiring (`workout/[id].tsx` component
   test with a muscleRoles fixture); (b) workout history row render (date tile today-tint,
   `VIA CAPTURE`, kcal omitted for HC rows).

---

## 15 · Consolidated test plan (gates: `tsc` 0 · Jest green · `api:check` clean · expo export OK)

| Area | Tests |
|---|---|
| toast (083) | undo callback fires once; 3600 vs 2200 timing; replacement cancels prior undo; host renders Undo only when present |
| stores (085) | day rollover: stale `portionsDate` → getPortions {} + clear + one enqueue; skips date reset; changesToday counts overlay≠default + skips only; revert snapshot/undo restores both; drain-race recipe (§2.6) |
| setup math (085/086) | setupFindings from a fixture doc (counts computed, pageCount omitted branch); applyUsuals: option reorder, swap→item rewrite + original prepended, qty-string parsing ("150g"→150 g, "as much as you like"→1 × raw); timing heuristic table; recapLine pluralization/omission matrix |
| Plan Setup (086) | parse resolve → findings then auto-advance (fake timers); swap select → badge + toast w/ undo → undo restores; option switch resets open row + keeps per-option sel; SwapSheet filter + select closes; finish creates N habits + PUT'd doc has usuals applied + status ready; abandon mid-setup → status review persists |
| Today (087) | 3 meal states render by status; summary kcal = computed from mock fixture through the overlay lens; skip toggle → kcal/count recompute + OFF TODAY; changes banner n and Revert flow; PortionPop delta badge signs/colors + close-with-change toast |
| Home (088) | banner order + visibility matrix (vacation/checkins/review-status/int-prompt); recap card hidden before 18:00 and when log empty; recap expanded content; morning empty card plan vs generic body; plan row logged-vs-planned rows |
| notification (089) | recap sync: schedules one id, cancels when paused/off/empty/after-20:30; body = recapLine (stub notifier assertions) |
| consistency (090) | §10 list |
| nav (084) | TAB_ROUTES order; snapTarget unchanged (existing test still green); NavDots active mapping + swiped-hint kv; lazy-mount grows only on settle (unit via exported helper) |
| fold-ins (092) | §14 items 1–5 |
| E2E (Maestro) | import (mock) → parsing → 6 steps → swap one item → finish → Today ready shows swapped usual; portion drag → changes banner → revert; relaunch keeps review state mid-setup |

Emulator verification (per DoD): parsing breath + findings stagger, swap list expand feel,
6-tab swipe + dots (especially Today↔Home↔Trends and no last-tab regression), recap card
expand, dashed empty states. Gesture/blur feel = CEO device pass.

---

## 16 · Ticket breakdown (doc only — orchestrator files after CEO review)

**APP-082 — Contract v0.7.0: types regen + client + mock v3 seed** · Model: claude-sonnet-4-6
AC: `api:gen` clean vs merged contract; client threads `status`; mock seeds the 5-meal
options/swaps/hydration/supplements/report fixture + pageCount, stores status; existing 250
tests stay green.

**APP-083 — Toast-with-undo + token/motion/i18n deltas** · Model: claude-sonnet-4-6
AC: §3 store/host + §12 tokens + §13 keys land; habit-removal gains undo; all existing call
sites compile unchanged; tests §15 row 1.

**APP-084 — Nav v3: 6-tab pager + NavDots + Integrations tab** · Model: claude-opus-4-8
AC: §4 exactly; pager gesture untouched except lazy-mount growth from deferred settle; dots
animate 300ms; SWIPE hint one-time (kv); emulator-verified: fast flick moves exactly one tab,
Trends scrub + Timeline day-swipe still win their regions (pagerRef seam intact).

**APP-085 — Plan status + day-scoped overlays + pure math + drain-race fix** · Model:
claude-opus-4-8
AC: §2 complete; plan.tsx/Home read through unchanged call sites; v0.6.0 compute tests green;
new tests §15 rows 2–3 (store half).

**APP-086 — Plan Setup flow + SwapSheet + Notes & habits + onboarding deltas** · Model:
claude-opus-4-8
AC: §5 pixel values + copy exact; findings tied to real counts; swap semantics binding
(usual + SWAPPED + toast/Undo + ORIGINAL restore); SwapSheet real with search; finish rewrites
doc per contract-need #4 + creates habits + navigates; onboarding subtitle + review handoff;
tests §15 row 4.

**APP-087 — Today's plan tab** · Model: claude-opus-4-8
AC: §6 all three meal states + workout tab + changes banner + PortionPop delta; extracted
`MacroBars`/`ItemRow` reused by plan.tsx with zero visual change there (snapshot); tests §15
row 5.

**APP-088 — Home v3** · Model: claude-opus-4-8
AC: §7 banner order, recap card (gradient, expand), morning empty, plan row restyle; hero and
water/macros/energy untouched (flex row invariant!); tests §15 row 6.

**APP-089 — Evening recap notification** · Model: claude-sonnet-4-6
AC: §9; stub-notifier tested; account toggle; pauses respected.

**APP-090 — Trends consistency card** · Model: claude-sonnet-4-6
AC: §10; appears only n≥2; ordinal copy; never numeric; placed above the tab segment.

**APP-091 — Workout hub tab** · Model: claude-opus-4-8
AC: §11; MuscleMapCard/HistoryCard extractions leave `workout/[id].tsx` behavior byte-identical
(existing tests green); hub renders program day + map + history.

**APP-092 — 18b fold-ins** · Model: claude-sonnet-4-6
AC: §14 items 1–5 with their tests.

---

## 17 · Deliberate shortcuts (ponytail ledger)

- Swap qty strings are display-only; `applyUsuals` parses "NNNg/ml" leniently and otherwise
  keeps the raw string as the unit — ceiling: structured swap quantities in a later contract if
  portion sliders on swapped items ever need exact bounds (until then `portionRange()` covers).
- Swapped items keep the original item's nutrition (isocaloric substitution lists; `~` marks the
  estimate). Ceiling: per-swap nutrition from parse if the CEO wants exact.
- Option switch in Today's meal tab is session-local display state (no kv) — resets on restart;
  the persisted usual is options[0]. Ceiling: kv if the CEO notices.
- Recap notification time is a constant 20:30 — a setting only if asked.
- Workout day skips are device-local and never synced (day-ephemeral by design).
- No per-shape transform-origin gymnastics beyond the existing BreathGroup for the parsing well
  (it's a plain View, not SVG).
- Lazy pager mount = render-null until visited/adjacent; no unmount-on-distance (memory ceiling:
  add eviction only if the device pass shows pressure).

## 18 · Questions for the CEO (each with the recommended default)

1. **New dependency `expo-linear-gradient`** for the recap card + plan banner gradients
   (the only new dep this round). *Recommend: yes — two surfaces the handoff makes gradient;
   flat approximations read visibly wrong on the dark recap card.*
2. **Portion overlay becomes day-scoped** ("only counts for today, tomorrow starts fresh",
   handoff copy) — this CHANGES the shipped v0.6.0 behavior where an adjustment persisted until
   the plan changed. *Recommend: day-scoped, per the handoff; it also matches "no goals" —
   nothing accumulates.*
3. **Workout dot destination** = the new program-centric hub (§11: day chips + muscle map +
   history), reusing the APP-080/081 components. *Recommend: as specced; the alternative
   (dot opens the latest workout entry detail) breaks when there are no entries.*
4. **"Multiple programs" = the days of the one program doc** (Leg day / Upper body chips), no
   multi-document support. *Recommend: yes — the parse model already splits days; true
   multi-doc is a contract change with no user-visible gain now.*
5. **"Fix something" routes to the existing Eating Plan Edit mode** instead of a new editable
   card (prototype left it out of scope). *Recommend: yes — the editor exists, is tested, and
   the doc is already saved in review status when setup runs.*
6. **The Water toggle in Notes & habits creates a real habit** (the prototype's water toggle did
   nothing — dishonest). *Recommend: yes — every ON toggle becomes a check-in, exactly what the
   footer copy promises.*
7. **Evening recap notification**: fixed 20:30, only fires when something was logged that day
   and the app computed it (no server push, v1 rule); a day where the app never opened →
   silence. *Recommend: accept — calm and honest; the Home card covers the in-app case.*
8. **Usual-swap persistence**: app-side doc rewrite at Finish (contract-need #4 recommendation
   A, zero new endpoints) vs a server-side selection map (B). The backend spec may land on B —
   if the two specs disagree, this is the tiebreak. *Recommend: A.*
