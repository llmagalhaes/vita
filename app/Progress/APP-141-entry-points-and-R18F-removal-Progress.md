# APP-141 — v4.3 entry points + R18-F removal + mock PUTs

Model: Opus · session 25 (v4.3 build round) · specs: `docs/v4.3/HANDOFF_v4.3_edit_screens.md` §1/§5/criteria 1–4, `docs/v4.3/PLAN.md` R8 + R13

## Shipped

### 1. The two-button card rows (§1.1 / §1.2)

Both Library cards now weight editing over importing, but only when there is
something to edit:

| Card | With a doc | Without one |
|---|---|---|
| Eating plan | `Edit this plan` (tinted, flex 1.25, 13.5/700) → `/edit-plan` · `Import or build` (outline, flex 1, 12.5/700) → the same `mpSheet` | the v4.2 single `Import or build your plan` button, untouched |
| Training programs | `Edit these sessions` → `/edit-program` · `Import or type` → the same `ImportProgramSheet` | the v4.2 single `Import or type a program` button |

Row = `flexDirection:"row", gap:8` around the existing `PillButton`, which gained
ONE optional prop (`fontSize`, default 13) — `tone="tinted"` already IS
`accent 12% / ink accent` and `tone="ghost"` already IS
`1.5px rgba(120,100,75,.16) / ink #6E6355`, so the spec's two styles needed no new
component and no new tokens. Height stays the shared 44 → radius 22.

Import behaviour is byte-identical: same sheet, same three routes, same
`importPdf` handoff (criterion 3).

### 2. R18-F removed — the builders are builders again

Deleted, with a repo-wide grep proving nothing references them any more:

- `EatingPlanSheet`: the `onEdit` / `editLossy` props and the 4th `SheetRow`; the
  `PencilGlyph` export (its only two callers were that row and the training one).
- `ImportProgramSheet`: the edit row + its `getCachedProgram` import.
- `app/(main)/build-plan.tsx` / `build-program.tsx`: the `?edit=1` seed modes,
  `useLocalSearchParams`, and the "keep the edited plan's own summary" branch.
- `src/build/food/draft.ts`: `hasSwapsOrOptions`, `itemToBuild`, `fromPlanDoc`
  (and the now-unused `plan/compute` imports).
- `src/build/train/draft.ts`: `KEY_OF_WIRE`, `CAT`, `weightsOf`, `fromExercise`,
  `fromDay`, `fromProgramDoc` (and the now-unused `EXCAT` / `ProgramDay` imports).
- `en.json`: `build.eatingSheet.edit|editSub|editSubLossy`,
  `build.trainingSheet.edit|editSub`.

KEPT because they still have callers: `wireTime`, `toDraft`, `saveEdit`,
`mergeEstimates`, `emptySlots` (food); `rolesOf`, `toExercise`, `toProgramDraft`,
`resizeDays`, `workoutKcalBody`, `BwExercise`/`BwDay` (train — APP-140's
`src/edit/program/draft.ts` imports `rolesOf` + `BwExercise` from here).

New keys: `library.plan.editButton|importButton`,
`library.programs.editButton|importButton` (§5 copy verbatim).

### 3. Mock PUTs (R13) — already correct, verified not rewritten

`createMockApi().updatePlan` / `.updateProgram` existed and already mirror the
server, so this ticket changed nothing in `src/api/mock.ts`:

- **updatePlan**: 404 when no plan (→ `db/plan.pushPlan` falls back to POST),
  else `stampPlanIds(doc, maxItemId(storedPlan))` — round-tripped `it-N`/`m-N`
  ids are preserved verbatim and only id-less (newly added) items get
  `it-{max+1}…`, which is exactly `PlanService.decorate(assignFreshIds = false)`
  ("on PUT preserve valid round-tripped ids … and assign it-{max+1} to the
  rest"). The stored doc is replaced and echoed back; the portions overlay is
  pruned through the shared `pruneOverlayAfterEdit`.
- **updateProgram**: 404 when none, else replace + echo. Programs carry no ids
  in the contract (days and exercises are name-keyed), so there is nothing to
  preserve beyond the doc itself.

Editors are therefore walkable in mock: build/import once (POST seeds
`storedProgram`), then edit → PUT → the echo lands in the cache.

## Tests

- `library/__tests__/eating-plan-sheet.test.tsx` — the old "Edit your plan"
  describe replaced by "the two-button row": absent with no plan, `/edit-plan`
  on press, import still opens the sheet, and no `/build-plan?edit=1`.
- `workout/__tests__/import-program-sheet.test.tsx` — same shape for the
  Programs card (renders `<Programs/>`), plus "the sheet no longer carries an
  edit row".
- `build/food/__tests__/build-plan.test.tsx`, `build/train/__tests__/build-program.test.tsx`
  — the `edit mode` describes replaced by one regression test each: a saved doc
  plus a stale `?edit=1` still opens the empty count/shape phase.
- `build/{food,train}/__tests__/draft.test.ts` — the reverse-converter describes
  deleted with the converters.

## Gates

`npx tsc --noEmit` → **0** · `npx jest` → **77 suites, 622 passed / 1 skipped**.

## Notes

- The no-doc case deliberately keeps the LONGER v4.2 label ("Import or build
  **your plan**"): alone on the card it is the whole call to action, while the
  §5 short label only reads right next to the Edit button.
- Nothing else in the app linked to `/build-plan?edit=1`; `plan.tsx`'s own
  `?edit=1` is an unrelated, still-live param (Plan Setup's "Fix something").
