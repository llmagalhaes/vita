# APP-023 — Training program summary screen

Asana: Vita frontend `1216519867368576` · slice 3 (F4/F5) of `docs/backlog-local-100.md` · **D5**.

## What was built

Program summary screen `app/(main)/program.tsx` with the **same Edit mode** as APP-022,
**reusing the components** (`EditHeader`, `EditableText`, the working-copy `clone`+`mutate`
pattern) rather than re-deriving them.

- **View mode**: title (program summary), split description, day cards with exercise rows
  (name · `sets × reps · load kg`).
- **Edit mode**: every field editable — program title, split, day name, exercise name; and
  **numeric fields for sets / reps / load (kg)** per exercise (dual input). Add/remove
  exercise, add/remove day.
- **Save = whole-program `PUT /v1/program`** via `updateProgram(workingDoc)` — full-doc
  replace (backend re-encrypts the blob). Cancel discards. No history UI (backend-only).

## Files
New: `app/(main)/program.tsx`, `src/__tests__/program-screen.test.tsx`.
Changed: `src/i18n/locales/en.json` (`program.*`).
Reused: `src/plan/editor.tsx`, `src/ui/EditableText.tsx`, `src/db/plan.ts`
(`getCachedProgram`/`updateProgram`), `src/api` (`parseTrainingProgram`/`get`/`create`/`updateProgram`).

## Tests
- Screen: Edit → change reps 8→10 via the numeric field → Save fires **one `updateProgram`
  with the whole doc** (summary present, reps=10), cache updated.

## Gates
- `tsc` clean · `jest` **87/87 (20 suites)** · `api:check` clean · `expo export` iOS OK · SDK 56, no new deps.

## Notes / ponytail
- Program summary (no portion slider — exercises use numeric sets/reps/load, not a single
  "quantity"). The slider stays plan-specific.
- Same minItems edge case as APP-022 for empty days/exercises on a real PUT (fire-and-forget).
