# APP-019 — Workout detail + BodyMap primitive (slice 2) — Progress

**Asana:** APP-019 (Vita frontend `1216519867368576`) — "workout/[id] detail: source badge, exercises, 30-day history strip → preview sheet; interactive front/back BodyMap SVG primitive (reused by F8 Trends / APP-028)."
**Backend gate:** none. Consumes WorkoutDetail/Exercise + the 11-muscle closed vocab (contract v0.4.0).

## What was built

### 1. `BodyMap` primitive — `src/ui/BodyMap.tsx` (REUSABLE; exported from `src/ui`)
Hand-built SVG (ponytail: no charting/svg dep beyond the already-installed `react-native-svg`). A neutral base figure (head/torso/arms/legs from circles + rounded rects) with muscle regions overlaid as ellipses/rects, front and back views, built-in toggle.

**Prop surface (so APP-028 can plan on it):**
```ts
BodyMap({
  highlighted?: Partial<Record<Muscle, number>>,  // muscle → intensity 0..1; drives accent opacity
  side?: "front" | "back",                          // controlled; omit → internal toggle state
  onSideChange?: (side) => void,                    // fires on toggle (works controlled or not)
  showToggle?: boolean = true,                       // hide to render a fixed side (e.g. two maps)
  accent?: string = colors.accent,                   // highlight colour
  size?: number = 150,                               // SVG width px; height = size*2 (viewBox 200×400)
  frontLabel?, backLabel?: string,                   // i18n toggle labels
})
```
- **`Muscle` is authoritative** = `NonNullable<WorkoutDetail["muscles"]>[number]` (11-enum). Runtime `ALL_MUSCLES` array is `satisfies readonly Muscle[]` **and** guarded by a compile-time `_NoMissing` assertion, so it stays exactly in lockstep with the generated type (a contract enum change breaks the build, not silently the UI).
- **Pure, testable core exported**: `bodyRegions(side)` (muscle→shapes map) and `resolveHighlights(side, highlighted)` (→ `{muscle, shapes, opacity}[]`, intensity clamped to [0,1], idle=0.14 base tint, active ramps 0.25→0.90). The component is a thin renderer over `resolveHighlights`.
- **Intensity model for APP-028**: pass a normalized map (e.g. per-muscle session count / max over the window) → the heatmap falls out. Muscles map to a side; front∪back covers all 11 (unit-tested).

### 2. `workout/[id]` detail screen — `app/(main)/workout/[id].tsx`
Read-only over SQLite via `getEntry`, mirroring meal/water detail:
- **Hero**: title, `day · time · duration`, **source badge** (logged by text/voice/…), kcal with **estimate tag**.
- **Source phrase** quote (dashed card) when present.
- **Muscle map**: `BodyMap` with the workout's muscles all at intensity 1, plus i18n muscle chips.
- **Exercises**: name · `sets × reps` · load (kg, converted to lb for imperial via `formatLoad`).
- **30-day history strip**: horizontal scroll of the last 30 days' workouts (new `entriesInRange("workout", …)` in `src/db/entries.ts`), current entry outlined; tap → **preview sheet** (RN built-in `Modal`, bottom card) showing that workout's title/day/duration/kcal-estimate/muscle chips, with "Open this workout" → navigates to its own detail.
- `notFound` fallback like the sibling screens.

### 3. Supporting changes
- `src/db/entries.ts`: new `entriesInRange(type, start, end)` range query (history strips).
- `src/db/seed.ts`: two past workouts (6 & 3 days ago — Push day, Run) so the strip + preview are demoable in Expo Go.
- `src/i18n/locales/en.json`: `workoutDetail.*` block + `muscles.*` (shared with APP-018).

No new deps. No contract change. No backend change. SDK 56 preserved.

## Tests / gates (all green)
- `src/ui/__tests__/BodyMap.test.ts` (pure): front∪back == the 11-muscle vocab; anatomical-side correctness (chest front-only; back/glutes/hamstrings/triceps back-only; shoulders/forearms/calves bilateral); highlight→opacity mapping; clamping; every muscle has ≥1 shape.
- `src/__tests__/workout.test.tsx`: detail renders hero/kcal/exercises/load/i18n muscle chip and both workouts in the 30-day strip; missing-entry fallback.
- Full suite: **64 passed / 64 (14 suites)**. `tsc` clean · `api:check` clean · `expo export` iOS OK.

## How to test in Expo Go (SDK 56, mock mode)
1. `cd app/services/vita-app && npm install && npx expo start` → store Expo Go → onboarding → Home.
2. Timeline shows today's **Leg day** workout → tap it → detail: BodyMap (toggle Front/Back), muscle chips, exercises, and a **Last 30 days** strip with Push day / Run / Leg day.
3. Tap a strip item → preview sheet → "Open this workout" jumps to that one's detail.
4. Or capture: type "Push day 40 min" → the workout confirm card → Confirm → new card in the timeline → tap through.
5. Set Imperial in onboarding → exercise loads show in lb.
