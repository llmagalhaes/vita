# Vita V4 — App implementation plan

Owner: app team lead. Status: **planning only — no code written this session.**
Sources of truth, in order: `docs/v4/README.md` (the handoff/spec) → `docs/v4/Vita Prototype v4.dc.html`
(exact values; `support.js` is the DC template runtime and contains **zero** app logic — ignore it) →
`docs/contracts/vita-api-v0.yaml` (v0.7.0).

Baseline verified at planning time on `main` @ `0997bea`: **tsc 0 · Jest 314/314 (56 suites)**.

---

## 1 · Scope summary — what v4 means for the app

V4 is not a fidelity pass. It is a **structural rewrite of the navigation and of the day's data model**,
sitting on top of the v3 infrastructure (offline SQLite + outbox, plan doc, capture, i18n, sheets/pops).

Five changes carry the whole round:

1. **6-tab pager → three panels.** `Trends | Day | Library`, index 0/1/2, an edge-swipe pan with exact
   thresholds (README §1, prototype `panPD/panPM/panPU`). Day travel is **never** a content swipe — only
   the dock date picker and the calendar sheet. The `NavDots` strip dies; a frosted segmented **panel tab
   bar** floats at `top:48`.
2. **Home + Today merge into one Day panel**: scenic parallax header → `Overview` zone (Water, Macros,
   Habits, Weight) → `Your day` timeline (meals + workout in chronological order, close-the-day as the
   final node). Past days render a status card or an honest "no record" card with retro-close.
3. **The day record model (the actual pillar).** Meals are born `planned`; user action moves them to
   `done` / `adjusted` / `skipped`; an evening **Close the day** card (and a single lock-screen
   notification) confirms the rest in one tap; an untouched day stays **unrecorded** and is phrased as an
   absence, never a failure. This is new state that must be persisted (§4).
4. **Capture becomes a plan delta.** Voice/text/photo no longer produce a loose meal — they produce
   `"White rice · 150g → Sweet potato · 200g · −23 kcal"` applied against the plan, flipping the meal to
   `adjusted`. Photo produces a *confirmation* ("Looks like your plan's Lunch"), not a delta.
5. **Fake surfaces are deleted, not restyled.** Integrations screen → one Health Connect row in Library.
   Garmin energy card, per-meal check-in notifications, the fake "what to monitor" menu, "Fix something",
   the "+N more" toast, the Flo row: all removed. Composition flags (`meals · water · move · habits ·
   weight`) become the one real "what Vita keeps" control, written in onboarding step 2 and editable in
   Library. Turning one off **hides, never deletes** — that copy is binding.

Kept sacred and **must not regress**: PDF plan import (`plan-setup`), dock date picker (Gaussian
magnifier), portion slider modal, voice/text/photo capture, vacation mode, export, undo-toast.

New dependencies: **none**. Everything v4 needs (`react-native-svg`, `reanimated 4`, `gesture-handler`,
`expo-blur`, `expo-linear-gradient`, `expo-notifications`, `expo-haptics`) is already installed. The one
genuinely new primitive is an **oklab colour mix** (§6, risk R5) — ~20 lines, no dependency.

---

## 2 · Reuse map

`keep` = use as is (small prop/style edits allowed) · `adapt` = real work, but the file survives ·
`rebuild` = same filename/concept, contents replaced · `delete` = gone in v4.

### Infrastructure — mostly untouched

| Module | Verdict | Note |
|---|---|---|
| `src/db/db.ts`, `kv.ts`, `outbox.ts`, `reconnect.ts`, `notify.ts` | keep | offline model stands; `outbox` gains one coalescing op `dayRecord` (same pattern as `portions`) |
| `src/db/entries.ts` | adapt | + `weight` entry type; day queries stay |
| `src/db/habits.ts` | keep | already has `days[7]`, `time`, `enabled` — v4's habit form maps 1:1. Drop `kind:"digest"` |
| `src/db/plan.ts` | adapt | the v3 day-scoped portions overlay **folds into the day record** — qty override, item skip, item swap and option index all live in one place, closing the session-19 asymmetry where an option switch was session-local while portions persisted |
| `src/db/settings.ts` | adapt | `keepTrack{meals,water,workouts,habits,cycle}` → `domains{meals,water,move,habits,weight}`; `cycle` dropped (Flo row removed) |
| `src/db/vacation.ts` | adapt | + duration (`thisWeek` / `untilEnded`) + `keepWater` as **real** behaviour (prototype has it as copy only) |
| `src/api/client.ts`, `index.ts`, `mock.ts`, `types.gen.ts` | adapt | regen after the contract bump (§4); mock gains day records + plan-delta parse |
| `src/auth/*` | keep | untouched |
| `src/i18n/*` | adapt | `en.json` restructured to the v4 panel/section tree; every new string goes through `t()` (i18n-ready is a standing CEO directive) |
| `src/lib/*`, `src/config.ts` | keep | |

### UI kit

| Module | Verdict | Note |
|---|---|---|
| `ui/PopOverlay.tsx` + `ui/popHost.tsx` | keep | **the session-21 lesson holds**: centered pops portal to root inside `GestureHandlerRootView`, never RN `Modal` |
| `ui/SheetOverlay.tsx`, `useSheetDrag.ts`, `sheetPresence.ts`, `SheetBackdrop.tsx` | adapt | v4 sheet chrome: `#FBF6EC`, radius `30/30/42/42`, `margin 0 6 6`, `vtSheetUp .38s cubic-bezier(.22,.9,.32,1)`, scrim `rgba(60,50,38,.35)` + blur 4; modals keep the **light** scrim `rgba(247,242,233,.45)` + blur 13 |
| `ui/toast.ts`, `ToastHost.tsx` | keep | confirm 2200 ms / **3600 ms with Undo**, pill `bottom:122`, r18, `#453E35`/`#F7F0E4`, Undo `#F2C08C` |
| `ui/Slider.tsx` | keep | already UI-thread; v4 needs it in portion, water and weight modals |
| `ui/Toggle.tsx`, `Button`, `Card`, `Chip`, `Text`, `PressScale`, `Chevron`, `EditableText`, `EstimateTag`, `Bar`, `Donut`, `keyboard.tsx`, `useStartOnLayout`, `MorphBlob`, `WaveIllustration` | keep | |
| `ui/tokens.ts` | adapt | v4 palette (§3, APP-093). Note `colors.bg` is currently `#EDE5D6` (the *desk* colour); v4 panel canvas is `#F7F2E9` |
| `ui/accent.ts` | keep | already the single accent switch vacation flips — exactly the prototype's `--accent` var |
| `ui/BodyMap.tsx` | **rebuild** | v4 uses a different capsule figure and viewBox `190×150` with 10 muscle keys (`qu gl ha ca ch bk sh ar tr co`); the current map is the v3 11-muscle silhouette |
| `ui/ConfirmSheet.tsx` | keep | reused by the Delete-account confirm |

### Screens and features

| Module | Verdict | Note |
|---|---|---|
| `nav/TabsPager.tsx`, `nav/NavDots.tsx`, `nav/__tests__/tabs.test.ts` | **delete** | replaced by `nav/PanelShell.tsx` + `nav/PanelTabs.tsx` |
| `nav/pagerRef.ts` | keep (file) | keep the exported symbol name so `scrub.tsx` / `DockDatePicker.tsx` need **zero** edits; it now refs the panel pan |
| `tabs/Home.tsx` (963 l) | **delete** | recap card, banners, header icons, PlanRow2, IntegrationsPrompt, MorningEmpty all die; the water vessel + water history rows migrate into the Day Overview water card |
| `tabs/Today.tsx` (499 l) | **delete** | plan/workout content migrates into the Day timeline nodes |
| `tabs/Trends.tsx`, `trends/FoodTab.tsx`, `trends/ActivityTab.tsx` | **rebuild** | v4 Trends is one flat list with W/M/Y (not W/F/M + Food/Activity sub-tabs) |
| `trends/consistency.ts` (+ ConsistencyCard) | **delete** | replaced by the record counter ("N of D days this year have a record") |
| `trends/parts.tsx` | adapt | `GrowBar`, `SectionLabel`, `linePath` keep; `TrendCard`'s collapse-to-open model is replaced by always-open + pin |
| `trends/scrub.tsx` | adapt | add the **pin vs scrub** rule: release clears the selection *only if the finger changed bucket*; a tap pins |
| `trends/aggregate.ts` | adapt | windows `W(7) / M(30) / Y(12 months)`; `WINDOW_DAYS.F=15` dies |
| `trends/MuscleSheet.tsx` | **rebuild** | v4 sheet lists sessions with per-muscle *exercises* (EXMU map) + "Open this day →" + "+N earlier sessions" |
| `tabs/Habits.tsx` (481 l) | **delete** | add-form + manage list migrate to Library; the Trends dot strips + habit detail sheet are new |
| `habits/CheckinSheet.tsx` | **delete** | the check-in deck goes; habit answers are the ✓/— row in the Day Overview |
| `habits/digest.ts` + `kind:"digest"`/`"plan"` | **delete** | per-meal check-in notifications are removed by design |
| `habits/notifier.ts` | adapt | keeps per-habit daily reminders (Library has a per-habit switch); `syncRecap` becomes the **single day-close notification** |
| `habits/recap.ts`, `tabs/home/RecapCard.tsx` | adapt→absorb | the evening recap becomes the *Day closed* recap node in the timeline |
| `habits/checkins.ts` | keep | check-in results still persist server-side (CEO Round 10 #1) |
| `tabs/Integrations.tsx` + `app/(main)/integrations.tsx` | **delete** | → one Health Connect row in Library |
| `tabs/MacrosSheet.tsx` | adapt | becomes the Macros **pop** on the Overview card (PopOverlay, already the right primitive) |
| `tabs/home/DockDatePicker.tsx` + `dock.ts` | keep (move to `src/day/`) | Gaussian magnifier is exactly the v4 spec; add per-day status dots |
| `tabs/home/Timeline.tsx`, `DaySection.tsx`, `timelineData.ts` | **delete** | the v4 timeline is **plan-node** driven, not entry driven; rail geometry is re-lifted from the prototype |
| `tabs/WorkoutHub.tsx`, `workout/HistoryCard.tsx`, `PreviewSheet.tsx`, `MuscleMapCard.tsx`, `history.ts`, `useWorkoutHistory.ts` | **delete** | workout lives in the Day timeline card (Exercises\|Muscles), programs in Library, aggregate in Trends |
| `workout/muscleExercises.ts` | adapt | becomes the EXMU exercise↔muscle map feeding the muscle sheet |
| `workout/ImportProgramSheet.tsx` | keep | Library "Import or type a program" |
| `plan/PortionPop.tsx` | adapt | v4 delta badge (amber + / green − / neutral 0), `Didn't have it today`, `Only counts for today — tomorrow starts from the plan again.` |
| `plan/SwapSheet.tsx` | keep | already the searchable swap sheet that replaces the "+N more" toast |
| `plan/compute.ts`, `setup.ts`, `MacroBars.tsx`, `ItemRow.tsx`, `DescribeSheet.tsx`, `editor.tsx` | keep | |
| `app/(main)/plan-setup.tsx` (601 l) | keep | **sacred**; only entry points change (Library "Replace — new PDF", empty states) |
| `onboarding/PlanStep.tsx`, `planImport.ts` | keep | plan import moves out of onboarding into Library/empty states |
| `app/onboarding.tsx` | **rebuild** | 5 steps → 2 (name → what to keep) |
| `capture/CapturePill.tsx` | adapt | frosted pill (`vtPillX` 54→280 px, side buttons `vtPillBtn` at .3s/.38s); visibility `panel===1 && dayOff===0 && !sheetOpen` |
| `capture/CaptureSheet.tsx`, `CaptureContext.tsx` | adapt | parsed result renders a **plan delta card**, not a draft meal |
| `capture/VoiceOverlay.tsx`, `useVoiceCapture.ts`, `speech.ts`, `photo.ts`, `PhotoSheet.tsx`, `quantity.ts` | keep | slide-to-cancel + on-device STT stay exactly as shipped |
| `review/ReviewSheet.tsx` | keep | offline-capture review banner |
| `export/ExportSheet.tsx`, `pdf.ts` | adapt | 3 recipient chips (`My nutritionist` / `My trainer` / `Just me`) with the v4 notes |
| `vacation/VacationSheet.tsx` | adapt | duration chips + "keep the water card" as real behaviour |
| `health/healthConnect.ts` + `plugins/withHealthConnect.js` | adapt | permission bug (APP-107) + `READ_WEIGHT` scope |
| `energy/manual.ts` | **delete pending CEO** | v4 removes the energy card entirely; manual "spent energy" was CEO Round 10 #4 — see Q4 |
| `app/(main)/meal/[id].tsx`, `water/[id].tsx`, `workout/[id].tsx`, `habits.tsx`, `today.tsx`, `home.tsx`, `trends.tsx`, `workout.tsx`, `integrations.tsx` | **delete** | v4 expands in place; detail *screens* are gone. `account.tsx`, `plan.tsx`, `program.tsx`, `plan-setup.tsx` survive as pushes from Library |

Rough deletion budget: **~3,500 lines removed**, ~2,800 added. Net smaller — as it should be.

---

## 3 · Work breakdown

Ticket numbering continues after **APP-092**. Each ticket names its prototype section so the builder
lifts exact values instead of eyeballing. Waves are file-disjoint so parallel Opus builders never collide.

### Wave 0 — foundation (3 parallel builders · blocks everything)

---
**APP-093 · v4 design tokens + oklab mix + motion**
*Implements: README §2 (Design tokens), §Keyframes.*
Files: `src/ui/tokens.ts`, `src/ui/accent.ts`, new `src/ui/oklab.ts`, `src/ui/__tests__/oklab.test.ts`.
- Full v4 palette: canvas/panel `#F7F2E9`, sheet `#FBF6EC`, card `#FFFDF7`, input `#FBF6EC`, desk `#EDE5D6`;
  the ink ramp (`#453E35 / #4A4238 / #6E6355 / #8A7E70 / #B7AB9C / #CFC5B4 / #D9CFBD / #E4DCCB`);
  green/amber/peach/sand/danger sets; dark tokens (`#453E35` toast, `#F2C08C` undo, recap gradient
  `#3E3A46→#5C4A4A`); scenic scene table (morning/afternoon/evening A/B/C + sun + hills + ink) and the
  dark-scene panel-tab variant.
- **`mixOklab(accent, pct, base)` replaces `tint()`'s sRGB lerp.** v4 mixes up to **86%** accent on the
  muscle map (`16 + v*70`); the current lerp is only documented accurate to ~35%. Old `tint()` stays as a
  deprecated re-export for one wave, then goes.
- Motion tokens for `vtIn / vtFade / vtPop / vtBreath / vtTip / vtSheetUp / vtWave / vtPillX / vtPillBtn`
  with the prototype's exact durations and beziers.
- **Acceptance:** every colour/duration in README §2 is a named token; `mixOklab` unit-tested against
  three hand-computed reference mixes (16 %, 50 %, 86 %); no literal hex outside `tokens.ts` in files this
  ticket touches; tsc 0.

---
**APP-094 · Day record model (state + persistence + pure logic)** — *the pillar, largest single ticket*
*Implements: README §1 "Day record model", prototype `mSt / mDue / doCloseDay / retroFn / PAST`.*
Files: new `src/day/record.ts`, `src/day/state.ts`, `src/day/close.ts`, `src/day/__tests__/*`;
`src/db/plan.ts` (day-scoped overlay), `src/db/outbox.ts` (+ `dayRecord` op), `src/api/client.ts`+`mock.ts`
(day endpoints, after §4 lands).
- Types: `MealState = "planned"|"done"|"adjusted"|"skipped"` (planned = **absence** of an override, per the
  prototype); `DayRecord { date, meals: Record<mealId, {state, optionIndex?, items: Record<itemId,
  {qty?, skipped?, swap?}>}>, workout?: {program, state, exercisesDone}, closed?: {at, mode:"live"|"retro"},
  habits: Record<habitId, "yes"|"no">, weight?: {kg, at, source} }`. **No record row ⇒ `unrecorded`** — an
  empty record and a missing record must stay distinguishable.
- Pure functions (all unit-tested, no React): `mealState(day, meal)`, `isDue(meal, nowMin)`,
  `dayCounters(day) → {done, adjusted, skipped, planned}`, `closeDay(day, nowMin)` (only **due** meals flip
  to `done`; future meals stay `planned`), `retroClose(day)`, `recapLine(day, domains)`,
  `dayStatus(day) → "asPlanned"|"adjusted"|"unrecorded"` for calendar dots.
- Persistence: SQLite table `day_record(date PRIMARY KEY, json, dirty)`, coalescing outbox op keyed by
  date (same shape as the existing `portions` op — sentinel entryId, map read at drain time,
  poison-drop on 400/403/404/409, 422 → resync). Hydrate never overwrites a dirty row (existing audit-1.4 rule).
- **Kills the session-19 asymmetry**: today's option switch, portion tweak and item skip now all live in
  the same day-scoped record, so they survive a restart consistently.
- **Acceptance:** the four states + close + retro + counters + recap line are covered by unit tests
  including the "future meal is not closed" and "unrecorded ≠ empty" cases; a write while offline drains
  exactly once on reconnect; tsc 0.

---
**APP-095 · Composition flags (what Vita keeps)**
*Implements: prototype `domRows` / `dom` gating map.*
Files: `src/db/settings.ts`, new `src/db/domains.ts` + `useDomains()` hook, `src/db/__tests__/domains.test.ts`.
- Keys exactly `meals · water · move · habits · weight`, all default `true`. Old `keepTrack.cycle` ignored.
- Export the gating predicates the screens consume: `rowWM = water||meals`, `ovOn = water||habits||weight||meals`,
  `tlOn = meals||move`.
- **Acceptance:** toggling a flag emits the prototype's toasts (`"{name} hidden — history stays"` /
  `"{name} is back"`), never deletes anything, and a snapshot test asserts each flag's consumer list.

### Wave 1 — the shell (1 builder · depends on APP-093)

---
**APP-096 · Three-panel shell + panel tabs + edge-swipe**
*Implements: README §1 Structure + Panel tabs; prototype `panPD/panPM/panPU`, lines 118–126, 1578–1585.*
Files: new `src/nav/PanelShell.tsx`, `src/nav/PanelTabs.tsx`; `src/nav/pagerRef.ts` (comment only);
`app/(main)/_layout.tsx`; new route files `app/(main)/day.tsx` `trends.tsx` `library.tsx`;
placeholder shells `src/day/DayPanel.tsx`, `src/trends/TrendsPanel.tsx`, `src/library/LibraryPanel.tsx`
(**ownership handed to wave 2**); deletes `src/nav/TabsPager.tsx`, `NavDots.tsx`, `nav/__tests__/tabs.test.ts`.
- Exact gesture, as pure worklet helpers so they are unit-testable:
  `EDGE = 34` (only when `panel === 1`; Trends/Library pan from anywhere) · engage at `|dx| ≥ 8` ·
  vertical veto `|dy| > 12 && |dy| > 1.1·|dx|` → the pointer is **dead for the rest of the gesture** ·
  1:1 tracking · rubber-band `÷3.5` past index 0 and 2 · commit at `|dx| ≥ 90` (no velocity term) ·
  snap `withTiming 450ms cubic-bezier(.22,.9,.32,1)`, `transition:none` while dragging.
- Pan is disabled entirely while `anySheetOpen()` (reuse `ui/sheetPresence`).
- Panel tabs: frosted segmented control at `top:48`, `z-index:50`; light and **dark-scene** variants,
  trigger `scenic && panel===1 && daytime==="evening"`. Tap sets the index directly (animates via the
  same timing, not the drag path). Status-bar ink follows the scene.
- Swipe hint `◂ SWIPE FROM AN EDGE · TRENDS — LIBRARY ▸`, retired on first swipe (reuse the existing
  `nav.swiped` kv).
- **Acceptance:** `shouldEngage / isVerticalVeto / rubberBand / commitTarget` unit-tested at their exact
  thresholds; Day content scroll still works with a finger starting mid-screen; the dock and the Trends
  scrub still win their horizontal drags (`blocksExternalGesture` chain intact); tsc 0.
- ⚠ **Fragile**: this is the file that ate swipes twice before (session 6 mid-gesture remount, session 11
  arbitration). Do not grow the mounted-panel set mid-gesture. Device-verify (§6 D1).

### Wave 2 — feature surfaces (6 parallel builders · depend on waves 0–1)

---
**APP-097 · Day panel: scenic header, parallax, Overview zone**
*Implements: README §2 Scenic scenes + §4 screen 2; prototype lines 295–520, `daySc/scPar`.*
Files: `src/day/DayPanel.tsx` (ownership), `src/day/ScenicHeader.tsx`, `src/day/overview/{WaterCard,
MacrosCard,HabitsCard,WeightCard}.tsx`, `src/day/__tests__/*`.
- Header: `linear-gradient(180deg A 0% → B 55% → C 100%)` per daytime, sun/moon `r30 @ (196,46)` + halo
  `r48 opacity .22`, the two hill paths verbatim, 8 stars fading in on evening, the **sheet cap** seam
  (38 px, `#F7F2E9`, radius `30 30 0 0`, margins `-34 -20 -13`, shadow `0 -12px 26px -8px`).
- **Parallax must run on the UI thread**: `useAnimatedScrollHandler` → shared value →
  `translateY(min(340, y) * 0.38)` on the star and sun/hill SVGs. **Do not** port the prototype's
  `setState` at a 1 px threshold (risk R2).
- Overview cards: Water (quick `+250 ml`, exact modal slider `50–1000 step 50` **plus** typed input
  clamped 0–2000, bottle fill vs 2500 ml, `.6s` transition), Macros (opens a **PopOverlay** pop, not a
  sheet), Habits (✓/— per habit, one tap, undo toast), Weight (value + source line, `+` opens the manual
  modal: slider `60–100 step 0.1` **plus** typed input clamped 30–200).
- Zone labels `Overview` / `Your day` at 11.5/800 ls 1.4 `#B7AB9C`; every card gated by its domain flag.
- **Acceptance:** each card renders and hides per its flag; the water and weight modals accept *both*
  slider and typed entry (dual input is non-negotiable); parallax uses zero per-frame `setState`.

---
**APP-101 · Muscle map v4 + per-muscle bottom sheet**
*Implements: README §3 Muscle map; prototype lines 632–664, 1206–1231, `MUS`/`EXMU`/`muF`/`muT`.*
Files: `src/ui/BodyMap.tsx` (rebuild), `src/muscle/{MuscleSheet,muscleData}.tsx|ts`, `src/muscle/__tests__/*`;
deletes `src/workout/MuscleMapCard.tsx`, `src/trends/MuscleSheet.tsx`.
- Rebuild the figure at `viewBox 0 0 190 150` from the exact primitive list (front centred x≈48, back
  x≈142; 10 keys `qu gl ha ca ch bk sh ar tr co`; note the front has no traps slot and the back no
  chest/quads slot). `FRONT`/`BACK` captions 8/700 `#B7AB9C`. `max-width` 250 (workout card) / 240
  (Trends) / 225 (past day). **Memoize the SVG** — it re-renders on every accent/fill change otherwise.
- Fills `muF(v) = v>0 ? mixOklab(accent, round(16 + v*70), "#F0EDE2") : "#ECE6D8"`.
- Aggregate `muT(k) = (legIntensity·legSessions + upperIntensity·upperSessions) / totalSessions`.
- Chip tiers `≥.75 primary · ≥.4 secondary · else light`; Trends chips instead show a **session count**
  and tint at the `.4` threshold, sorted desc, top 6 of the first 8 muscles.
- Bottom sheet: session rows (program · weekday+date · tier chip · the exercises that hit that muscle from
  `EXMU` · `Open this day →` gated on the day being inside the 10-day dock range), `+N earlier sessions`
  for M/Y, footer `Exercises from your recorded sessions — coverage, never a score.`
- **Acceptance:** `muF`/`muT`/tier/chip-selection unit-tested; the sheet's `Open this day →` sets the Day
  panel to that offset and closes the sheet; no session row appears for a muscle the program doesn't hit.

---
**APP-102 · Habit detail sheet + habit statistics**
*Implements: README §3 Habit detail sheet; prototype lines 1233–1290, 1713–1733.*
Files: new `src/habits/{HabitDetailSheet.tsx,stats.ts}`, `src/habits/__tests__/stats.test.ts`.
- `stats.ts` is pure and computed from real check-in entries (the prototype's `doneAt/mCnt` are synthetic
  demo generators — **do not port them**): month count, lifetime total, top-2 weekdays, month calendar
  map, 8-month history counts, 30-day weekday frequency.
- Sheet sections with exact geometry: 3 counter tiles → current-month calendar (34 px cells r11, done
  `#8CA58A`/`#FFF9F1`, not-done `#F0EDE2`/`#6E6355`, future transparent `#D9CFBD`, selected 2 px accent
  outline; future days inert; tapping a day → `date · done|not marked · [· you were on vacation] ·
  Open this day →` gated on the dock range) → 8 by-month bars (`round(count/max*42 + 5)` px, current month
  `#8CA58A`, others `#D5CBB8`) → 7 weekday circles (`Ø 8 + share*14`, opacity `.35 + share*.65`, zero → `.25`,
  Mon-first).
- Footer, verbatim: `Counts of recorded days — never a score, never a streak.`
- **Acceptance:** all four sections derive from real `checkin` entries; a habit with zero history renders
  the empty shape without dividing by zero; the vacation annotation reads from real vacation ranges, not
  a hardcoded window.

---
**APP-103 · Library panel**
*Implements: README §4 screen 5; prototype lines 716–866.*
Files: new `src/library/LibraryPanel.tsx` + `src/library/sections/{Keeps,EatingPlan,Programs,Habits,
Sources,AwaySharing,Account}.tsx`; adapts `export/ExportSheet.tsx`, `vacation/VacationSheet.tsx`;
deletes `src/tabs/Integrations.tsx`, `src/tabs/Habits.tsx`, `app/(main)/integrations.tsx`, `habits.tsx`.
- Sections in order: **What Vita keeps** (5 toggles + `Off hides it everywhere — history stays, nothing is
  deleted.`) · **Eating plan** (expandable meal list, `+ Add a meal` form `name / time / ~kcal` writing a
  1-item meal into the plan doc with undo, `Replace — new PDF` → the existing plan-setup flow) ·
  **Training programs** (+ the existing import sheet) · **Habits** (add form: name, time, 7 Mon-first
  weekday circles; per-habit **notification switch**; remove with undo — `"{name}" removed — history stays`)
  · **Connected sources** → the single **Health Connect** row (`Connected · weight & workouts flow in` /
  `Off — nothing is read`) · **Away & sharing** (vacation row + export row) · **Account** (avatar
  `linear-gradient(135deg,#E8B48C,accent)` + initial, name, email, `Sign out`, danger `Delete my data`
  with the 3-button confirm `Keep it / Export first / Delete`).
- Panel footer: `Your log stays on this device — exports are files you choose to share.`
- Export sheet: 3 recipient chips + the exact notes; keeps the real `expo-print` PDF (the prototype only
  toasts).
- **Acceptance:** no fake row anywhere (no Garmin/Strava/Flo/Apple Health-on-Android); every destructive
  action has an undo or a confirm; on iOS the Connected-sources section resolves per CEO Q3.

---
**APP-104 · Capture as a plan delta**
*Implements: README §3 Capture pill + §1; prototype lines 867–1022, `capAdd/capPhotoAdd`.*
Files: `src/capture/CapturePill.tsx`, `CaptureSheet.tsx`, `CaptureContext.tsx`, new
`src/capture/delta.ts` + tests; `src/api/mock.ts` (delta fixtures).
- Frosted pill: `rgba(255,253,247,.55)` + blur 20 saturate 1.5, border `rgba(255,253,247,.72)`, r32,
  shadow `0 12px 34px rgba(50,38,26,.25)`; entry `vtPillX` (max-width 54→280, .5 s) with Aa/camera popping
  via `vtPillBtn` at .3 s/.38 s; mic 52 px accent. Visible **only** on today's Day with no sheet open.
- Voice: hold → listening (5 `vtWave` bars, `Listening…` + `release the mic to finish`), release →
  real STT (unchanged) → `/parse/text` → **plan delta card**:
  `Matched to your plan` / meal name + state tag + `~N kcal` / `~~old~~ → new` + signed kcal badge /
  `everything else as planned — an estimate, labelled as one` / `Discard` | `Record it`.
- `Record it` applies the delta to the **day record** (APP-094): item swap/qty/skip + meal → `adjusted`,
  auto-expands that meal, toast with Undo restoring the previous item *and* meal state.
- Photo path yields a **confirmation** (`Looks like your plan's Lunch` → meal → `done`), not a delta.
- Fallback when the parse matches nothing in the plan: keep the v3 loose-draft card — an off-plan meal must
  still be recordable.
- **Acceptance:** `applyDelta` / `revertDelta` unit-tested (round-trip restores byte-identical state); the
  offline park→reconnect path still works and still flags `needsReview`.

---
**APP-105 · Onboarding, 2 steps**
*Implements: README §4 screen 1; prototype lines 63–85, `obNext`.*
Files: `app/onboarding.tsx` (rebuild), `src/onboarding/PlanStep.tsx` (unmounted from onboarding, kept for
Library/empty-state entry).
- Step 1 name (`Welcome to Vita` / `What should we call you?` / `Two steps — that's the whole setup. Plans,
  programs and habits come later, when you need them.`); step 2 the 5 composition rows (`What should Vita
  keep?` / `Your day is built from exactly this — anything you skip won't appear anywhere.` /
  `Change this anytime in the Library — turning something off hides it, it never deletes history.`).
- 2-segment progress bar; `Open Vita →` writes the domain flags and lands on panel 1.
- **Acceptance:** no plan import, no program import, no fake "connect apps" step; a fresh install reaches
  the Day panel in two taps + a name.

### Wave 3 — surfaces that consume wave 2 (3 parallel builders)

---
**APP-098 · Day timeline "Your day"** *(depends APP-094, APP-097, APP-101)*
*Implements: README §3 Timeline + §4 screen 2; prototype lines 520–700.*
Files: `src/day/timeline/{Timeline,MealNode,WorkoutNode,CloseDayCard,RecapNode}.tsx`, `src/day/timeline/__tests__/*`;
adapts `src/plan/PortionPop.tsx`; deletes `src/tabs/home/Timeline.tsx`, `DaySection.tsx`, `timelineData.ts`.
- Nodes = plan meals (gated on `domains.meals`) + the workout at its `18:00` slot (gated on `domains.move`),
  sorted by minutes-since-midnight, meal stagger `i*45 ms`, workout `160 ms`, animation `vtFade .35s`.
- Rail: 40 px column, time 10/800, dot 9 px, connector 2 px `rgba(120,100,75,.10)`. Dot colours
  `done #8CA58A · adjusted #C98A3F · skipped #D9CFBD · due-now accent · future #E4DCCB`.
- Due meal card border `1.5px mixOklab(accent, 32, #FFFDF7)` + inline `As planned` / `Adjust`; future meals
  append `· later today` and show no confirm row and no skip link.
- Expanded meal: option chips (`Options — any of these is on plan`), item rows opening the portion modal
  (delta badge amber+/green−/neutral, `Didn't have it today`, `Only counts for today — tomorrow starts from
  the plan again.`), `Didn't have this meal`.
- Workout card with the `Exercises | Muscles` segmented view (`#F0EDE2` track r14, active `#453E35`/`#F7F0E4`),
  per-exercise checkboxes lifting the workout to `adjusted`, footer `Programs live in the Library — this
  only records today.`
- Final node: **Close the day** card (evening, today, not closed) → one tap closes only **due** items →
  the dark **Day closed** recap node with `Reopen`, footer `Recorded, not judged — tomorrow starts fresh.`
- **Acceptance:** ordering, due detection, close semantics and every state tag are unit-tested against
  APP-094's pure functions; the portion modal opens **centered via `popHost`** (session-21 rule).

---
**APP-099 · Day travel: dock, calendar sheet, past days** *(depends APP-094, APP-097, APP-101)*
*Implements: README §3 Dock date picker + §4 screen 3; prototype lines 370–427, calendar sheet.*
Files: move `src/tabs/home/{DockDatePicker.tsx,dock.ts}` → `src/day/dock/`; new
`src/day/{CalendarSheet,PastDay}.tsx`, `src/day/__tests__/pastday.test.ts`.
- Dock unchanged mechanically (Gaussian `exp(−(d/(slot·1.25))²)`, scale `1 + 1.15·mag`, lift `−13·mag`,
  selected idle 1.85, release `.55s cubic-bezier(.34,1.56,.64,1)`, one haptic per dot crossing, accent
  tooltip via `vtTip`), **plus** a per-day status dot.
- Calendar sheet: month grid, 7 columns, 42 px cells, status dot per day (`#8CA58A` as planned ·
  `#C98A3F` adjusted · 1.5 px ring `rgba(120,100,75,.35)` no record), selected cell accent bg, future
  days disabled, legend `as planned · adjusted · no record`.
- Past day: recorded card (`Closed — as planned` / `Closed — with adjustments`, subtitle `recorded by you —
  counters, not scores`, bullet rows) **or** the unrecorded card (dashed border, `No record for this day`,
  `Vita assumed nothing. The plan that day was …`, CTA `Close as planned ↺`, caption `Only if it truly went
  to plan — otherwise leave it quiet.`) → retro-close writes `closed.mode = "retro"` with an undo toast
  `Closed as planned — thanks for being honest`.
- Past-day muscle map (`probable muscle use, from that day's recorded program`) or the `Log Leg day` /
  `Log Upper body` chips with `Only if it truly happened — otherwise leave it quiet.`
- **Acceptance:** an untouched past day never renders as a failure; retro-close is distinguishable from a
  live close in the record and in Trends; the calendar dot for a day with no record is a **ring**, not a fill.

---
**APP-100 · Trends panel rebuild** *(depends APP-094, APP-101, APP-102)*
*Implements: README §3 Charts + §4 screen 4; prototype lines 128–292, 1490–1523.*
Files: `src/trends/TrendsPanel.tsx` (ownership), `parts.tsx`, `scrub.tsx`, `aggregate.ts`;
deletes `FoodTab.tsx`, `ActivityTab.tsx`, `consistency.ts`, `src/tabs/Trends.tsx`.
- W/M/Y rail (`Week · Month · Year`, `#F0EDE2` track r18, active `#453E35`/`#F7F0E4`); switching the range
  **always clears the pin**.
- Record counter: `N of D days this year have a record` (D = live day-of-year), 44/200 ls −1.5, plus
  `The rest simply weren't recorded — nothing was assumed about them.` N comes from the day-record index
  (§4 `GET /days`), never a guess.
- Three bar charts (Energy `#E0A375` · Water `#A9BC9B` · Movement `#8CA58A`): `h = max(4, round(v/max*96))%`
  in a 72 px box, r3, gap `6px` for ≤12 bars / `2px` for 30; axis labels on W and Y only; the week's last
  bar is **live** (today's recorded values).
- **Pin vs scrub**: pointer-down sets and marks `moved:false`; move updates and sets `moved`; release clears
  the selection **only if it moved**. A tap therefore pins — bar stays accent, tooltip and detail card stay.
  One global pinned selection: pinning one chart un-pins the others. Tooltip at `left:(i+.5)/n·100%`.
- Detail card (`#FBF6EC`, r16): Week → that day's record lines (`No record — Vita assumed nothing` when
  unrecorded, `Closed as planned — later, by you` when retro-closed) + `Open this day →` (jumps to panel 1
  at that offset); M/Y → range average, highest/lowest, `N of M periods with a record`.
- Weight line: 306×64 polyline `#E0A375` 2.5 px, dot `r4.5` accent + 2 px `#FFFDF7` stroke parked on the
  last point; scrub index `round(x/w·(n−1))` (**note: nearest-vertex, unlike the bars' `floor` over `n`
  buckets**); detail `value · date · ±delta vs previous | first in range · source`.
- Muscle focus (APP-101) + Habits dot strips (APP-102 sheet on tap). Footer captions are counters, never
  targets: `Scrub to explore · tap a bar to pin it. Estimates from your records.`
- **Fix the prototype's own inconsistency**: its habit dot strips read newest-left while every chart reads
  oldest-left. Render **oldest-left everywhere**.
- **Acceptance:** `barHeight / scrubIndex / weightScrubIndex / pinVsScrub` unit-tested; the Y window
  aggregates 12 months without blocking the JS thread (§6 R6); an empty range renders the honest empty
  state, not zeros.

### Wave 4 — integration (3 parallel builders)

---
**APP-106 · Single day-close notification (replaces per-meal check-ins)**
*Implements: README §4 screen 6; prototype lines 97–119.*
Files: `src/habits/notifier.ts` → `src/notify/{notifier,dayClose}.ts`, `src/notify/__tests__/*`;
deletes `src/habits/digest.ts`, the `plan`/`digest` habit kinds, `src/habits/CheckinSheet.tsx`.
- One local notification per day in the evening: title `Close your day?`, body = pending meal names +
  `still marked planned. One tap records the rest as it was planned.` (or `Everything is confirmed. `),
  footer `Ignoring this leaves the day unrecorded — Vita never assumes.`
- Two actions: `Close as planned` (applies `closeDay` and opens the Day) and `I'll adjust` (opens the Day,
  records nothing). Ignoring leaves the day **unrecorded** — that is the designed outcome, not a bug.
- Per-habit daily reminders **stay** (Library's per-habit switch owns them). Per-meal check-in
  notifications are removed.
- Reuse the existing `recapStartHour` setting as the day-close hour (default 20:00) — this also answers
  the session-21 open question about the 20:30 recap notification.
- **Acceptance:** exactly one day-close notification is scheduled per day; the action buttons degrade to
  "open the app" when the OS drops them; nothing is scheduled during vacation unless the user kept it.

---
**APP-107 · Health Connect permission request — diagnose and fix**
*Carries over the session-21 blocker. Files: `plugins/withHealthConnect.js`, `src/health/healthConnect.ts`,
`src/library/sections/Sources.tsx`.*
- **Session-21's hypothesis is already disproven**: the config plugin *does* inject
  `HealthConnectPermissionDelegate.setPermissionDelegate(this)` and the generated `MainActivity.kt` line 22
  has it. So the delegate is not the cause.
- **New leading hypothesis, from reading the generated manifest**: the app declares only the legacy
  pre-Android-14 rationale intent-filter `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` on
  `MainActivity`. On **Android 14+**, where Health Connect is a platform module (the CEO's SM_S942B runs
  Android 15), Google requires an **`<activity-alias>` with
  `android.intent.action.VIEW_PERMISSION_USAGE` + `android.intent.category.HEALTH_PERMISSIONS`** *in
  addition to* the legacy filter. Without it the system permission flow has nothing to launch — which
  matches the observed symptom exactly (no Activity launches, zero logcat lines, no Play Store, toggle reverts).
  Secondary suspect: `MainActivity` is `launchMode="singleTask"`, which can drop `ActivityResult` callbacks.
- Ordered work: (1) ship a **diagnostic build** that surfaces the raw `getSdkStatus()` value and the caught
  error message in an on-screen toast (release strips console); (2) add the activity-alias to the plugin;
  (3) if still failing, try `singleTop`; (4) add `READ_WEIGHT` to the permission set — v4's Library row
  promises `weight & workouts flow in` and the current scope is energy/steps/exercise only.
- **Acceptance:** the permission dialog appears on the CEO's Samsung, weight and sessions read back, and
  the toggle reflects the truth in all three availability states. **Device-only — jest and the emulator
  cannot verify any of this.**

---
**APP-108 · Deletion sweep + i18n restructure**
Files: the whole `delete` column of §2, plus `src/i18n/locales/en.json`.
- Remove every dead screen, route, sheet and test listed above; verify nothing imports them
  (`tsc` is the gate).
- Restructure `en.json` around the v4 tree (`shell / day / overview / timeline / trends / library /
  capture / onboarding / notify / common`). **Every user-visible string in this round goes through `t()`** —
  adding a language must stay a translation-file-only change.
- Copy-rule sweep (README §5): grep the whole locale file for `goal`, `target`, `streak`, `missed`, `score`
  and fail the ticket if any survives outside a negation.
- **Acceptance:** tsc 0, Jest green, `expo export` OK, zero orphan files, zero hardcoded user-visible strings.

### Wave 5 — verification

---
**APP-109 · QA automation + device verification + APK**
Files: `.maestro/*`, `src/__tests__/*` (v4 flows), `scripts/`.
- Maestro flows: onboarding (2 steps) → Day → edge-swipe to Trends and Library → confirm a meal →
  close the day → retro-close a past day → capture a delta.
- Full jest suite green; then the §6 device checklist on the CEO's Samsung; then a fresh prod-baked APK
  (install clean: `adb uninstall com.llmagal.vita` first — a stale mock SQLite has burned us twice).

### Wave table

| Wave | Tickets | Parallel builders | Blocks on |
|---|---|---|---|
| 0 | APP-093, 094, 095 | 3 | — |
| 1 | APP-096 | 1 | 093 |
| 2 | APP-097, 101, 102, 103, 104, 105 | 6 | 093–096 |
| 3 | APP-098, 099, 100 | 3 | 094, 097, 101, 102 |
| 4 | APP-106, 107, 108 | 3 | all screens |
| 5 | APP-109 | 1 | everything |

**17 tickets, 6 waves.**

---

## 4 · Contract needs for the backend

The app does not design the backend; this is the precise list of what v4 cannot ship without. Contract is
at v0.7.0 — this is a **v0.8.0** ask. CEO Round 10 #1 already established that *outcomes* persist
server-side (check-ins, vacation), so day records follow the same rule.

### 4.1 Day records — new resource (the big one)

- **`GET /days?from=<date>&to=<date>`** → compact index, one row per day **that has a record**:
  `[{ date, status: "as_planned"|"adjusted"|"unrecorded", closed: bool, closedMode: "live"|"retro" }]`.
  Three consumers: the calendar sheet's status dots, the Trends **record counter**
  (`N of D days this year have a record`), and the Trends week detail cards. Must be cheap — the app asks
  for a 12-month range on the Year view.
- **`GET /days/{date}`** → the full `DayRecord`.
- **`PUT /days/{date}`** → upsert, `Idempotency-Key` honoured, 200 echoes the stored record.
- `DayRecord` shape the app needs:
  ```
  date            YYYY-MM-DD, the user's LOCAL day
  meals           map<planMealId, {
                    state: planned|done|adjusted|skipped,
                    optionIndex?: int,
                    items: map<planItemId, { qty?: number, skipped?: bool,
                                             swap?: { name, qty, unit, kcal } }>
                  }>
  workout?        { program: string, state: planned|done|adjusted, exercisesDone: int[] }
  closed?         { at: date-time, mode: "live"|"retro" }
  habits          map<habitId, "yes"|"no">        (may stay as `checkin` entries instead — backend's call)
  weight?         { kg, at, source }              (may stay as a `weight` entry instead — backend's call)
  ```
- **Semantics the app depends on:** *no row = unrecorded*. An empty record and a missing record must not
  collapse into the same thing — the entire "gaps are just days, not failures" copy rests on it.
- Encryption: day records are health data → same crypto-shredding rule as entries (backend ADR-0003).
  The portions overlay precedent (plaintext, CEO amendment A1) may or may not apply; backend decides.

### 4.2 Weight

- `NewEntry.type` **+= `weight`**, and a `WeightDetail { kg: number (20–400), source?: user|health_connect }`
  member of `EntryDetail`. Consumers: the Day Overview weight card and the Trends weight line over W/M/Y.
- Alternative accepted: fold weight into `DayRecord.weight` and skip the entry type — but then
  `GET /days?from&to` must return `weight` in the compact index, or the Trends line needs its own endpoint.
  **App preference: the entry type** — it reuses the existing `GET /entries?type=&from=&to=` paging.

### 4.3 Capture as a plan delta

- `ParseResult` **+= optional `planDelta`**:
  ```
  planDelta: {
    planMealId: string,
    mealState: "done" | "adjusted",
    itemChanges: [ { planItemId, swapTo?: {name, qty, unit, kcal}, qty?: number, skipped?: bool } ],
    kcalDelta: number          // signed, vs the plan
  }
  ```
  Applies to `POST /parse/text` and `POST /parse/photo`. The parser needs the user's current plan in
  context (the backend already stores it).
- The existing loose-draft `drafts[]` must **stay** and be returned when nothing matches the plan — an
  off-plan meal has to remain recordable.

### 4.4 Nothing needed (confirming, so the backend doesn't build it)

- **Habit weekday schedule**: device-local by standing decision D1 and already implemented
  (`habits.days[7] / time / enabled`). Only check-in *results* persist, via the existing `checkin` entry
  type — unchanged.
- **Composition flags**: device-local kv is enough; they gate UI and explicitly never delete data.
  *(Unless the CEO wants them to survive a reinstall — see Q2, which would add `User.domains` to `PATCH /me`.)*
- **Adding a meal to the plan** ("+ Add a meal", outside the PDF): the existing `PUT /plan` doc edit covers
  it. No new endpoint.
- **Close-the-day and retro-close**: both are just `PUT /days/{date}` with `closed.mode`. No verb needed.

### 4.5 One thing to confirm with the backend

`GET /entries?type=checkin&from=&to=` must page a **12-month** window efficiently — the habit detail
sheet's by-month history and by-weekday frequency read it.

---

## 5 · Risks

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| R1 | **Gesture arbitration** — edge-swipe pan vs the Day ScrollView vs the dock pan vs chart scrub vs the portion slider | This exact class of bug ate the swipe twice (session 6 mid-gesture remount, session 11 pager-vs-timeline) and made PortionPop unusable (session 21) | Keep the single `blocksExternalGesture` chain that already works; never grow the mounted set mid-gesture; the panel pan is fully disabled while any sheet is open; the edge zone is 34 px so mid-screen drags never reach the shell. **Device-verify D1** |
| R2 | **Parallax perf** — the prototype drives parallax from a `setState` on every scroll frame past a 1 px threshold | On a real device that is a JS-thread storm behind a gradient + 2 SVG layers; Home already renders a long list under it | `useAnimatedScrollHandler` + shared value + `useAnimatedStyle`; zero React state in the scroll path. **Device-verify D2** |
| R3 | **Android blur** — the panel tabs *and* the capture pill are both frosted (`blur 14/20 + saturate`) and they float over scrolling content | Session 20 already found Android's `expo-blur` too weak and fell back to a cream scrim for the macros backdrop; two more always-on blur surfaces is a new, heavier case | Build the light fallback first (translucent fill + 1 px border + shadow), try real blur second, let the CEO judge on the Samsung. **Device-verify D3** |
| R4 | **Overlay placement** — v4 adds four new sheets and three new modals | `position:absolute` inside a ScrollView sinks the card to the middle of the *content* (the CEO's "abre fora de foco"); RN `Modal` ANRs with Reanimated + RNGH on Android | **Every** centered pop goes through `ui/popHost`; sheets keep the existing `SheetOverlay`. Non-negotiable, stated in each ticket. **Device-verify D4** |
| R5 | **Colour accuracy** — v4 mixes up to 86 % accent (`muF`) via `color-mix(in oklab, …)`; our `tint()` is an sRGB lerp documented accurate only to ~35 % | The muscle map is the most colour-sensitive surface in the app and it lives at the top of the mix range | Real oklab mix in APP-093, unit-tested against hand-computed references |
| R6 | **Year-window aggregation** — Trends `Y` buckets 12 months of local entries, and the record counter scans the year | 30-day aggregation is already the heaviest thing Trends does | Aggregate in SQL (`GROUP BY` on a date prefix) rather than JS-mapping every row; use the compact `GET /days` index for the counter instead of scanning entries |
| R7 | **Day record vs plan drift** — the plan can be re-imported while day records reference its `planItemId`s | A re-import resets ids (established in session 18/19); old day records would point at nothing | Day records store the **rendered** item name/qty alongside the id, so a historical day still reads correctly after a re-import. Spec'd in APP-094 |
| R8 | **Health Connect permission (carry-over)** | Blocked since session 21; the previously-suspected cause is now disproven, so the fix is genuinely unknown until the diagnostic build runs on the CEO's phone | APP-107's ordered diagnostic. Not a publishing gate |
| R9 | **Scope** — 17 tickets touching almost every screen, with the money-path (PDF import) in the blast radius | The PDF import money-path was silently broken for four sessions because nobody drove the picker on a device | APP-109 re-drives the full import on-device before the round is called done |

### Device-verification checklist (jest cannot catch any of these)

- **D1** Edge-swipe: from the left edge on Day → Trends; from the right edge → Library; a mid-screen
  horizontal drag on Day does **nothing**; a vertical drag scrolls; the dock still drags; a chart still
  scrubs; the portion slider still drags. Both directions, at the 90 px boundary.
- **D2** Parallax smoothness while flinging the Day panel, on the evening scene (stars + gradient + hills).
- **D3** Panel tabs and capture pill legibility over scrolling content — light *and* dark scene.
- **D4** Every pop centers with its primary button visible: portion, macros, water-exact, weight. No ANR.
- **D5** Close-the-day: the card appears at the configured hour, one tap closes only due meals, the recap
  node replaces it, `Reopen` works. Then the lock-screen notification with both actions.
- **D6** Retro-close a past day, then check it in the Trends week detail and the calendar dot.
- **D7** Capture: hold-mic → real transcription → delta card → `Record it` → the meal flips to adjusted and
  expands → Undo restores it exactly.
- **D8** PDF import end-to-end with the real `meal-plan.pdf` (the money path — re-verify every round).
- **D9** Health Connect permission dialog (APP-107).
- **D10** Muscle map legibility at high intensity mixes and the per-muscle sheet's `Open this day →`.

---

## 6 · Questions for the CEO

Only genuine decisions — everything the handoff already answers has been taken as decided.

1. **Do day records persist server-side?** Round 10 #1 said outcomes (check-ins, vacation) persist. Day
   records are the v4 equivalent and the biggest new thing on the wire. Confirming yes unblocks §4.1 as a
   backend ticket; confirming no makes v4 device-local (cheaper, but the log dies with the phone and export
   is the only backup).
2. **Composition flags — device-local or on the account?** Device-local costs nothing but a reinstall
   resets them to "keep everything". Putting them on `PATCH /me` is ~10 lines each side.
3. **iOS Connected sources** (open since session 16): with the Integrations screen gone, does iOS show the
   Library "Connected sources" section as empty, hide it entirely, or show an Apple-Health placeholder?
   Recommendation: **hide the section** until a real HealthKit reader exists — an empty section is a fake
   surface, and v4 is explicitly about deleting those.
4. **Manual "spent energy"** (your Round 10 #4 decision) has no home in v4 — the Garmin/energy card is
   removed and there is no energy surface in the prototype. Delete the feature, or keep a manual entry
   somewhere in Library?
5. **Delete my data**: the prototype wipes the device and returns to onboarding. Our contract has
   `DELETE /account` with a 7-day grace period. Keep the server-side grace flow behind that button
   (recommended — it is the honest one), or make it a pure device wipe?
6. **Vacation mode**: the prototype's "This week / Until I end it" and "keep the water card" are copy only.
   Should "This week" **auto-expire** after 7 days, and should "keep water" mean the water card and its
   notifications survive while everything else pauses? (Our v3 vacation already has a `keepCheckins` flag —
   this would replace it.)
7. **Scenic vs classic home**: the prototype ships both behind a `homeStyle` tweak. Plan assumes
   **scenic only** (classic is not built). Say if you want classic kept as a setting.

---

## 7 · Size estimate

| Wave | Tickets | Builder-sessions | Notes |
|---|---|---|---|
| 0 | 093, 094, 095 | **3.5** | 094 alone is ~1.5 (it is the model everything reads) |
| 1 | 096 | **1.5** | small file, high fragility — the extra half is device iteration |
| 2 | 097, 101, 102, 103, 104, 105 | **6** | six independent surfaces, one session each |
| 3 | 098, 099, 100 | **3.5** | 098 (timeline) is the fattest screen in the app |
| 4 | 106, 107, 108 | **2.5** | 107 is device-gated and may need a second pass |
| 5 | 109 | **1** | plus CEO device time |
| | **17** | **≈ 18 builder-sessions** | + 2 adversarial review passes (the v3 round proved they catch the structural bugs) |

Add one orchestrator gate per wave (tsc + Jest + `api:check` + `expo export`) and one fresh prod-baked APK
at the end. The v3 round's shape — parallel Opus builders on disjoint trees → Fable adversarial review →
fix pass → gates → commit — is the shape to repeat here.
