# APP-100 — Trends panel rebuild (v4)

Session 22 (v4 round). Builder: Opus. Spec: `docs/v4/README.md` §3 Charts + §4 screen 4,
prototype `Vita Prototype v4.dc.html` lines 128–292 (markup) and 1490–1523 + 1680–1695 +
1734–1735 (state). Ownership taken over the APP-096 placeholder.

## What shipped

**`src/trends/series.ts`** (new) — every number on the screen, and the one file that
answers plan risk **R6**. All three ranges come from **ONE `GROUP BY`** over `entries`
returning ≤ 30 rows (`strftime('%Y-%m-%d' | '%Y-%m', occurredAt, 'localtime')` — SQLite
buckets in the device zone, the same local-day rule `dayKey()` uses), and the record
counter is a single pass with two `COUNT(DISTINCT …)`s. A year of rows never reaches JS.

- `TrendRange = "W" | "M" | "Y"`, `RANGE_N = {W:7, M:30, Y:12}`; `rangeDates`/`rangeEnd`.
- `readBuckets` → `{key, date, kcal, waterMl, moveKcal, workouts, recorded}` per bucket
  (`kcal` via `json_extract(detail,'$.totals.kcal')`, water `$.amountMl`, movement
  `$.kcal` + a session count). Empty buckets come back zeroed and `recorded:false`.
- `yearCounters` → `{recorded, waterDays, dayOfYear}`; `dayOfYear` is **live**, never 365.
- `weightSeries` → the last reading per bucket, gaps omitted (no invented points).
- Pure geometry: `barHeightPct` (`max(4, round(v/max·96))`), `barGap` (6px ≤ 12 bars /
  2px at 30), `tipLeftPct` (`(i+.5)/n·100`), `recordedAverage`, `weightPoints` (306×64,
  y 57→13).

**`src/trends/TrendsPanel.tsx`** (rewritten) — ONE flat list, no tabs:
W/M/Y rail (`#F0EDE2` r18 pad 3, active `#453E35`/`#F7F0E4`, r15 — **switching range
always clears the pin**) → record counter card (44/200 ls −1.5 + "N of D days this year
have a record" + the "nothing was assumed" subline) → **Energy `#E0A375` · Water
`#A9BC9B` · Movement `#8CA58A`** bar charts (72px box, r3, axis labels on W and Y only,
week's last bar is live because it is simply today's own totals) → Muscle focus (BodyMap
`maxWidth 240` fed by `muT`, `trendChips` → `MuscleSheet`) → Habits (dot strips → 
`HabitDetailSheet`) → Weight line (`306×64` polyline `#E0A375` 2.5px, dot r4.5 accent +
2px `#FFFDF7`).

- **ONE pin across all four charts**: `pin = {chart, index} | null` lives here, so
  pinning Water drops the Energy pin; the range rail nulls it.
- **Detail card** (`#FBF6EC` r16): W → that day's record lines from `getDayRecord` +
  `dayCounters`/`recapLine`/`dayIsRetro` (reused, not re-written), `"Closed as planned —
  later, by you"` when retro, `"No record — Vita assumed nothing"` when nothing was
  recorded, and `Open this day →` for `offset > 0` (→ `setSelectedDate` + `router.replace("/day")`,
  the APP-102 `onOpenDay(offset)` contract). M/Y → range average · highest/lowest ·
  "N of M periods with a record".
- Every card is gated by its composition flag (`useDomains`): meals · water · move
  (chart + muscle focus) · habits · weight.

**`src/trends/scrub.tsx`** (rewritten) — the pin rule: pointer-down selects, a move
marks the gesture `moved`, **release clears only if it moved** (a tap pins). Adds
`nearestIndexFromX` + `snap="vertex"` for the weight line (round-to-nearest-reading,
deliberately unlike the bars' `floor`). The `blocksExternalGesture(tabsPagerRef)` +
`activeOffsetX/failOffsetY` arbitration chain is untouched — the chart still wins its
horizontal drag against the panel edge-swipe.

**`src/trends/parts.tsx`** — `GrowBar` / `SectionLabel` / `linePath` / `TrendsReplayContext` /
`barDelay` kept verbatim. `TrendCard` (the v3 collapsible) **deleted**; new `TrendsCard`
(`#FFFDF7` r24, 15×17, `vtFade` entrance, re-keyed on the replay epoch), `CardHead`,
`CardFoot`, `BarChart`, `DetailCard`, and a self-measuring `Tip` (RN has no
`translateX(-50%)`, so the pill offsets by half its own measured width).

**`src/trends/aggregate.ts`** — trimmed to what still has consumers: `dayKey`,
`vacationExcluder`, `windowDays`/`windowRange`, `aggregateDays`/`visibleDays` (the PDF
export). `TrendWindow` is now `"W" | "M"` and **`WINDOW_DAYS.F = 15` is gone**;
`mealTimeDots`, `muscleStats`, `workoutsInWindow` and their types died with the tabs.

**`src/i18n/locales/en.json`** — the `trends.*` namespace was rewritten for v4 (the v3
Food/Activity keys are gone). Range words reuse the existing `muscle.range.*`; the muscle
chips reuse `muscle.name.*` / `muscle.sessionCount`.

## Deletions (tsc-proven unreferenced after the rewire)

`src/trends/FoodTab.tsx` · `src/trends/ActivityTab.tsx` · `src/trends/consistency.ts` ·
`src/trends/MuscleSheet.tsx` (v3) · `src/tabs/Trends.tsx` · `src/__tests__/trends.test.tsx`
(the v3 tab's render test) · `src/trends/__tests__/consistency.test.ts`.
`app/(main)/trends.tsx` was already a `return null` route placeholder — nothing v3 renders.
Nothing was deferred to APP-108: `npx tsc --noEmit` is clean tree-wide.

## Decisions / deviations worth a reviewer's eye

1. **Vacation days are NOT excluded from the charts.** v3 filtered them; the prototype
   does not, and in the v4 model a vacation day that carries a record *is* a record.
   `vacationExcluder` still exists and the habit sheet still annotates vacation.
2. **"Days with a record" = a meal, water or workout entry.** Same three sources
   `recapLine` reads, so the counter and the week detail card never disagree. A day whose
   only entry is a weight reading or a check-in is not counted (pinned test).
3. **The headline average skips the still-open bucket** (`recordedAverage`), in every
   range — the prototype only special-cases the week. Averaging today's half-day into
   "avg N kcal/day" would be a wrong number, not a faithful one. `—` when there is no
   closed bucket yet.
4. **Movement W/M plots workout kcal, falling back to a session count** when nothing in
   the range carries kcal (an exercise-only workout is still movement, and a flat empty
   chart would be a lie). Y always counts sessions, as the prototype does.
5. **Habit strips render oldest-left** in all three ranges, matching the bars — the fix
   the ticket called for.
6. **`Habits · this week/month/year`** instead of the prototype's hardcoded
   "Habits · this month", whose strips already followed the rail.
7. **Weight is plotted per reading, not per day slot.** One point per bucket (the last
   reading), gaps omitted — so a weekly weigh-in draws a 4-point line rather than 26
   interpolated zeros. Source line reads `entered by you` (APP-097: no HC weight reader).
8. `dayIsRetro` derives from the server's `loggedAt` (PLAN R2), so a retro-close that has
   not synced yet shows its recap lines rather than "Closed as planned — later, by you".
   Inherent to the model, not to this screen.
9. The panel writes the selected day through `src/day/selection.ts`; `DayPanel` does not
   read it yet (APP-099 owns the dock). The jump lands on `/day` and will show the chosen
   day the moment APP-099 wires it.

## Gates (scoped)

- `npx tsc --noEmit` — **0 errors, tree-wide.**
- `npx jest src/trends` — **4 suites, 27 tests, all green** (was 2 suites / 14; the
  `consistency` suite went with its module). New: `series.test.ts` (15 — SQL bucketing,
  Y-by-month, the weight-only-day exclusion, year counters incl. the last-year leak, the
  weight series, all geometry) and `panel.test.tsx` (3 — the flat list renders, domain
  gating hides a card without deleting, the range switch re-labels).
- Neighbours re-run clean: `npx jest src/export src/habits src/db src/muscle` → 17 suites,
  133 tests green.

## Device-verify list (emulator/CEO)

1. Chart scrub still beats the panel edge-swipe: drag horizontally across a chart from
   near the left edge — the panel must not travel.
2. Tap a bar → it turns accent and the detail card opens and STAYS (tap = pin); drag
   across and release → everything clears.
3. Pin Energy, then tap a Water bar — the Energy pin must drop (one pin, panel-wide).
4. Switch W → M → Y with a bar pinned: the pin is gone every time.
5. `Open this day →` on a past week bar (needs APP-099's dock to visibly land).
6. Tooltip centring on the first frame (it measures itself; it should never flash
   off-centre) and the 30-bar month at 2px gaps.
7. Bars re-grow left→right every time Trends is swiped into (focus-replay epoch).
8. Muscle chip → sheet, habit row → sheet, weight scrub dot tracking.

## Cross-ownership notes (reported, not touched)

- `src/day/__tests__/overview.test.tsx` has 4 failures in the current tree: it calls
  `render(...)` without `await`, and RNTL v14 here returns a promise (`screen` is then
  never populated). APP-097's file; the one-word fix is `await render(...)`.
