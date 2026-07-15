# HOME-V2 — Home v2 (dock date picker + inline timeline)

Asana epic **HOME-V2** `1216600225044885` (subtasks HOME-V2-1..9).
Spec: `docs/home-v2/IMPLEMENTATION-SPEC.md` (+ `handoff-extract.md`, `tokens-table.md`, `screens-analysis.md`, `handoff/screens/*.png`).
CEO greenlit the build ("manda ver"). Home v2 **replaces** v1 (no toggle).

## Session 13 (2026-07-15) — built + emulator-verified ✅

### What shipped (component → file)
- **`src/tabs/home/dock.ts`** (NEW, pure, unit-tested) — Gaussian/index math: `offsetForIndex`/`indexForOffset`
  (i↔9-i mapping), `hoverIndex`, `gaussian`, `dotState`, geometry helpers + magnifier literals
  (`AMPLITUDE 1.15`, `SPREAD_FACTOR 1.25`, `LIFT_PX 13`, `IDLE_SELECTED_SCALE 1.85`). **Every helper carries
  `"worklet"`** — they run inside the dock's `useAnimatedStyle`/gesture on the UI thread (see gotcha below).
- **`src/lib/haptics.ts`** (NEW, ~12 lines) — `selectionTick()` = lazy-require `expo-haptics` `selectionAsync`,
  fully swallowed (Expo-Go-safe, jest no-op). Same stub-seam as notifier/voice. New dep **`expo-haptics ~56.0.3`**.
- **`src/tabs/home/DockDatePicker.tsx`** (NEW) — 10 dots, per-dot `useAnimatedStyle` Gaussian magnifier,
  per-crossing haptic tick, `vtTip` tooltip (static per-dot label, pop on hover), touch-down gesture
  (`manualActivation`+`onTouchesDown activate`, `blocksExternalGesture(tabsPagerRef)`), **commit-on-release only**.
  Release "spring back" = ONE animated `drag` value 1→0 with the overshoot bezier `(.34,1.56,.64,1)/550ms`,
  blending the drag-magnifier state ↔ idle state (no per-frame withSpring). `transformOrigin:"center bottom"`
  so dots grow upward.
- **`src/tabs/home/DaySection.tsx`** (NEW) — label (Today/Yesterday/weekday) + short date + **"Today ↺"** return
  pill (accent 10% tint via `${accent}1A`) + hosts the dock. Builds the 10 tooltip dates.
- **`src/tabs/home/Timeline.tsx`** (NEW) — summary line (factual counts, plural-aware), spine/gutter rows,
  **water = passive marker** (drop + amount + method, not tappable), **meal/workout = tappable card**
  (icon tile, kcal badge, chevron) **expand-in-place** (multi-open, keyed `e_{offset}_{id}`; chips + item rows +
  **"Full details →" today-only**). **Day-swipe gesture**: `activeOffsetX[-14,14]`/`failOffsetY[-18,18]` +
  `blocksExternalGesture(tabsPagerRef)`, elastic 1/3.5 at ends, `|dx|>70` commit, slide-in on commit
  (`dragX + enterX` summed into one translateX). Preserves the offline sync note + failed-dismiss the old card had.
- **`src/tabs/home/timelineData.ts`** (NEW, pure, unit-tested) — `daySummary`, `mealExpanded`, `workoutExpanded`.
- **`src/ui/tokens.ts`** — `colors.dotIdle #D9CFBD`; `shadowRow`, `shadowTooltip`; `entryPalette.*.dot`
  (meal `#E0A375`/water `#A9BC9B`/workout `#8CA58A`, the macro-palette dot system); **workout badge → green
  `#E7EDE1`/`#5F7A61`** (CEO decision #2 — movement is green, reconciled app-wide; `line` kept terracotta so the
  WaveIllustration crest on detail screens is unchanged).
- **`src/tabs/Home.tsx`** — day-aware: `selectedDayOffset`/`expandedKeys` (plain useState, discrete commits only),
  `goDay`/`onToggleEntry`/`onDismissEntry` callbacks, `dayEntries = entriesForDay(today-offset)` (same tested query),
  swapped the old wave-illustrated `TimelineCard` for `DaySection` + `Timeline`. **Top cards stay pinned to today.**
- **`src/i18n/locales/en.json`** — `home.dayYesterday/todayReturn/fullDetails/tlSummary/tlMealOne|Many/
  tlWorkoutOne|Many/tlWater/chipProtein|Carbs|Fat/minChip/exercisesChip/setsReps`.
- **Retired**: `TimelineCard` + `WaveIllustration`/`entryPalette` usage in Home (WaveIllustration stays in `src/ui` —
  detail screens still use it).

### R1 resolution (day-swipe vs tab pager — the session 5/6/10 bug class)
Timeline day-swipe uses the pager's own gate (`activeOffsetX[-14,14]`/`failOffsetY[-18,18]`) +
`blocksExternalGesture(tabsPagerRef)` — same pattern as the Trends scrub. **Device-verified:** a horizontal drag
ON the timeline changes the DAY and stays on Today; a horizontal drag on the top-cards region pages to Trends
(one tab, no session-10 last-tab regression); a vertical drag on the timeline scrolls (failOffsetY yields).
No setState mid-gesture; gestures read live state via shared values so a day-commit never recreates a mid-flight pan.

### Emulator pass (Pixel_10_Pro, Expo Go SDK 56, mock mode) — what I SAW
1. **Bug caught on device (why the pass is required):** first load red-screened `TypeError: Object is not a function`
   in the dock's `useAnimatedStyle` — the dock.ts helpers lacked `"worklet"`, so Reanimated couldn't call them on
   the UI thread. Fixed by tagging all pure helpers `"worklet"`; reloaded clean.
2. **Dock idle** — 9 grey dots + rightmost accent selected (larger), matches `screens/03`.
3. **Dock drag commits a day** — dragging to a middle dot loaded "FRIDAY Jul 10" + "TODAY ↺" pill appeared;
   top cards stayed pinned to today. Haptics fired during the drag, no crash.
4. **"Today ↺"** returns to today with content.
5. **Timeline rows** — water passive marker (green drop + "250 ml · Quick add"), meal card (peachy fork/knife tile,
   `~300 kcal` peachy badge), **workout card (GREEN barbell tile + GREEN `~315 kcal` badge — CEO decision live)**,
   color-coded spine dots.
6. **Expand-in-place** — Chicken card: rotated chevron, dashed separator, chips "P 56 g · C 0 g · F 7 g",
   item row, accent **"Full details →"** (today-only). Matches `screens/06`.
7. **Multi-open** — Chicken + Leg day expanded simultaneously.
8. **R1** — both halves verified (see above).
9. **Could NOT freeze in a screenshot:** the magnifier's live Gaussian bulge + tooltip pop mid-drag — adb
   `screencap` lands on arbitrary frames of an injected swipe. The gesture works end-to-end (every drag committed
   the correct day) and the math is unit-tested, but the peak-bulge visual wasn't captured statically. Honest gap.

### Gates
- `npx tsc --noEmit` **exit 0**
- `npx jest` **210/210 (41 suites)** — +2 new suites (`dock` 5, `timelineData` 3); `home.test` updated for v2
  (`~265 kcal` badge; sync note kept)
- `npx expo export` **OK** (iOS + Android)
- `expo install --check`: expo-haptics at expected `~56.0.3`; other drifts are pre-existing patch bumps (not mine)

### §7 defaults that mattered
- **Q7 workout color** — adopted green globally for the badge (ripples to Trends chips + workout detail badge);
  kept `line` terracotta so WaveIllustration crests on detail screens don't change. Flagged for CEO.
- **Q5 Full details** — today-only (design fidelity).
- **Q1 replace v1** — done, no toggle.
- Flo cycle row — gated OFF (not built). Water-vessel formula kept (never reads as a goal).

### Deferred / notes
- Benign Reanimated warning "Property 'transform' … may be overwritten by a layout animation" (from EntryRow's
  `layout={LinearTransition}` + the swipe translateX) — pre-existing class (session 10), non-fatal.
- Persisted emulator SQLite is anchored to an older seed date, so some past days show empty — that's the DB
  artifact, not a bug; the day query is the tested `entriesForDay`.
- DoD = in production; store release is F-LAST (CEO-gated). Tickets → In progress.
