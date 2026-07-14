# APP-028 — Trends Activity tab (slice 6, F8) — Progress

**Asana:** APP-028 (Vita frontend `1216519867368576`) — "Activity tab: muscles heatmap reusing BodyMap, ranked chips, aerobic minutes, workout squares → session list → preview sheet. Aggregated on device."
**Backend gate:** none beyond BE-017.

## What was built — `src/trends/ActivityTab.tsx`

Reads the window's workouts once (`entriesInRange("workout", …)`) → the APP-027 aggregation core (`aggregateDays`, `muscleStats`, `workoutsInWindow`). Three cards + a preview sheet:

### 1. Muscles heatmap — **BodyMap REUSED (not reimplemented)**
Two `<BodyMap>` instances (`src/ui/BodyMap.tsx`, the APP-019 primitive) side by side, `showToggle={false}`, `side="front"`/`"back"`, `size={90}`, both fed **`highlighted={muscles.intensity}`** — the normalized per-muscle map from `muscleStats`. Front∪back covers all 11 muscles (the exact prop surface APP-019 documented; unit-tested that intensity keys ⊆ `ALL_MUSCLES`). Below: **ranked muscle chips** with session counts (`Quads 3`, sorted desc), honest "no workouts" fallback, "darker = worked in more sessions" caption.

### 2. Active (aerobic) minutes
Big total-minutes number + per-day bars (scrubbable via `<TrendCard count>`). **Honest**: minutes come from logged workout `durationMin`; footer = "Connect a health source to include aerobic activity" — no fabricated Strava/Garmin data (philosophy + no health sync yet).

### 3. Workouts — squares → session list → preview sheet
- **Heatmap squares**: window days chunked into rows of 7, each square shaded by that day's `workoutMin` (empty = surface, else accent 0.3→1.0; vacation days faint). "darker = longer session".
- **Session list**: `workoutsInWindow` (newest first) → date badge + title + duration; tap → **preview sheet** (RN `Modal`, mirrors the workout-detail preview): title/day/time/duration, kcal + **estimate tag**, muscle chips, exercises (kg→lb via units), "Open this workout" → `router.push('/workout/{id}')`.

Vacation-day exclusion flows through `muscleStats`/`workoutsInWindow`/`aggregateDays` via the same `isExcluded` predicate threaded from `trends.tsx`.

## Tests / gates (all green)
- Muscle math in `src/trends/__tests__/aggregate.test.ts`: `muscleStats` counts sessions per muscle, **normalizes intensity to busiest = 1**, ranked sorted desc, **intensity keys are all real BodyMap muscles within [0,1]** (the map that feeds `BodyMap.highlighted`), vacation workouts excluded from counts. `workoutsInWindow` newest-first + exclusion.
- `src/__tests__/trends.test.tsx`: Activity tab shows muscles-worked heatmap, ranked chip with count (`Quads 1`), and the workout session in the list.
- Full suite **122/122 (26 suites)** · `tsc` clean · `api:check` exit 0 (no drift) · `expo export` iOS OK · no new deps.

## Confirmed: BodyMap reused, not reimplemented
Both maps are the shared `src/ui/BodyMap` primitive driven purely by the `highlighted` intensity map. No SVG body was duplicated in the Trends code.

## ponytail notes
- Muscle chips are display-only (ranked). The prototype's per-muscle exercise sheet (`tmSheet`) skipped — the ticket's "→ preview sheet" attaches to the workout list, which is built.
- Squares are a read-only heatmap (not tappable); the session list is the tap target, per the prototype flow.
