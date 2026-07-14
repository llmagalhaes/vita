# APP-021 — Wire real plan/program persistence, kill the mock read-back

Asana: Vita frontend `1216519867368576` · slice 3 (F4/F5) of `docs/backlog-local-100.md`.
Standing decision **D5**: plan/program persisted server-side (versioned, encrypted); POST = new version, GET = current, PUT = full-doc replace.

## What was built

Onboarding steps 3–4 now hit the **REAL parse endpoints** and POST the confirmed
draft; Home reads the **persisted** plan/program. The client-side mock read-back
(`summarize()` in PlanStep, `settings.plan/program` strings) is gone.

- **Parse on "Read back"**: `PlanStep` calls `api.parseEatingPlan({text})` /
  `api.parseTrainingProgram({text})`, shows a loading state, then renders the real
  draft's `summary` + bullets (meal names / day names). Calm error state with
  "Try again" / skip. `PlanAnswer` is now generic over the draft and carries it.
- **POST on finish**: `onboarding.finish()` POSTs each confirmed draft via
  `savePlan` / `saveProgram` (kv cache first, then fire-and-forget POST — mirrors
  the existing `patchMe` pattern).
- **Home reads persisted plan/program**: new `SetupRow`s for eating plan (kcal/day
  from `planDailyTotals`) and training program (split), both tappable →
  `/plan` and `/program`. On mount Home hydrates the cache from `GET /plan|/program`
  (`syncPlan`/`syncProgram`); 404/offline keeps the cache (never blows away local
  data on a failed fetch). `settings.plan/program` removed from the Settings type.

## Files
New:
- `src/db/plan.ts` — offline-first cache + `savePlan/saveProgram` (POST),
  `updatePlan/updateProgram` (PUT, used by APP-022/023), `syncPlan/syncProgram` (GET hydrate).
- `src/plan/compute.ts` — pure `itemTotals/mealTotals/planDailyTotals/portionRange`.

Changed:
- `src/api/client.ts` — `Api` gains `parseEatingPlan/parseTrainingProgram`,
  `get/create/updatePlan`, `get/create/updateProgram`; type exports (EatingPlanDraft,
  PlanMeal, PlanItem, TrainingProgramDraft, ProgramDay, Exercise). http impl added.
- `src/api/mock.ts` — `mockParsePlan/mockParseProgram` (canned drafts, items carry
  `nutritionPerUnit`); mock stores plan/program in-memory so GET round-trips after POST/PUT.
- `src/onboarding/PlanStep.tsx` — generic; real parse + loading/error states; `unanswered` const.
- `app/onboarding.tsx` — passes parse fns + bullet extractors; POSTs confirmed drafts on finish.
- `app/(main)/home.tsx` — SetupRow for plan & program; hydrate on mount; **excludes
  `checkin` entries** from the timeline (D1 — surfaced by the contract regen, see below).
- `src/db/settings.ts` — dropped `plan`/`program` fields.
- `src/i18n/locales/en.json` — `planShared.reading/readError/readErrorSub`, `home.trainingProgram/kcalPerDay/days`.

## Step 0 — contract regen
`src/api/types.gen.ts` regenerated from the committed `docs/contracts/vita-api-v0.yaml`.
The contract had advanced past the last app regen: besides the final plan/program surface
it now carries **`/me/vacations` + `VacationRange`** and the **`checkin` entry type +
`CheckinDetail`** (BE-024/BE-025, additive). Pulling them in forced one app fix — Home
excludes `checkin` from its timeline (correct per D1; checkins render in Habits, slice 4).
`api:check` clean after regen.

## Gates
- `tsc` clean · `jest` **87/87 (20 suites)** · `api:check` **exit 0 (clean)** · `expo export` iOS OK · `expo install --check` up to date, SDK 56, no new deps.

## Notes / ponytail
- `savePlan`/`updatePlan` POST/PUT are fire-and-forget; a POST that fails while offline
  isn't retried (cache still shows the plan) — upgrade to an outbox op if plan durability-on-reconnect is ever needed.
- Mock stores the plan in-memory (session-lived) so the round-trip is real; on cold
  start the kv cache from onboarding is the display source (sync 404 keeps it).
