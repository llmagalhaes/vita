# APP-140 — Edit training program (v4.3 §3)

Handoff `docs/v4.3/HANDOFF_v4.3_edit_screens.md` §3, PLAN `R1/R6/R7/R10/R11/R12`.

## What shipped

| File | What |
|---|---|
| `app/(main)/edit-program.tsx` | the route: BuilderShell chrome (`Your training` · `Editing`), title block, session tabs, live map, session card, dirty footer, the shared pick sheet |
| `src/edit/program/draft.ts` | draft parse from the cached doc, `load`, `kcalFor`, `toDoc` (the save spread), `projection` (dirty) |
| `src/edit/program/parts.tsx` | `SessionTabs`, `SessionMap`, `ExerciseRow`, `NothingChanged` |
| `src/workout/exerciseCatalog.ts` | **+`lookup(name)`** — the handoff's `exLook`, nothing else touched |
| `src/i18n/locales/en.json` | `edit.program.*` only (appended inside the `edit` block APP-139 created) |
| `src/edit/program/__tests__/` | `draft.test.ts` (22) + `edit-program.test.tsx` (13) |

## Decisions worth keeping

- **`src` refs, not a rebuild.** Every draft row keeps the `Exercise` it came from;
  `toExercise` is `{...src, ...measure}`. `muscleRoles`, `wholeBody`, `loadKg` and the
  derived `muscles` list therefore survive an edit byte-for-byte — proven by a test
  that `JSON.stringify`s the exercises of an untouched save against the original.
  Only the day re-appends its recomputed `kcalEstimate` (so key ORDER moves there,
  values do not).
- **Muscles: catalog first, saved roles second.** `lookup` wins on name; an exercise it
  misses (a PDF-imported "Supino inclinado com halteres") rebuilds `.9/.45` weights from
  the roles it was SAVED with, so the editor's map matches the Day screen's. Neither →
  `{}` + soft → `not mapped`, painting nothing. Never a guess.
- **ONE doc PUT** (R6). No `MUS`/`EXMU` writes: those are prototype structures — the app
  derives Day/Trends/muscle views from the document through `muscleData`.
- **kcal is scaled, never reinvented**: `round(k0 × l1/l0)`, `load × 1.85` only where
  there was no number, load 0 → the key is dropped rather than left stale.
- **Day check-offs**: one `clearDaySkips()` after save, all sessions. The keys are
  `session + exercise NAME` (not index), so a stale key is inert — but a removed-then-
  re-added exercise would come back pre-ticked. Clearing state that resets at midnight
  anyway is the cheapest correct scope.
- **Save does not block the exit.** `void updateProgram(doc).then(logChanged)` — the kv
  write inside runs synchronously before its first `await`, so the new program is already
  the truth when the screen pops; the PUT completes (or leaves the doc dirty for the next
  sync) on its own. Same pattern as the builder's `finish`.
- **Sessions immutable** (R11): the name is a text node, not an input, plus the footer note.

## Handoff corrections

- **Criterion 27 is wrong as written.** "Remove the Leg curl → hamstrings 1 → .4 (only
  Walking lunges left)" ignores the Romanian deadlift in the same session, which is
  `ha: 1` in `EXCAT`. The map is a MAX, so hamstrings do not move. The test asserts the
  mechanism the criterion is really about (drop the only exercise that owns a muscle →
  the muscle goes dark + its chip goes) on calves, and pins hamstrings as unchanged.

## ponytail

- Tabs scroll horizontally from 4 sessions with **no snap offsets** — tab widths follow the
  session names, so there is no interval to snap to. Add `snapToOffsets` from an `onLayout`
  pass only if free scrolling reads sloppy on a device.
- `KEY_OF_WIRE` is a third private copy of the muscle→key table (`muscleData`, the builder's
  draft, here). Both other copies live in files this ticket must not touch; the vocabulary
  is closed. Export one and delete two when a ticket owns those files.
- `#A05F4A` / `#F0E9DB` are local consts, not tokens: `tokens.ts` belongs to no ticket this
  round and APP-139 needs the same two. Promote them together afterwards.

## Gates

`npx tsc --noEmit` → **0**. `npx jest src/edit/program` → **35/35**. Full suite at close:
**82 suites, 671 passed / 1 skipped, 0 failed** (siblings' work included).

Asana: APP-140 not commented — the workspace's task search is premium-gated and the
v4.3 tickets are not on the frontend board's first page. Orchestrator to close it.
