# APP-018 — Workout confirm card + timeline nav (slice 2) — Progress

**Asana:** APP-018 (Vita frontend `1216519867368576`) — "Workout-shaped confirm card (title, duration, kcal estimate, muscle chips, exercises) → entry via outbox; timeline workout cards navigate."
**Backend gate:** none. Consumes existing WorkoutDetail/Exercise/Muscle (contract v0.4.0).

## What was built
1. **Workout confirm card** (`src/capture/CaptureSheet.tsx`, `DraftCard` workout branch):
   already showed title / kcal / estimate-tag / duration chip / muscle chips. Added:
   - muscle chips now render **i18n labels** (`muscles.<enum>` → "Quads", "Glutes", …) instead of raw enum strings.
   - an **exercises list** (name · `sets × reps`) below the chips when the draft carries exercises.
   The confirm→entry path itself is unchanged and already generic — `capture.confirm()` → `addLocalEntry(draft)` → outbox drain. A workout draft therefore creates a workout entry via the existing outbox path with zero new plumbing.
2. **Timeline workout cards navigate** (`app/(main)/home.tsx` `TimelineCard`): the per-kind href is now `/${kind}/${id}` for **every** kind (was meal/water only, workout inert). Clears the last "workout card doesn't navigate" debt. Simplified the now-always-present Pressable (dropped the `disabled`/null-href branch).

## Files changed
- `src/capture/CaptureSheet.tsx` (workout branch: i18n muscle chips + exercises list)
- `app/(main)/home.tsx` (per-kind href incl. workout; Pressable simplified)
- `src/i18n/locales/en.json` (`muscles.*` — 11 labels; shared with APP-019)

No new deps, no contract change, no backend change. SDK 56 preserved.

## Tests / gates (all green)
- New `src/__tests__/workout.test.tsx` "workout confirm card → confirm writes a workout entry via the outbox": types "Leg day … 45 minutes" → asserts the workout-shaped card (title/estimate/`45 min`/`Quads`), nothing logged pre-confirm, then Confirm writes one `workout` entry whose `detail.muscles` includes `quads`, and the outbox drains to 0.
- Full suite: **64 passed / 64 (14 suites)**. `tsc` clean · `api:check` clean · `expo export` iOS OK.

## Notes
- Mock parse produces `exercises: []` for parsed workouts, so the exercises list is empty on a live capture; it shows for seed/real-backend workouts that carry exercises. Kept anyway (cheap, correct when present).
