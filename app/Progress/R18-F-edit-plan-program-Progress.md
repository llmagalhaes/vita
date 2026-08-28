# R18-F — APP-138: the eating plan and the training program can be EDITED

CEO: *"O eating plan e o training programs só permitem importar do 0, não permitem
editar — adicionar uma opção para editar ambos."*

No new editor was built. The v4.2 **builders become the editors**: same screens, same
save path, one route param and two pure reverse converters.

## The flow as shipped

- **Library → "Import or build your plan" sheet** gains a 4th row, *"Edit your plan"*
  (`SheetRow` chrome, sand well + a new hairline `PencilGlyph`). Rendered only when
  `getCachedPlan()` returns a plan — no row rather than a row into an empty builder.
  Subtitle is honest per plan: *"change meals, foods or numbers"*, or, when the plan
  carries options/swaps (a parsed nutritionist PDF), *"rebuilds as a simple plan —
  swaps and options don't carry over"* (`hasSwapsOrOptions`).
- **Workout → `ImportProgramSheet`** gains a 3rd row, *"Edit your program"*, gated on
  `getCachedProgram()`. Nothing is lost on that side: a program holds exactly what the
  builder holds.
- Both push the existing route with `?edit=1`.
  - `/build-plan?edit=1` reads the cached plan ONCE (lazy `useState`) through
    `fromPlanDoc` and opens on **review** — the whole plan on one screen, each card's
    "edit" link reaching its meal. Count phase is still one Back away (reshaping there
    still restarts from a skeleton, as it always did). The plan keeps its own
    `summary` instead of the builder's byline.
  - `/build-program?edit=1` prefills name + days via `fromProgramDoc` and opens on
    **Day A**; the shape phase is one Back away.
- **Finish** is unchanged: `savePlan(…, "manual")` / `saveProgram(…)` → POST → a NEW
  version. The old one stays in the server's history — that is the undo. **No backend
  change.**

## Reverse converters (pure, tested)

`src/build/food/draft.ts` — `fromPlanDoc(doc): BuildMeal[]`

- Reads each meal's **usual** composition (`usualItems`) and each item through the
  effective lens (`effectiveName/Swap/PerUnit`): a chosen usual swap arrives as the
  food it actually is, in its own quantity/unit.
- kcal: the item's own total verbatim when it has one (`kcalEstimated` carried);
  otherwise priced `nutritionPerUnit × quantity` and **marked an estimate**; a swapped
  item is always priced by the contract's equivalence rule, never by the base item's
  raw `kcal` (session-19's bug class). Nothing priceable → empty, never a zero — the
  review screen's estimate pass then offers to fill it.
- **Dropped, deliberately**: meal options (the usual one wins), item swap lists (the
  chosen usual is folded in), macros beyond kcal, micros, portion bounds, `grams`,
  plan `note`/`hydration`/`supplements`, server ids (POST assigns fresh ones).
- `hasSwapsOrOptions(doc)` drives the warning subtitle.
- `toDraft` now omits an empty `unit` instead of writing `""` (round-trip clean).

`src/build/train/draft.ts` — `fromProgramDoc(doc): { name, days }`

- **Catalog wins on name** (`EXCAT`, case-insensitive) — it is deterministic, which is
  why weights never travel on the wire; it also gives back the weights an exercise was
  saved without.
- Off-catalog: weights rebuilt from `muscleRoles` at **primary .9 / secondary .45**
  (either side of `tierOf`'s .7 cut, so a re-save returns the same roles); the arm
  capsule takes the **max** of biceps/triceps/forearms, never a sum.
- `soft` = catalog `whole`, else `wholeBody === true` or "claims no muscles at all"
  (a free-typed entry) — round-trips exactly.
- Family follows the contract's own rule (fields present decide), falling back to the
  catalog's family only when the exercise states no measure.
- `kcalEstimate` comes back **marked an estimate** — the wire keeps no "who typed it"
  flag and the contract calls the field an estimate.
- **Dropped**: `splitDescription`, `loadKg`, the derived `muscles` list (roles are the
  source), any role outside the 10-capsule map.

## Files

- `src/build/food/draft.ts`, `src/build/train/draft.ts` (converters)
- `app/(main)/build-plan.tsx`, `app/(main)/build-program.tsx` (`?edit=1` prefill)
- `src/library/EatingPlanSheet.tsx` (`PencilGlyph`, optional edit row),
  `src/library/sections/EatingPlan.tsx`, `src/workout/ImportProgramSheet.tsx`
- `src/i18n/locales/en.json` — `build.eatingSheet.edit/editSub/editSubLossy`,
  `build.trainingSheet.edit/editSub`
- tests: `build/food/__tests__/draft.test.ts` + `build-plan.test.tsx`,
  `build/train/__tests__/draft.test.ts` + `build-program.test.tsx`,
  `library/__tests__/eating-plan-sheet.test.tsx`,
  `workout/__tests__/import-program-sheet.test.tsx`
  (the two route suites' `expo-router` mocks gained `useLocalSearchParams`)

## Gates

- `npx tsc --noEmit` → **0**
- `npx jest` → **634 passed / 1 skipped, 77 suites, 0 failed** (+26 over the 608
  baseline, siblings' work included)
- New coverage: both converters' round-trips + documented drops, edit-row visibility
  gating (both sheets) + the lossy warning, and both routes' prefill/save.

## Ceilings left on purpose

- Editing a parsed plan through the builder still flattens options/swaps — the sheet
  says so before you go in, and the previous version stays in history.
- The count/shape phase still rebuilds from a skeleton if you change the number of
  meals/sessions mid-edit: that is a reshape, not an edit.
