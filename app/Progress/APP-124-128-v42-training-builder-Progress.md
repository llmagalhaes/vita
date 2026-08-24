# APP-124…128 — v4.2 training builder (`bwOn`)

Session 24, wave 1, builder B. Source: `docs/v4.2/HANDOFF_v4.2_manual_setup.md` §3/§4/§5/§6
(criteria 14–23), `docs/v4.2/app-plan.md` §B/§C, `docs/v4.2/PLAN.md` (R1, Round-16 #4).

## Files

| File | Ticket | What |
|---|---|---|
| `app/(main)/build-program.tsx` | 124/125/128 | The route: `shape → days`, the back ladder, finish → `saveProgram` |
| `src/build/train/parts.tsx` | 124/125/127 | `ShapePhase`, `MuscleMapCard`, `DayCard` (+ `FamilyBadge`, `Eyebrow`) |
| `src/build/train/draft.ts` | 128 | `BwDay`/`BwExercise`, `dayLetter`, `rolesOf`, `toProgramDraft`, `resizeDays` |
| `src/workout/PickExerciseSheet.tsx` | 126 | `bwPick`, both stages |
| `src/build/train/__tests__/draft.test.ts` | 128 | 10 tests — the pure conversion |
| `src/build/train/__tests__/build-program.test.tsx` | 124–127 | 10 tests — the route end to end |

Consumed unchanged: `src/build/parts.tsx` (`BuilderShell`, `CountChips`, `PhaseQuestion`),
`src/workout/exerciseCatalog.ts` (`EXCAT`, `coverage`, `mfill`, `dominant`, `search`),
`src/muscle/BodyMap.tsx` (`labels` + `fill`), `src/db/plan.ts` `saveProgram`, `SheetOverlay`,
`en.json` `build.program.*`.

## Decisions

- **One state owner.** Every `bw*` field of handoff §4 lives in the route; the parts are views
  and the sheet owns only its own two stages. No context, no store — the screen is one tree.
- **`wholeBody` is derived, not a second flag.** The handoff's builder shape carries `soft` only.
  A catalog whole-body activity has weights *and* `soft`; a free entry has `soft` and no weights.
  So `soft && roles.length > 0` is exactly "catalog whole-body" — the free entry omits both
  `muscleRoles` and `wholeBody` and claims nothing (criterion 21).
- **The `~kcal` seam (Round-16 #4 / APP-135).** `BwDay.kcal?: string` and `toProgramDraft` already
  emits `ProgramDay.kcalEstimate` from it. Wave 2 adds the field and the estimate button; nothing
  in the conversion has to change.
- **Chip order is `MUSCLE_KEYS`**, per `app-plan.md` §B (the handoff names `MGN` order; the plan
  reconciled it to the app's vocabulary order, which is what Trends and the sheet already use).
- **`.7` cut reuses `muscleData.tierOf`** rather than a second literal — the badge, the stat and
  the builder's roles cannot drift apart.

## Deviations / notes

- `CountChips` hardcodes radius 20; the handoff says 19 for the session chips. Foundation file,
  read-only for this builder — 1px, left alone.
- The pick sheet's catalog list uses a fixed `maxHeight: 300` rather than measuring 78 % of the
  window (`ponytail:` comment in place). Revisit in APP-133 if it reads short on the Samsung.
- `PopHost` renders portalled nodes as an unkeyed array, so any test mounting a sheet through it
  logs React's "unique key prop" warning. Pre-existing and structural in `src/ui/popHost.tsx`;
  not touched here (shared foundation).
- No i18n key was missing — `build.program.*` covered every string, `dayKcal*` included.

## Gates

`npx tsc --noEmit` → 0. `npx jest` → **75 suites, 574 passed / 1 skipped**, first run, no reruns.
