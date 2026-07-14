# APP-027 — Trends Food tab (slice 6, F8) — Progress

**Asana:** APP-027 (Vita frontend `1216519867368576`) — "Food tab: W/F/M, calories bars↔curve, consumed vs spent, macro balance, water, meal-time dot plot; scrub-by-drag; aggregated on device (D4); estimates labeled; vacation-day filter hook."
**Backend gate:** none (BE-017 range already used for real-mode reads; mock mode reads SQLite directly).

## What was built

### Pure aggregation core — `src/trends/aggregate.ts` (D4: client-side over SQLite, NO server aggregate)
All windowing/bucketing math, unit-tested, DB-free:
- `TrendWindow = "W"|"F"|"M"`, `WINDOW_DAYS = {W:7, F:14, M:30}`.
- `windowDays(win, today)` — N local-midnight days, oldest→newest, ending today (inclusive).
- `windowRange(win, today)` — half-open `[firstDay, tomorrow)` handed straight to `entriesInRange`.
- `dayKey(date)` — local `YYYY-MM-DD` bucket key (device tz).
- `aggregateDays(entries, win, today, isExcluded?)` → `DayBucket[]`: per-day sums of
  consumed kcal + macros (meals), waterMl (water), **spentKcal + workoutMin (workouts; D8: spent = logged workout kcal)**. Missing days stay zeroed; out-of-window entries ignored; each bucket carries an `excluded` flag from the vacation hook.
- `mealTimeDots(...)` — meal scatter: x = clock time (6:00→0%, 24:00→100%, pre-6am clamps 0), y = day position, opacity = relative kcal.
- `visibleDays()` — non-vacation days (base for stat lines / axis max).
- **Vacation hook**: `vacationExcluder(ranges) → (dayKey)=>boolean` (inclusive `[start,end]`, ISO datetime bounds sliced to date). Slice-7/APP-030 swaps the empty list in `trends.tsx` for the persisted ranges — aggregation already honors it.

### Scrub-by-drag — `src/trends/scrub.tsx`
Reuses the **Slider gesture pattern** (gesture-handler `Pan` + `runOnJS`, no new deps). `indexFromX(x, width, count)` pure/clamped; `<ScrubOverlay>` absolute-fills a chart and fires the day index per frame, clearing on release.

### Shared card — `src/trends/parts.tsx`
`TrendCard` (uppercase title + unit note / right-hand `extra` toggle, optional scrub readout line "value · date · drag the chart", footer). `linePath()` pure SVG polyline builder. `SectionLabel`.

### Food tab — `src/trends/FoodTab.tsx`
Reads the window once (`entriesInRange` for meal+water+workout) → `aggregateDays`. Five cards:
1. **Calories** — bars ↔ curve toggle (SVG `Path` via `linePath`); scrub reads that day's kcal; footer = avg/day + "estimates".
2. **Consumed vs spent** — paired bars (D8 spent honest; footer says "stays at zero until a workout is logged" when empty).
3. **Macro balance** — per-day stacked share of kcal (4/4/9 kcal/g), legend.
4. **Water** — units-aware bars (`formatVolume`), avg/day note.
5. **Meal times** — dot plot with 6/12/18/24 axis.

All charts dim non-active bars while scrubbing and dim vacation days (opacity 0.25). Estimates labeled on calories + consumed-vs-spent.

### Host screen — `app/(main)/trends.tsx`
Replaces the stub: header eyebrow + **W/F/M** `Segment`, range label + "N days · recorded totals only", **Food / Activity** tab `Segment`, renders `<FoodTab>` / `<ActivityTab>`. Reached via the pill (`router.replace("/trends")`) — no back button (it's a nav tab).

### Seed — `src/db/seed.ts`
Extended with ~a month of deterministic history (meals ×2–3/day, water, a workout every ~3rd day across 29 days) so W/F/M all show data in Expo Go. No randomness (stable in tests).

### i18n — `src/i18n/locales/en.json`
`trends.*` block (window labels, card titles, legends, drag hint, honest empty/health copy). No key removed.

## Tests / gates (all green)
- `src/trends/__tests__/aggregate.test.ts` — windowing (W/F/M sizes, boundaries, half-open range), bucketing (sums + out-of-window ignored + zeroed gaps), **vacation exclusion** (flag + visibleDays drop + ISO bounds), meal-dot time mapping, scrub `indexFromX` clamping. Muscle-intensity tests shared with APP-028.
- `src/__tests__/trends.test.tsx` — Food tab renders window switch + cards + estimate label; bars↔curve toggle.
- Full suite **122/122 (26 suites)**, +16. `tsc` clean · `api:check` exit 0 (no drift) · `expo export` iOS OK · `expo install --check` up to date, no new deps.

## ponytail notes
- Scrub overlay is always draggable (readout appears on touch) rather than the prototype's tap-to-open-then-drag — one less state, same interaction.
- Curve = a single consumed-kcal polyline (prototype's decorative back-fills skipped).
- Meal-dot y = day index (not amount); amount drives opacity. Honest, simplest scatter.
