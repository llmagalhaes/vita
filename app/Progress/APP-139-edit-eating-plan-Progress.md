# APP-139 — Edit eating plan (v4.3 §2)

Handoff `docs/v4.3/HANDOFF_v4.3_edit_screens.md` §2/§5/§6, PLAN `R1–R5/R9/R12/R13`.

## What shipped

| File | What |
|---|---|
| `app/(main)/edit-plan.tsx` | the route: BuilderShell chrome (`Your eating plan` · `Editing`), title + live sub, the accordion, `+ Add a meal`, the dirty footer, save → PUT → toast → back |
| `src/edit/plan/draft.ts` | draft from the cached doc (`fromDoc`), pricing (`itemKcal`/`mealKcal`/`totalKcal`), `projection` (dirty), `toSaveDoc` (the src spread + sort-at-save) |
| `src/edit/plan/MealCard.tsx` | one accordion card: header (foods as subtitle, live kcal), name + native time, item rows, `+ Add food` / `Remove meal`, the inline add-food form |
| `src/habits/timeField.tsx` | **+`useTimePicker`** — the OS picker extracted out of `TimeField` so both fields share it (R9: reuse, don't fork). `TimeField` renders identically. |
| `src/i18n/locales/en.json` | `edit.plan.*` only |
| `src/edit/plan/__tests__/draft.test.ts` (8) · `src/__tests__/edit-plan.screen.test.tsx` (4) | |

## Decisions worth keeping

- **`src` refs, not a rebuild.** Every draft meal/item keeps the object it came from and
  the save spreads it. An untouched item is returned as *the same object* (a test asserts
  `toBe`), so `id`, `swaps`, `nutritionPerUnit`, `microsPerUnit`, `portion` and `grams`
  cannot have been reshaped; an untouched option is the same object too; everything
  outside `meals` (summary, status, note, hydration, supplements, micros) rides through.
- **The list is the USUAL composition** (`usualItems`) and an edited item is written back
  **into the option it came from** when `usualOptionIndex` is set. An item inside a
  NON-chosen option is out of editing reach this round — preserved verbatim.
- **An item under a chosen usual swap is `locked`** (amount shown, not editable; removal
  still works). The equivalence lens re-derives per-unit FROM the swap quantity, so
  editing it here would show a number the Day would not agree with. The swap sheet on
  the Day owns that amount.
- **Portion bounds: the server owns them** (see the finding below) — an item whose
  quantity/unit changed is saved WITHOUT `portion`/`grams` (both describe the old
  amount). No client-fabricated ceiling; offline `boundsOf` falls back to `portionRange`
  and the PUT echo brings the recomputed bounds back into the cache.
- **A meal whose composition moved loses its stated `kcal`** (the PDF's transcription of
  the old composition); the Library card then falls back to the computed sum. Untouched
  meals keep it.
- **Add food = the `estimateKcal` seam** (server table → cache → model; on-device table
  offline/mock), stored as `kcal` + `kcalEstimated: true` and priced **per unit** in the
  draft, so a later portion change re-prices proportionally without a second estimate.
  Rendered plain here (no `~`): §2.3's rule for this screen.
- **Sorted at save, never while typing** (`tmOf`, junk → 00:00); `wireTime` reused for
  the wire format; an unparseable time keeps the meal's stored one instead of dropping it.
- **After a successful save, only the `qty` half of today's overlay is cleared**
  (`setOverlay(dayKey(), { qty: {} })`). Skips, swap picks and the option choice are
  decisions about the DAY, keyed by ids the PUT round-trips — they stay (§2.6 table).
- **Dirty = structural compare** of an src-free projection captured at open; undoing an
  edit reads clean again. The clean footer is a block of the same 52px height, not a
  disabled button, so nothing jumps on the first keystroke.

## Known ceilings (deliberate)

- `SOFT_DESTRUCTIVE = "#A05F4A"` is local to `MealCard.tsx` (handoff §6's soft-destructive
  ink, NOT `colors.danger`). APP-140 needs the same value for "Remove from session" —
  fold both into `ui/tokens.ts` when someone is in that file anyway.
- Item names are not editable and items cannot be reordered (§8 — swapping a food is the
  swap sheet's job, and the PDF's order is the reading order).
- Offline: `updatePlan` is cache-first and never throws; a failed PUT leaves the doc dirty
  and the next sync re-pushes it. The screen therefore shows the same toast either way —
  the save IS local. No fake error state.

## Gates

`npx tsc --noEmit` → 0 · `npx jest` → **82 suites, 671 passed / 1 skipped** (includes the
parallel APP-140/141 work in the same tree). Mock walkable: `api/mock.ts` already had
`updatePlan` (id stamping + overlay prune), nothing to add there.
